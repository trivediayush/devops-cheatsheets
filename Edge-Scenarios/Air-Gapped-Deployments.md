# 🚫 Air-Gapped & Offline Deployments

**The "no internet on the server" playbook.** Physical servers, classified networks, edge sites, regulated environments — everything you need to ship software when `apt`, `docker pull`, and `git clone` don't work.

---

## **1. The Core Problem & The Two Modes**

```text
ONLINE SIDE (a machine with internet)          OFFLINE SIDE (the target)
├── download everything needed                  ├── transfer media (USB/scp/rsync)
├── package into portable artifacts     ───►    ├── load/install locally
└── or stand up a mirror/registry               └── never phones home
```

Two strategies, often combined:
1. **Sneakernet artifacts** — export packages/images/debs/rpms on a connected box, copy over, load.
2. **Internal mirrors** — private registry, apt/yum mirror, artifact proxy (Harbor, Nexus, Artifactory) so the offline site feels "normal."

---

## **2. Docker Without Internet — The Exact Recipe**

### 🔹 Get the image to the server

```bash
# === ONLINE machine ===
docker pull myapp:1.2.3
docker pull nginx:1.25-alpine
docker save -o app-bundle.tar myapp:1.2.3 nginx:1.25-alpine   # multi-image tarball
gzip app-bundle.tar                                            # optional compress

# copy via scp / USB / whatever moves files
scp app-bundle.tar.gz user@offline-server:/tmp/

# === OFFLINE machine ===
gunzip app-bundle.tar.gz
docker load -i app-bundle.tar        # restores images + tags, no registry needed
docker images                        # verify
```

### 🔹 Get the app binaries into the image without internet

You can't `RUN apt-get install` offline — so build **on the connected box** and ship the *image*, OR build with pre-fetched artifacts:

```dockerfile
# Option A: build online, ship image (preferred — see above)

# Option B: build on the offline box from pre-fetched files
FROM python:3.12-slim            # already loaded via docker save
WORKDIR /app
COPY vendor/wheels /wheels       # pip wheels downloaded on connected box
RUN pip install --no-index --find-links /wheels -r requirements.txt
COPY . .
CMD ["python", "-m", "app"]
```

```bash
# === ONLINE: fetch Python deps as wheels ===
pip download -r requirements.txt -d vendor/wheels
# for a different platform (linux vs macOS dev):
pip download -r requirements.txt -d vendor/wheels \
  --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.12

# === ONLINE: fetch npm deps ===
npm ci --prefer-offline
tar czf node_modules.tar.gz node_modules     # or use an offline npm cache/mirror
```

### 🔹 Multi-image bundles, tags, and digests

```bash
docker save -o bundle.tar $(docker images -q)          # everything
docker save myapp:1.2.3 | ssh offline 'docker load'    # one-shot stream over ssh
skopeo copy docker://nginx:1.25 docker-archive:nginx.tar   # skopeo does it without docker
crane pull nginx:1.25 nginx.tar                        # crane too
```

---

## **3. Private Registry — When Sneakernet Gets Old**

Run a registry *inside* the air-gapped network once, then everything works normally:

```bash
# === ONLINE: pull + save registry image itself (chicken-and-egg!) ===
docker pull registry:2
docker save -o registry.tar registry:2

# === OFFLINE: load + run ===
docker load -i registry.tar
docker run -d -p 5000:5000 -v regdata:/var/lib/registry --name registry registry:2

# Seed it (from a box that can reach the offline registry):
skopeo copy docker://docker.io/nginx:1.25 docker://registry.internal:5000/nginx:1.25
# or docker tag + push
docker tag nginx:1.25 registry.internal:5000/nginx:1.25
docker push registry.internal:5000/nginx:1.25
```

`/etc/docker/daemon.json` on offline hosts:

```json
{ "insecure-registries": ["registry.internal:5000"],
  "registry-mirrors": ["http://registry.internal:5000"] }
```

Enterprise answer: **Harbor** (registry + RBAC + replication + scanning) or **Nexus/Artifactory** (multi-format: Docker + npm + pip + maven in one).

---

## **4. Kubernetes Air-Gap**

The problem: pods pull images — no internet = `ImagePullBackOff`. Solutions:

* **K3s air-gap mode** — purpose-built: drop `k3s-airgap-images-*.tar.zst` in `/var/lib/rancher/k3s/agent/images/` + binary + `INSTALL_K3S_SKIP_DOWNLOAD=true`. See `Kubernetes-Distributions.md`.
* **Private registry** — every manifest references `registry.internal:5000/...`; cluster pulls locally.
* **`imagePullPolicy` discipline** — `IfNotPresent` so pre-loaded images aren't re-pulled; pre-load with `ctr -n k8s.io images import images.tar` on each node.
* **Containerd mirror config** (`/etc/containerd/config.toml`):

