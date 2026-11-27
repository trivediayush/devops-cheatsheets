# 🐝 Cilium, Hubble & eBPF Cheatsheet

In 2026, **Cilium** (CNCF Graduated) is the leading Kubernetes CNI, service mesh, and runtime security dataplane — powered by **eBPF** inside the Linux kernel. It eliminates slow `iptables` O(N) chains, replaces `kube-proxy`, provides **sidecar-less mTLS & L7 routing**, exposes real-time network flow observability via **Hubble**, and enforces kernel-level runtime security via **Tetragon**.

---

## **1. Why eBPF & Cilium Replaced Legacy `iptables` CNIs**

```text
Legacy kube-proxy + iptables:
  Packet ─► 10,000 sequential iptables rules O(N) ─► conntrack ─► Sidecar Proxy ─► App

Cilium eBPF Dataplane:
  Packet ─► Kernel eBPF Hash Map Lookup O(1) ─► Socket-level Direct Redirect ─► App
             (Bypasses entire TCP/IP stack for pod-to-pod on same node!)
```

| Capability | Legacy CNI + Sidecar Mesh | Cilium + Hubble + Tetragon |
| --- | --- | --- |
| **Service Routing (`kube-proxy`)** | `iptables` linear scan degrades past ~5k services | eBPF O(1) hash maps; `kubeProxyReplacement: true` |
| **Network Policies** | L3/L4 IP-based only | **Identity-aware L3/L4/L7** (HTTP method/path, DNS FQDN, Kafka, gRPC) |
| **Service Mesh / mTLS** | Envoy sidecar injected into *every* pod (high RAM) | **Sidecar-less** WireGuard/IPsec transparent encryption + per-node Envoy for L7 |
| **Observability** | Blind packets unless tcpdump on nodes | **Hubble**: real-time L3–L7 service dependency map, DNS errors & drops |
| **Runtime Security** | Post-hoc alerting | **Tetragon**: synchronous kernel-level **SIGKILL** enforcement on exploit syscalls |

---

## **2. Installing & Verifying Cilium (Production Helm Values)**

```bash
helm repo add cilium https://helm.cilium.io/
helm upgrade --install cilium cilium/cilium --version 1.16.5 \
  --namespace kube-system \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=$API_SERVER_IP \
  --set k8sServicePort=6443 \
  --set gatewayAPI.enabled=true \
  --set encryption.enabled=true \
  --set encryption.type=wireguard \
  --set hubble.enabled=true \
  --set hubble.relay.enabled=true \
  --set hubble.ui.enabled=true \
  --set hubble.metrics.enableOpenMetrics=true \
  --set hubble.metrics.enabled="{dns,drop,tcp,flow,httpV2:exemplars=true;labelsContext=source_ip\,source_namespace\,source_workload\,destination_ip\,destination_namespace\,destination_workload}"

# Verify cluster health & run end-to-end connectivity test suite:
cilium status --wait
cilium connectivity test
```

---

## **3. L3 / L4 / L7 & DNS-Aware `CiliumNetworkPolicy`**

Standard Kubernetes `NetworkPolicy` cannot filter by DNS hostname (`api.stripe.com`) or HTTP path (`POST /v1/charge`). **`CiliumNetworkPolicy`** does both natively:

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: checkout-zero-trust-policy
  namespace: checkout
spec:
  endpointSelector:
    matchLabels:
      app: checkout-api

  # 1. Ingress: ONLY allow gateway pods to call GET/POST on /api/v1/*
  ingress:
    - fromEndpoints:
        - matchLabels:
            io.kubernetes.pod.namespace: gateway
            app: api-gateway
      toPorts:
        - ports:
            - port: "8080"
              protocol: TCP
          rules:
            http:
              - method: "POST"
                path: "/api/v1/checkout"
              - method: "GET"
                path: "/healthz"

  # 2. Egress: ONLY allow CoreDNS + internal payments-api + external api.stripe.com:443
  egress:
    - toEndpoints:
        - matchLabels:
            io.kubernetes.pod.namespace: kube-system
            k8s-app: kube-dns
      toPorts:
        - ports:
            - port: "53"
              protocol: UDP
          rules:
            dns:
              - matchPattern: "*"               # Required so Cilium learns FQDN -> IP mappings!
    - toEndpoints:
        - matchLabels:
            io.kubernetes.pod.namespace: payments
            app: payments-api
      toPorts:
        - ports: [{ port: "8080", protocol: TCP }]
    - toFQDNs:
        - matchName: "api.stripe.com"
      toPorts:
        - ports: [{ port: "443", protocol: TCP }]
