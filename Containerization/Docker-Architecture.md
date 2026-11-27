# 🐋 Docker Architecture — Internals Deep Dive

**How the pieces fit under `docker run`.** Docker (the product) is a stack of daemons and protocols — knowing the layers explains every weird behavior, from `docker.sock` security to why builds changed in BuildKit.

---

## **1. The Daemon Stack**

```text
docker CLI ──(REST API over /var/run/docker.sock)──► dockerd
                                                       │
                                            containerd (runs as separate daemon)
                                                       │
                                               runc ──► your container process
```

| Component | Role | Notes |
| --- | --- | --- |
| **dockerd** | Docker daemon: API server, image mgmt, networks, volumes, auth | Talks to containerd over gRPC |
| **containerd** | Container lifecycle: pull/unpack images, manage snapshots, spawn runc | Also what K8s uses directly (CRI) |
| **runc** | OCI runtime — creates namespaces/cgroups, `exec`s your process | Replaced by `crun` in some stacks |
| **containerd-shim** | Per-container parent — lets containerd/runc restart without killing containers | Why `docker` CLI exiting doesn't kill the container |
| **BuildKit** | Build engine — parallel, cache-aware Dockerfile executor | `DOCKER_BUILDKIT=1` (default in modern Docker) |

**Q: Why does a container keep running if dockerd restarts?**
A: The shim — containerd-shim is the container's actual parent. daemon dies → shim keeps the process alive → daemon reconnects on restart.

```bash
systemctl status docker containerd       # two daemons, both real
ps aux | grep -E "shim|runc"             # shim per container
docker info                              # storage driver, Cgroup version, registry mirrors
```

---

## **2. `/var/run/docker.sock` — The Security Bomb**

Mounting the Docker socket inside a container gives that container **root-equivalent control of the host** — it can create privileged containers mounting `/`. It's how Traefik/portainer/watchtower work, and it's a full privilege-escalation path.

```bash
# ❌ effectively "root inside a container" when needed for tooling
docker run -v /var/run/docker.sock:/var/run/docker.sock portainer/agent

# ✅ safer: rootless daemon, remote socket with auth, or API-only proxies
DOCKER_HOST=tcp://host:2376 --tlsverify
```

---

## **3. BuildKit — Modern Build Internals**

```bash
# Inspect the builder
docker buildx ls
docker buildx create --name multi --use    # multi-arch capable builder

# Build for multiple architectures and push (produces a manifest list)
docker buildx build --platform linux/amd64,linux/arm64 -t reg/app:1.0 --push .

# Cache strategies for CI
docker buildx build --cache-from type=registry,ref=reg/app:cache \
                    --cache-to   type=registry,ref=reg/app:cache,mode=max .
```

| BuildKit feature | Why it matters |
| --- | --- |
| **Parallel stages** | Independent Dockerfile stages build concurrently — big speedup |
| `--mount=type=cache` | Persistent dep caches (npm/pip/go) *outside* image layers — no `npm ci` every build |
| `--mount=type=secret` | Secrets injected at build time, never land in layers |
| `--mount=type=ssh` | Forward SSH agent for private git clones — no keys in image |
| Cache backends | `inline`, `registry`, `local`, `gha` (GitHub Actions), `s3` |

```dockerfile
# syntax=docker/dockerfile:1
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci
```

---

## **4. Docker Networking — The Drivers**

| Driver | What it does | Use |
| --- | --- | --- |
| `bridge` (default) | Private NAT network `docker0` — containers get 172.17.x.x, port-mapped | Single-host dev |
| `host` | Shares host network namespace directly | Perf; no port mapping, port conflicts possible |
| `none` | No networking | Lockdown / manual netns |
| `overlay` | VXLAN mesh across Docker/Swarm hosts | Multi-host (Swarm); K8s uses CNI instead |
| `macvlan` | Container gets real IP on physical LAN | Legacy apps needing L2 presence |
| `ipvlan` | Like macvlan, shares parent MAC | Where MAC limits exist |

```bash
docker network create app-net
docker run -d --network app-net --name api api:latest
docker run -d --network app-net --name web web:latest   # web → http://api:port works (embedded DNS @127.0.0.11)
docker network inspect app-net
```

**The DNS trick:** on user-defined bridges, Docker runs embedded DNS (`127.0.0.11`) resolving container names. On the default `docker0` bridge you need `--link` (legacy) or IPs — always use named networks.

---

## **5. Storage Drivers — Where Layers Live**

```bash
docker info | grep -i "storage driver"   # overlay2 on modern Linux
docker system df                          # image/container/volume disk usage
docker system df -v                       # per-resource breakdown
ls /var/lib/docker/overlay2/             # the actual layer dirs
```

