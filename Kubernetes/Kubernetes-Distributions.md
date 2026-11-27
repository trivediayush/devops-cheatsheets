# 🗺️ Kubernetes Distributions & Flavors

**"Kubernetes" isn't one thing** — upstream K8s, lightweight distros, dev tools, enterprise platforms, and cloud-managed services all speak the same API but differ wildly in ops burden. Choosing the right one is an architecture decision.

---

## **1. The Landscape**

| Distro | Vendor/Origin | Weight | Ops burden | Use it for |
| --- | --- | --- | --- | --- |
| **Kubernetes (kubeadm)** | CNCF upstream | Full | High | Learning internals, on-prem prod |
| **K3s** | Rancher/SUSE | ~100MB binary | Low | Edge, IoT, small prod, ARM, air-gap |
| **K0s** | Mirantis | Single binary | Low | Minimal-footprint prod, edge |
| **MicroK8s** | Canonical | Snap package | Low | Ubuntu shops, edge, dev |
| **Minikube** | Community | Local VM/container | Low | Local dev only — not prod |
| **kind** | K8s SIG | K8s-in-Docker | Low | CI pipelines, local multi-node testing |
| **k3d** | Rancher | K3s-in-Docker | Low | Fastest local cluster for dev/test |
| **OpenShift** | Red Hat | Full platform | Medium | Enterprise: adds RBAC defaults, routes, registry, operators, console |
| **RKE / RKE2** | Rancher | Full | Medium | Rancher-managed on-prem/multi-cluster |
| **Tanzu** | VMware | Full | Medium | VMware/vSphere shops |
| **EKS** | AWS | Managed CP | Low | AWS prod — control plane managed |
| **AKS** | Azure | Managed CP | Low | Azure prod — free control plane |
| **GKE** | Google | Managed CP | Lowest | Most-managed: autopilot, fleet, Anthos |

> [!IMPORTANT]
> **k9s is NOT a distro** — it's a terminal UI for managing clusters. Common confusion. Distros run K8s; tools (`k9s`, `kubectl`, `kubectx`, `stern`) talk to it.

---

## **2. Lightweight Distros — Deep Cuts**

### 🔹 K3s — The One You'll Actually Meet

```bash
# Server (control plane + worker in one)
curl -sfL https://get.k3s.io | sh -              # runs k3s server, writes /etc/rancher/k3s/k3s.yaml
sudo cat /etc/rancher/k3s/k3s.yaml               # this IS your kubeconfig

# Agent (worker) joins a server
curl -sfL https://get.k3s.io | K3S_URL=https://server:6443 K3S_TOKEN=<token> sh -

# Air-gapped install — the killer feature
# download k3s binary + k3s-airgap-images-amd64.tar.zst on a connected box
sudo mkdir -p /var/lib/rancher/k3s/agent/images/
sudo cp k3s-airgap-images-amd64.tar.zst /var/lib/rancher/k3s/agent/images/
INSTALL_K3S_SKIP_DOWNLOAD=true ./install.sh
```

K3s changes vs upstream: single binary, **SQLite** instead of etcd (etcd still available for HA), bundled flannel/traefik/servicelb (all disableable), runs on 512MB RAM. Ships images via airgap tarball — designed for disconnected sites.

### 🔹 kind — K8s in Docker (CI favorite)

```bash
kind create cluster --name ci --config kind.yaml
kind get kubeconfig --name ci > kubeconfig
kind load docker-image myapp:test --name ci   # load local image — no registry needed
kind delete cluster --name ci
```

```yaml
# kind.yaml — multi-node local cluster
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
```

### 🔹 k3d / minikube / MicroK8s — Quick Reference

```bash
k3d cluster create dev --servers 1 --agents 2 --port 8080:80@loadbalancer
minikube start --driver=docker --nodes 2   # minikube addons: dashboard, metrics-server, ingress
snap install microk8s --classic && microk8s enable dns ingress metrics-server
```

---

## **3. Enterprise & Managed — What You Actually Buy**

| You get | OpenShift | EKS/AKS/GKE |
| --- | --- | --- |
| Control plane | You install (or ROSA/ARO managed) | Provider runs it |
| Extras | Routes, internal registry, console, Source-to-Image, strict defaults (restricted SCC), OperatorHub | Native cloud LB/storage/IAM integration (IRSA, workload identity) |
| Lock-in | Red Hat ecosystem | Cloud ecosystem |
| When | Enterprise compliance, on-prem, platform features out of box | Standard cloud prod |

**Managed-plane note:** EKS charges per cluster/hr for the control plane; AKS control plane is free; GKE autopilot manages nodes too (pay per pod resource, not nodes).

---

## **4. Choosing — Decision Table**

```text
Learning internals / "the hard way"      → kubeadm cluster
Local laptop dev                          → k3d or kind (kind for CI, k3d for speed)
Edge / ARM / disconnected sites           → k3s
Minimal single-binary prod                → k0s
Ubuntu fleet, snap-friendly               → MicroK8s
Enterprise on-prem, needs compliance+UX   → OpenShift
Already on a cloud                        → that cloud's managed K8s (EKS/AKS/GKE)
Multi-cluster fleet mgmt                  → Rancher (RKE2), OpenShift ACM, GKE Fleet, SUSE
```

---

## **5. The Kubernetes API Is the Real Standard**

Everything above speaks the same API — a `Deployment` YAML works identically on k3s and GKE. That's the portability promise: your manifests, kubectl muscle memory, Helm charts, and operators travel. What differs: add-ons, defaults, auth integration, and who babysits etcd at 3 AM.

```bash
kubectl version --short                 # server version = the API contract
kubectl api-versions                    # what APIs this cluster serves
kubectl api-resources | head            # every resource kind available (incl. CRDs)
```

---

## **6. Cluster Inspection — Any Distro**

```bash
kubectl get nodes -o wide               # nodes, OS, runtime, kernel
kubectl get pods -A                     # everything running (check kube-system health)
kubectl cluster-info                    # API server + addon endpoints
kubectl get --raw /healthz              # control plane health
kubectl get componentstatuses           # legacy health check (deprecated in newer versions)
kubectl get events -A --sort-by=.lastTimestamp | tail -20
```

---

## 📚 **Learning Resources**

* 🔗 [K3s Documentation](https://docs.k3s.io/)
* 📦 [kind — Kubernetes IN Docker](https://kind.sigs.k8s.io/)
* 🛡️ [Certified Kubernetes Distros (CNCF)](https://www.cncf.io/training/certification/software-conformance/)
* 🧰 [k9s](https://k9scli.io/) — the cluster TUI (a tool, not a distro!)