```toml
[plugins."io.containerd.grpc.v1.cri".registry.mirrors."docker.io"]
  endpoint = ["http://registry.internal:5000"]
```

* **Helm charts**: fetch + `helm template` on connected box → commit rendered manifests; or mirror charts into an internal chartmuseum/Harbor.
* **kubectl/helm/client binaries**: copy the binaries — they're static, no install needed.

---

## **5. OS Packages Offline — apt/yum**

```bash
# === apt (Debian/Ubuntu): fetch .debs with deps ===
apt-get download $(apt-rdepends nginx | grep -v "^ ")     # or use apt-offline
# better: apt-offline for full workflows:
apt-offline set update.sig --update
# copy .sig to offline box → apt-offline install update.sig → generates bundle
# back online → apt-offline get bundle → copy archive back → install

# === yum/dnf (RHEL): download-only plugin ===
dnf install --downloadonly --downloaddir ./rpms nginx
dnf install createrepo_c && createrepo_c ./rpms           # make it a local repo
```

Local repo on the offline box (`/etc/yum.repos.d/local.repo`):

```ini
[local]
name=Local Repo
baseurl=file:///opt/rpms
enabled=1
gpgcheck=0
```

For real environments: a full mirror (`apt-mirror`, `reposync`, or Satellite/Space/Uyuni) — one host syncs, everything else installs normally.

---

## **6. Toolchain-Specific Artifacts Checklist**

| Ecosystem | Offline artifact | Command to fetch (online) |
| --- | --- | --- |
| **Python** | wheels | `pip download -r reqs.txt -d wheels/` |
| **Node** | npm cache / node_modules | `npm ci`, pack `node_modules`, or Verdaccio mirror |
| **Go** | `vendor/` dir or GOPROXY cache | `go mod vendor` (commit it — works offline by design) |
| **Java/Maven** | `.m2` repo / Nexus | `mvn dependency:go-offline` |
| **Helm** | `.tgz` charts | `helm pull chart --untar=false` |
| **Terraform** | provider binaries | `terraform providers mirror ./plugins` → `~/.terraformrc` filesystem mirror |
| **Docker** | image tarballs | `docker save` / `skopeo copy` |
| **OS** | rpm/deb mirrors | `reposync`, `apt-offline`, `apt-mirror` |
| **Git** | bundle files | `git bundle create repo.bundle --all` → `git clone repo.bundle` |

```bash
# Terraform offline providers — the clean pattern
terraform providers mirror /opt/tf-providers        # online box
# ~/.terraformrc on offline box:
# provider_installation { filesystem_mirror { path = "/opt/tf-providers" } }
```

---

## **7. CI/CD in Air-Gap — The Pattern That Works**

```text
Online world → Artifact repo (boundary) → Offline world
                    │                          ├── internal registry (Harbor)
                    │  scanned/signed          ├── internal git mirror
                    │  artifacts only          ├── internal CI runners
                    ▼                          └── internal artifact store
             one-way transfer (import/diode/USB)
```

* Self-hosted runners (GitHub self-hosted / GitLab runner) live **inside** the air-gap — pipelines run locally, only artifacts cross the boundary.
* Scan/sign artifacts *before* import — the boundary is your security checkpoint.
* Version-lock everything: you can't pull a "latest" that fixes a bug mid-incident.

---

## **8. Gotchas That Bite in Air-Gap**

* **TLS**: no public CA? Internal CA — distribute the root cert (`ca-certificates` bundle + `/etc/docker/certs.d/`).
* **NTP**: no internet time sync → run internal NTP/chrony. Clock skew breaks TLS + JWT validation — the sneakiest air-gap failure.
* **Helm charts with hardcoded image registries** — `helm template` and rewrite values, don't hand-edit rendered YAML.
* **kubectl version skew** vs cluster — copy the matching binary.
* **License-locked tools** that phone home — verify they work offline before the deploy, not during the demo.

---

## 📚 **Learning Resources**

* 🔗 [K3s Air-Gap Install](https://docs.k3s.io/installation/airgap)
* 📦 [Distribution Registry](https://distribution.github.io/distribution/)
* 🛡️ [Harbor](https://goharbor.io/) & [Skopeo](https://github.com/containers/skopeo)
