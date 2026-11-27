# 🦭 Podman Cheatsheet

<!-- <p align="center"><img src="https://cdn.simpleicons.org/podman" height="90"></p> -->


**Podman** (Pod Manager) is a daemonless, open-source Linux tool designed for developing, managing, and running OCI containers and pods. Because it operates without a background root daemon, Podman is the premier engine for secure, **rootless** container workloads.

---

## **1. Core Architecture & Key Concepts**

| Concept | Description |
| --- | --- |
| **Daemonless Architecture** | Podman commands execute directly as child processes of the user shell using the fork-exec model. |
| **Rootless by Default** | Runs containers entirely without root privileges using Linux user namespaces (`subuid` / `subgid`). |
| **Podman Pods** | Groups of containers sharing IPC, network, and PID namespaces (identical to Kubernetes Pods). |
| **Quadlet** | Declarative systemd unit file generator (`.container`, `.pod`) for running production containers under systemd. |

---

## **2. Installation Quickstart**

```bash
# Fedora / RHEL 8/9
sudo dnf install -y podman

# Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y podman

# Verify version and rootless mode
podman info
```

---

## **3. Basic Container Operations**

Podman CLI syntax is directly compatible with Docker:

```bash
# Run a rootless container with port forwarding
podman run -d --name web -p 8080:80 nginx:alpine

# List active containers
podman ps

# Execute an interactive shell
podman exec -it web sh

# Inspect container IP and configuration
podman inspect web

# View container logs
podman logs -f web

# Stop and remove container
podman stop web
podman rm web
```

---

## **4. Podman Pods (Multi-Container Grouping)**

Pods allow multiple containers to share the same localhost network:

```bash
# 1. Create a Pod with published ports
podman pod create --name web-pod -p 8080:80

# 2. Add an Nginx container to the pod
podman run -d --pod web-pod --name web-frontend nginx:alpine

# 3. Add an API container to the same pod (can talk to frontend via localhost)
podman run -d --pod web-pod --name api-backend my-api:latest

# 4. List all pods and their running container counts
podman pod ps

# 5. Stop and delete the entire pod
podman pod stop web-pod
podman pod rm web-pod
```

---

## **5. Kubernetes YAML Integration: `generate kube` & `play kube`**

Podman can run and export standard Kubernetes manifests directly without needing a Kubernetes cluster:

```bash
# Generate a Kubernetes Pod YAML from an existing running Podman pod
podman generate kube web-pod > pod.yaml

# Run an existing Kubernetes Pod manifest directly on your local machine
podman play kube pod.yaml

# Tear down the containers created from the Kubernetes manifest
podman play kube --down pod.yaml
```

---

## **6. Modern systemd Integration: Quadlet (Podman 4.4 - 5.x)**

> [!TIP]
> **Modern Standard**: Quadlet replaces legacy `podman generate systemd`. Create simple `.container` unit files and let systemd manage the container lifecycle.

File: `~/.config/containers/systemd/webapp.container`:

```ini
[Unit]
Description=Production Web Service
After=network-online.target

[Container]
Image=docker.io/library/nginx:alpine
PublishPort=8080:80
AutoUpdate=registry

[Install]
WantedBy=default.target
```

Manage via systemd:

```bash
# Reload user systemd daemon
systemctl --user daemon-reload

# Start and enable the service
systemctl --user enable --now webapp.service

# Check service status
systemctl --user status webapp.service
```

---

## **7. Modern Rootless Networking (Pasta & Netavark)**

Podman 5.x defaults to **`pasta`** for user-mode networking and **`Netavark`** as the network stack:

* **High Performance**: Delivers significantly higher network throughput and lower CPU overhead than legacy `slirp4netns`.
* **Port Forwarding**: Preserves original client IP addresses on inbound packets.

---

## **8. Docker Compatibility Alias**

Podman provides a drop-in wrapper package or shell alias:

```bash
# Install docker alias package (RHEL/Fedora)
sudo dnf install podman-docker

# Or add to ~/.bashrc
alias docker=podman
```

---

## **9. Rootless Internals — How It Actually Works**

Podman runs each container as a child of your shell (no daemon), inside a **user namespace** where "root" maps to an unprivileged host UID.

```bash
cat /etc/subuid              # "alice:100000:65536" = container UID 0 → host UID 100000
podman unshare id            # prove it: inside the userns you're "root", outside you're you
podman top <c> user huser    # container user vs host user mapping
```

* Container `root` (UID 0) → host UID `100000` (your subuid range) — a container escape lands as a nobody.
* `--userns=keep-id` runs as *your* UID inside the container — best practice for bind-mounting home dirs.

```bash
podman run --rm -v $PWD:/work:Z --userns=keep-id -w /work my-img make
```

**SELinux `:z`/`:Z`:** on RHEL/Fedora, bind mounts need the `z` (shared) or `Z` (private) label or you get permission denied inside the container — the classic Podman-vs-Docker difference.

---

## **10. Docker Compatibility — Socket & Compose**

```bash
# Podman's Docker-compatible API socket — point Docker clients at it
systemctl --user enable --now podman.socket
export DOCKER_HOST=unix:///run/user/$UID/podman/podman.sock

# Now these work unchanged:
docker-compose up          # docker-compose talks to the podman socket
# or
podman compose up          # podman-compose wrapper (python)

# Podman Desktop / podman machine on macOS & Windows
podman machine init && podman machine start
```

`alias docker=podman` handles the CLI; `DOCKER_HOST` handles the API. Most tools (Testcontainers, build tools) work via the socket.

---

## **11. Secrets, Auto-Update & Production Bits**

```bash
# Secrets — file/env/secret-store sources, mounted as tmpfs files
printf 'hunter2' | podman secret create db_pass -
podman run -d --secret db_pass myapp     # appears at /run/secrets/db_pass

# Auto-update — Quadlet AutoUpdate=registry + timer pulls new image & restarts
podman auto-update                       # update all containers marked for it
systemctl enable --now podman-auto-update.timer

# Health checks & restart policies
podman run -d --health-cmd "curl -f http://localhost/health || exit 1" \
           --health-interval 30s \
           --restart=unless-stopped myapp
```

```bash
# Resource limits (cgroup v2 under the hood)
podman run -d --memory 512m --cpus 0.5 --pids-limit 100 myapp
```

---

## **12. podman build vs Buildah vs docker build**

* `podman build` ≈ `docker build` (same Dockerfile flow, Buildah under the hood).
* **Buildah** is the standalone tool — scriptable image building *without* a Dockerfile: `buildah from`, `buildah run`, `buildah copy`, `buildah commit`. Useful for CI image pipelines.
* **Skopeo** = the third sibling — copy/inspect/delete images between registries *without* pulling or a daemon: `skopeo copy docker://a.com/img:1 docker://b.com/img:1`.

---

## **13. Rootless Networking Notes**

* Rootless uses **`pasta`** (Podman 5+) or `slirp4netns` for user-mode networking — no privileged CNI needed.
* Rootless port-forward below 1024 requires `--sysctl net.ipv4.ip_unprivileged_port_start=80` or mapping 8080→80.
* `podman machine` (macOS/Windows) runs containers inside a Linux VM — the socket is how your local Docker CLI reaches it.

---

## 📚 **Learning Resources**

* 🔗 [Official Podman Documentation](https://podman.io/)
* 📦 [Podman GitHub Repository](https://github.com/containers/podman)
* ⚙️ [Quadlet Documentation](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html)