```

---

## **4. Hubble — Real-Time eBPF Network Troubleshooting**

Forget guessing why a pod got `Connection timed out` or `NXDOMAIN` — **Hubble** shows every dropped packet, policy verdict, DNS lookup, and HTTP 5xx in real time:

```bash
# Port-forward Hubble Relay locally (or access Hubble UI):
cilium hubble port-forward &

# 1. Watch ALL dropped packets in checkout namespace right now:
hubble observe --namespace checkout --verdict DROPPED --follow

# 2. Debug DNS resolution failures (NXDOMAIN / SERVFAIL / latency):
hubble observe --namespace checkout --protocol dns --follow

# 3. Inspect live HTTP status codes & latencies (L7 visibility):
hubble observe --namespace checkout --protocol http --http-status 500 --last 50

# 4. Trace traffic between two specific pods/services:
hubble observe --from-pod checkout/checkout-api --to-label app=payments-api -f

# 5. View traffic from a specific external FQDN:
hubble observe --to-fqdn api.stripe.com --last 20
```

---

## **5. Tetragon — Kernel-Level eBPF Runtime Security Enforcement**

**Tetragon** (Cilium's security subproject) hooks directly into Linux kernel LSM/kprobes so it can **block or kill** malicious processes synchronously *before* an attack completes:

```yaml
# TracingPolicy: Detect & SIGKILL any container process trying to read /etc/shadow or K8s SA token
apiVersion: cilium.io/v1alpha1
kind: TracingPolicyNamespaced
metadata:
  name: block-sensitive-file-reads
  namespace: checkout
spec:
  kprobes:
    - call: "security_file_open"
      syscall: false
      args:
        - index: 0
          type: "file"
      selectors:
        - matchArgs:
            - index: 0
              operator: "Prefix"
              values:
                - "/etc/shadow"
                - "/root/.ssh"
          matchActions:
            - action: Sigkill             # Kills attacker process in-kernel immediately!
```

```bash
# Watch live Tetragon process execution & enforcement events:
kubectl exec -n kube-system ds/tetragon -c tetragon -- tetra getevents -o compact --namespaces checkout
```

---

## **6. Essential Cilium CLI & eBPF Diagnostics**

```bash
# Inspect Cilium agent status inside a specific node's pod:
kubectl -n kube-system exec ds/cilium -- cilium-dbg status --verbose

# Verify kube-proxy replacement & eBPF service LB map:
kubectl -n kube-system exec ds/cilium -- cilium-dbg service list

# Check WireGuard node-to-node encryption status:
kubectl -n kube-system exec ds/cilium -- cilium-dbg encrypt status

# Inspect effective policies & identity ID for a specific pod:
kubectl -n kube-system exec ds/cilium -- cilium-dbg endpoint list
kubectl -n kube-system exec ds/cilium -- cilium-dbg policy get

# Inspect BPF maps directly on a Linux node (advanced eBPF debugging):
bpftool prog list
bpftool map list
```

---

## **7. Common Production Pitfalls**

| Issue | Root Cause | Fix |
| --- | --- | --- |
| **`toFQDNs` egress rule silently drops traffic** | Forgot to add `rules.dns: [{ matchPattern: "*" }]` on port 53 egress | Cilium intercepts DNS responses to learn IPs; always include the DNS L7 rule |
| **Cilium policy drops legitimate health probes** | Strict ingress policy blocks kubelet node IP | Allow `fromEntities: ["host", "remote-node"]` or rely on Cilium's automatic kubelet probe allowance |
| **Identity exhaustion on huge clusters** | High-cardinality pod labels (e.g., git SHA or timestamp in pod labels!) | Never put unique/per-build values in Pod labels — put them in **annotations**! |
| **MTU blackholing with WireGuard enabled** | WireGuard adds 60–80 bytes overhead on top of VPC MTU | Let Cilium auto-detect WireGuard MTU or set `MTU: 1420` explicitly |