* `overlay2` — the standard; each image layer is a dir stacked via OverlayFS (see `Container-Internals.md`).
* Volumes (`/var/lib/docker/volumes`) bypass the copy-on-write layer — why DBs use them (perf + persistence).
* `docker system prune -a --volumes` — reclaim space (destructive: kills unused images AND volumes).

---

## **6. Registry Protocol — How Pull/Push Works**

```text
docker pull nginx:1.25
  → registry: GET /v2/library/nginx/manifests/1.25     (manifest = layer digests + config)
  → GET /v2/library/nginx/blobs/sha256:<layer1>        (each layer content-addressed)
  → unpack layers → snapshot → image ready
```

* Layers deduplicate globally by digest — pull 10 images on the same base and the base downloads once.
* `docker pull img@sha256:abc…` pins by digest — immutable reference, use in prod.
* Private registries: `docker login` stores creds in `~/.docker/config.json` (base64 — use a credential helper).
* Registry mirrors / pull-through cache (Harbor, ECR pull-through, `registry-mirrors` in daemon.json) — saves bandwidth + air-gap strategy.

```bash
# Inspect/copy images without pulling — skopeo
skopeo inspect docker://nginx:1.25 | jq '.Digest'
skopeo copy docker://src.com/img:1 docker://dst.com/img:1
```

---

## **7. dockerd Configuration — `daemon.json`**

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "storage-driver": "overlay2",
  "registry-mirrors": ["https://mirror.internal"],
  "insecure-registries": ["registry.internal:5000"],
  "default-ulimits": { "nofile": { "Hard": 65536, "Name": "nofile", "Soft": 65536 } },
  "live-restore": true,
  "metrics-addr": "0.0.0.0:9323"
}
```

`live-restore` = containers survive daemon restarts (via shims — see §1). `insecure-registries` = plain-HTTP registries (lab/air-gap only).

---

## **8. The Log Pipeline**

`stdout`/`stderr` → dockerd's log driver → `json-file` (default, rotates per `log-opts`) or shipped out via `fluentd`/`syslog`/`gelf`/`awslogs`. `docker logs` reads json-file — **don't write app logs to files inside the container**; 12-factor says stdout. Sidecar/DaemonSet collectors (Fluent Bit) scrape node log dirs in K8s instead.

---

## **9. `docker run` — The Complete Flow**

```text
docker run -d --name api -p 8080:80 nginx
     │
     ▼
docker CLI ──HTTP──► dockerd (unix:///var/run/docker.sock)
     │
     ├── image present? ──no──► registry pull (see §11)
     │
     ▼
dockerd → containerd: "create container"
     │
     ▼
containerd:
  1. unpack image layers → overlayfs snapshot
  2. generate OCI spec (bundle): namespaces, cgroups,
     mounts, env, args, seccomp profile
     │
     ▼
containerd-shim spawns runc with the bundle
     │
     ▼
runc:
  1. clone() with 6 namespaces (mnt/uts/ipc/pid/net/user)
  2. apply cgroup limits (cpu.max, memory.max)
  3. pivot_root into container rootfs
  4. drop capabilities, apply seccomp
  5. exec the container's PID 1 → runc exits
     │
     ▼
containerd-shim = the container's parent (keeps it alive
if dockerd restarts — "daemonless containers")
     │
     ▼
iptables DNAT: :8080 → container :80  (for -p)
```

**Why shim matters:** `systemctl restart docker` does NOT kill containers — the shim holds them. This is also why `docker update` works on running containers.

---

## **10. Image Pull Flow — Layers, Dedup, Digests**

```text
docker pull nginx:1.25
     │
     ▼
registry → manifest list (index.json)
     │        amd64/arm64/... pick your platform
     ▼
image manifest → config blob + ordered layer digests
     │
     ├── layer sha256:abc... already in content store? skip
     ├── layer sha256:def... already pulled by another image? skip
     └── new layers → download tar.gz blobs → verify digest
     │
     ▼
containerd content store (blobs) → snapshotter (overlayfs)
     │
     ▼
lower1:lower2:...:lowerN + empty upper → container rootfs ready
```

```text
Image A:  [layer1][layer2][layer3]     ┐
Image B:  [layer1][layer2][layer4]     ├─ layer1+2 stored ONCE
Image C:  [layer1][layer5]             ┘  = dedup by digest
```

```bash
docker inspect nginx:1.25 --format '{{.RepoDigests}}'
docker system df -v                # where space actually goes
crictl images                      # what the runtime sees (K8s nodes)
```

---

## **11. BuildKit Build Flow — Graph, Not Lines**

```text
Dockerfile ──► BuildKit frontend parses to LLB (low-level builder graph)
     │
     ▼
   ┌─────────┐    ┌──────────┐
   │ FROM img│    │ RUN deps │     DAG — independent steps
   └────┬────┘    └────┬─────┘     run IN PARALLEL
        │              │
        └──────┬───────┘
               ▼
        ┌────────────┐
        │ COPY + RUN │     cache key = (parent layer + instruction
        └─────┬──────┘     + file checksums) → cache hit? reuse.
              ▼
        export: image | tar | registry push
