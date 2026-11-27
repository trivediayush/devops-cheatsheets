# ⚙️ Container Internals — How It Actually Works

**"Docker" isn't magic — it's Linux namespaces + cgroups + a filesystem trick.** Understanding this layer is the difference between debugging a container issue and guessing at it.

---

## **1. The Three Linux Ingredients**

| Mechanism | Job | Kernel feature |
| --- | --- | --- |
| **Namespaces** | Isolation — what the process *sees* | `mount, net, pid, uts, ipc, user, cgroup, time` |
| **cgroups** | Limits — what the process *gets* (CPU, memory, IO, PIDs) | cgroup v2 unified hierarchy |
| **OverlayFS** | Filesystem — layered image stack as one view | union mount filesystem |

A container = a normal process started with `clone()` namespace flags + cgroup limits + an overlay mount as its rootfs. No hypervisor, no guest kernel. That's the whole trick.

```bash
lsns                        # see the namespaces your containers create
lsns -p <container-pid>
nsenter -t <pid> -n         # step inside a container's network namespace
cat /proc/<pid>/cgroup      # which cgroups it belongs to
```

---

## **2. Namespaces — Each One, With the Gotcha**

| Namespace | Isolates | Production gotcha |
| --- | --- | --- |
| `mnt` | Mount table — container sees its own `/` | `hostPath` mounts punch holes through it |
| `net` | Interfaces, IPs, iptables, route table | Container "localhost" ≠ host localhost — binding to `127.0.0.1` breaks external access |
| `pid` | Process tree — container's PID 1 | PID 1 doesn't reap zombies or get default signals → use `--init` (tini) |
| `uts` | Hostname/domainname | Trivial — but explains why pods have pod-name hostnames |
| `ipc` | Shared memory, semaphores | `shareProcessNamespace: true` in K8s merges this between containers |
| `user` | UID/GID mapping | **Rootless containers** — UID 0 inside maps to unprivileged UID outside |
| `cgroup` | View of cgroup filesystem | K8s `requests/limits` live here |
| `time` | System clock offset | Rarely used — clock is still shared |

```bash
unshare --net --pid --mount --fork bash    # DIY "container" in one command
ip netns add test && ip netns exec test ip link   # named net namespace
```

---

## **3. cgroups v2 — The Limit Machinery**

```text
/sys/fs/cgroup/<slice>/<container>/
  cpu.max          → "200000 100000" = 2 cores quota per 100ms period
  cpu.stat         → nr_throttled, throttled_usec  ← THE throttling metric
  memory.max       → hard memory limit → OOMKill on breach
  memory.current   → current usage
  memory.events    → oom, oom_kill counters
  pids.max         → fork-bomb protection
  io.max           → IO bandwidth limits
```

**Q: App throttled while node CPU is idle?**
A: `cpu.max` quota is time-budget based, not core-count based — hitting `limits.cpu: 500m` throttles at half a core regardless of idle capacity. Check `cpu.stat.nr_throttled`. This is the #1 hidden cause of "random" K8s latency.

**Q: Memory limit hit → what exactly happens?**
A: cgroup OOM-killer (not node OOM) kills the process → container exits `137`. Node-level OOM (all containers + system compete) is a different, rarer event.

---

## **4. The Runtime Stack — Who Does What**

```text
docker CLI
  → containerd  (image pull, unpack, snapshot management — the "container engine")
    → runc      (OCI runtime spec: creates namespaces/cgroups, execs your process)
      → your process
```

| Component | Role | Where you meet it |
| --- | --- | --- |
| **OCI Image spec** | Image format (manifest + layers + config) | Any `docker pull` result |
| **OCI Runtime spec** | How to start a container (config.json + rootfs) | `runc`, `crun` |
| **containerd** | Daemon: pulls, stores, runs images via runc | `ctr`, `nerdctl` CLIs |
| **runc / crun** | The actual process spawner (C vs C++ impls) | Invisible — until it crashes |
| **CRI-O** | Kubernetes-native containerd alternative | OpenShift default |
| **K8s CRI** | Kubelet ↔ containerd/CRI-O via gRPC | "container runtime" choice in K8s |

