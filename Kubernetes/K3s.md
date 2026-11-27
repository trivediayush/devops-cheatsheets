---
title: K3s
description: K3s lightweight Kubernetes cheatsheet covering install, architecture, HA, networking, storage, upgrades, backups and troubleshooting.
---

# K3s

K3s is a certified, lightweight Kubernetes distribution packaged as a single binary of under 100 MB. It suits edge, IoT, CI, home labs and small production clusters.

## 1. What is different from upstream

| Area | K3s default |
|---|---|
| Datastore | SQLite (single server), embedded etcd (HA) or external SQL |
| Container runtime | containerd |
| CNI | Flannel (VXLAN) |
| Ingress | Traefik |
| Load balancer | ServiceLB (Klipper) |
| DNS | CoreDNS |
| Storage | local-path provisioner |
| Metrics | metrics-server |

Server nodes run the control plane, and agent nodes run workloads.

## 2. Install

```bash
# Server
curl -sfL https://get.k3s.io | sh -
sudo k3s kubectl get nodes
sudo cat /var/lib/rancher/k3s/server/node-token

# Agent
curl -sfL https://get.k3s.io | K3S_URL=https://<server>:6443 K3S_TOKEN=<token> sh -

# Use kubectl from your machine
sudo cat /etc/rancher/k3s/k3s.yaml     # copy and replace 127.0.0.1 with the server address
export KUBECONFIG=~/k3s.yaml
```

## 3. Config file

```yaml
# /etc/rancher/k3s/config.yaml
write-kubeconfig-mode: "0640"
tls-san:
  - k3s.example.com
disable:
  - traefik
  - servicelb
node-label:
  - "zone=edge-1"
flannel-backend: "wireguard-native"
secrets-encryption: true
```

Restart with `sudo systemctl restart k3s` (or `k3s-agent`) after changes.

## 4. High availability with embedded etcd

```bash
# First server
curl -sfL https://get.k3s.io | K3S_TOKEN=<secret> sh -s - server --cluster-init

# Additional servers (use an odd total, at least three)
curl -sfL https://get.k3s.io | K3S_TOKEN=<secret> sh -s - server \
  --server https://<first-server>:6443
```

Put a load balancer or virtual IP (for example kube-vip) in front of port 6443 and point agents at it.

## 5. Manifests and Helm

```bash
# Files in this directory are applied automatically
ls /var/lib/rancher/k3s/server/manifests/
```

```yaml
# HelmChart resource handled by the built-in controller
apiVersion: helm.cattle.io/v1
kind: HelmChart
metadata:
  name: ingress-nginx
  namespace: kube-system
spec:
  repo: https://kubernetes.github.io/ingress-nginx
  chart: ingress-nginx
  targetNamespace: ingress-nginx
  createNamespace: true
```

## 6. Private registries and air-gap

```yaml
# /etc/rancher/k3s/registries.yaml
mirrors:
  docker.io:
    endpoint:
      - "https://registry.example.com"
configs:
  "registry.example.com":
    auth:
      username: robot
      password: <secret>
```

For air-gapped installs, place the airgap images tarball in `/var/lib/rancher/k3s/agent/images/` and run the installer with `INSTALL_K3S_SKIP_DOWNLOAD=true`.

## 7. Backup, restore and upgrade

```bash
# Snapshot (embedded etcd)
sudo k3s etcd-snapshot save --name pre-upgrade
sudo k3s etcd-snapshot ls

# Restore on a stopped server
sudo systemctl stop k3s
sudo k3s server --cluster-reset --cluster-reset-restore-path=<snapshot-file>

# Upgrade a node in place (one at a time, servers first)
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=v1.31.x+k3s1 sh -

# Uninstall
/usr/local/bin/k3s-uninstall.sh
/usr/local/bin/k3s-agent-uninstall.sh
```

For SQLite, back up `/var/lib/rancher/k3s/server/db/`. Automate upgrades with the `system-upgrade-controller`.

## 8. Troubleshooting

```bash
sudo systemctl status k3s
sudo journalctl -u k3s -f
sudo k3s check-config
sudo crictl ps && sudo crictl images
sudo k3s kubectl get pods -A
```

| Symptom | Check |
|---|---|
| Agent will not join | Token, port 6443 reachable, clock sync, unique hostnames |
| Pods cannot reach each other | Open UDP 8472 (VXLAN) or 51820 (WireGuard) between nodes |
| Certificate errors from outside | Add the address or DNS name with `tls-san` |
| Traefik or ServiceLB conflicts | Disable the built-in one if you install another ingress or MetalLB |
| Disk fills up | Clean unused images with `crictl rmi --prune`, check container logs |