```

```bash
# See the graph + cache state:
docker buildx du --verbose         # cache usage breakdown
docker buildx build --progress=plain .   # full step log

# Multi-arch in one command (manifest list):
docker buildx build --platform linux/amd64,linux/arm64 \
    -t reg.local/app:1.0 --push .
```

**Cache-killers:** `COPY . .` early in the Dockerfile (any file change busts everything below), `ADD` with remote URLs, `apt-get update` merged into one layer with install.

---

## **12. Container Networking — Packet Walk**

```text
docker run -p 8080:80 nginx

INBOUND (external client → container):
client ──► host eth0:8080
     │
     ▼ iptables DNAT (DOCKER chain)
docker0 bridge ──► veth pair ──► container eth0:80

OUTBOUND (container → internet):
container eth0 ──► veth ──► docker0 (172.17.0.1, the gateway)
     │
     ▼ iptables MASQUERADE (SNAT to host IP)
host eth0 ──► internet
```

```text
┌──────────── HOST ────────────┐      ┌──── CONTAINER netns ────┐
│  docker0 bridge 172.17.0.1   │      │                         │
│       │                      │      │   eth0 172.17.0.2       │
│  vethX ◄────────────────────►│ veth │      │                  │
│       │                      │      │      ▼                  │
│   iptables/nftables          │      │   nginx :80             │
│   (DOCKER chains, MASQ)      │      │                         │
│       │                      │      └─────────────────────────┘
│  eth0 (host IP) ──► world    │
└──────────────────────────────┘
```

```bash
docker network inspect bridge            # subnet, connected containers
ip link show type veth                   # host side of each container pair
iptables -t nat -L DOCKER -n             # the actual port-forward rules
nsenter -t <pid> -n ip addr              # see container's network from host
```

**The gotcha:** `-p` publishes via iptables DNAT — it **bypasses `ufw`/`firewalld` INPUT rules**. A "firewalled" host can still have exposed containers. Restrict with `-p 127.0.0.1:8080:80` or DOCKER-USER chain.

---

## **13. Volume & Mount Data Path**

```text
docker run -v /host/data:/container/data app
     │
     ▼ OCI spec mount entry
container mount ns sees /container/data → bind-mounted to /host/data
     │
     ▼ same inode, same filesystem — writes go straight through
     (no copy, no translation — it's literally the same directory)

docker run -v myvol:/data app
     │
     ▼ named volume → /var/lib/docker/volumes/myvol/_data
     (docker-managed dir, lifecycle survives container rm)
```

| Mount type | Host path | Use for |
| --- | --- | --- |
| `bind` | you pick (`/host/data`) | dev mounts, config files, logs |
| `volume` | `/var/lib/docker/volumes/*` | data that should outlive the container |
| `tmpfs` | RAM only | secrets, scratch — gone on stop |

```bash
docker inspect <c> --format '{{json .Mounts}}' | jq
docker run --rm -v myvol:/v alpine tar czf - -C /v . > backup.tgz   # backup a volume
```

---

## **14. Exec, Logs & Stop — The Lesser Flows**

**`docker exec` joins existing namespaces:**

```text
docker exec -it api sh
     │
     ▼ dockerd → containerd → shim
setns() into the container's namespaces → spawn /bin/sh
     │
     └── exec'd process does NOT affect container PID 1
         (kill the exec'd shell → container keeps running)
```

**Log pipeline:**

```text
container stdout/stderr → shim FIFO → dockerd
     │
     ├── json-file driver → /var/lib/docker/containers/<id>/*-json.log
     │    └── docker logs reads this file
     │    └── ⚠️ unrotated json-file fills disks — set max-size!
     ├── journald / syslog / fluentd drivers → external systems
     └── "docker logs empty?" → app logged to a file inside, not stdout
```

**Stop semantics:**

```text
docker stop api
     │
     ├── SIGTERM to PID 1 ──► app has stop_grace_period (10s default)
     │       to flush, close connections, exit clean
     │
     └── still alive? → SIGKILL (can't be caught, instant death)

# PID 1 must forward signals — a shell script that doesn't `exec`
# the real binary swallows SIGTERM = "stop takes 10s then SIGKILL"
ENTRYPOINT ["/bin/sh","-c","exec /app/server"]   # the fix
```

---

## 📚 **Learning Resources**

* 🔗 [Docker Engine Architecture](https://docs.docker.com/engine/docker-overview/)
* 📦 [containerd Project](https://containerd.io/)
* 🛡️ [BuildKit Docs](https://docs.docker.com/build/buildkit/)
* 🧰 [skopeo](https://www.redhat.com/en/topics/containers/what-is-skopeo) — registry operations without a daemon