> [!NOTE]
> **Docker (the product)** = CLI + BuildKit + containerd + nice UX. **Kubernetes doesn't need Docker** — it uses containerd/CRI-O directly via the CRI. That's why "dockershim removal" changed nothing about images.

```bash
crictl ps                     # CRI-level containers on a K8s node
ctr -n k8s.io images ls       # images containerd knows about
runc list                     # running containers at the runtime level
docker inspect <id> | grep -i runtime
```

---

## **5. Image Anatomy — Layers, Manifests, Digests**

```text
image.tar = manifest.json + config.json + layer1.tar.gz + layer2.tar.gz ...
```

* Each Dockerfile instruction that changes the fs (`RUN`, `COPY`, `ADD`) → one **layer** (content-addressed by hash — that's the cache).
* **Manifest** = which layers + config (env, cmd, user). **Image digest** = hash of the manifest — the *real* identity.
* `tag` (`:latest`) is a mutable pointer; `digest` (`@sha256:...`) is immutable. **Pin by digest in prod.**
* Multi-arch images = manifest *list* pointing to per-arch images (`docker buildx` produces them).

```bash
docker image inspect <img> | jq '.[0].RepoTags, .[0].RepoDigests'
docker history <img>               # see layer sizes
dive <img>                         # interactive layer explorer — find bloat
crane digest <img>                 # digest without pulling
```

**Layer gotcha:** `RUN apt-get install foo` then a later `RUN rm foo` — the data is *still in the image* (earlier layer). Secrets `COPY`d then deleted are still extractable from layer history. Delete secrets in the same layer or use BuildKit secrets (`--mount=type=secret`).

---

## **6. OverlayFS — The Copy-on-Write Trick**

```text
lowerdir = image layers (read-only, shared between containers)
upperdir = container's writable layer
merged   = what the container sees
```

* Shared lower layers = why 100 nginx containers don't cost 100× storage.
* Writes go to the thin upper layer → slow for write-heavy workloads (DBs should use volumes, which bypass overlay).
* `docker system df` shows the real overlay accounting.

---

## **7. Isolation Gaps — What Containers DON'T Isolate**

| Shared with host | Implication |
| --- | --- |
| **Kernel** | Kernel exploits escape the container; all containers share syscall surface → seccomp/AppArmor exist |
| **Kernel subsystems** | `/proc`, `/sys` values are host's (containers see host CPU/mem unless tools fake it — JVM/Go used to misread this) |
| **Clock** | One wall clock, no time isolation |
| **Capabilities** | `CAP_SYS_ADMIN`, `CAP_NET_ADMIN` ≈ root on the host. `--privileged` = no isolation at all |
| **User namespace** | Container `root` = host `root` by default (UID 0 inside = UID 0 outside) → use `USER` + rootless |

```bash
# Quick isolation audit
docker inspect <img> | jq '.[0].Config.User'          # empty = running as root!
docker inspect <id> | jq '.[0].HostConfig.Privileged'
```

**The mental model for interviews:** VM = hardware virtualization (separate kernel, real isolation). Container = process virtualization (shared kernel, namespace isolation). Container on VM = belt + suspenders — the standard cloud model.

---

## **8. Rootless & User Namespaces**

```bash
# Docker rootless mode
dockerd-rootless-setuptool.sh install

# Check the UID mapping
cat /etc/subuid /etc/subgid          # "alice:100000:65536" = UIDs 100000-165535 map to container 0-65535
```

Inside a rootless container, "root" is host UID 100000 — even a container escape lands as an unprivileged user. Podman does this by default; Docker needs `userns-remap` or rootless mode. This is why Podman is the default on RHEL/Fedora.

---

## 📚 **Learning Resources**

* 🔗 [Containers from Scratch — Liz Rice talk/code](https://github.com/lizrice/containers-from-scratch)
* 📦 [OCI Specifications](https://github.com/opencontainers)
* 🛠️ [containerd docs](https://containerd.io/docs/)
* 🧪 [dive — image layer explorer](https://github.com/wagoodman/dive)
