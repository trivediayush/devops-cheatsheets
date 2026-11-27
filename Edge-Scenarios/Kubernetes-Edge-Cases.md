# ☸️ Kubernetes Production Edge Cases — Diagrams & Answers

Every Kubernetes engineer knows `kubectl get pods`. Senior Platform & SRE engineers know the **subtle kernel, controller, scheduler, and storage race conditions** that only appear under real production traffic.

> Test your Kubernetes debugging instincts live in broken clusters at **[practice.atrivedi.online](https://practice.atrivedi.online/)**.

---

## **Edge Case 1: Brief `502 Bad Gateway` Bursts on Every Rolling Deploy**

![Kubernetes Rolling Update 502 Race Condition vs preStop Graceful Shutdown](/diagrams/k8s-graceful-shutdown-race.svg)

**Symptom:** Every rolling update or Spot node drain causes 1–3 seconds of `502 Bad Gateway` / `connection reset by peer` errors, even though `readinessProbe` is configured and `maxUnavailable: 0`.

**Root Cause Answer:**
When Kubernetes marks a Pod `Terminating`, **two asynchronous paths race**:
1. `kubelet` sends `SIGTERM` almost instantly (`~100ms`), and the app closes its listening port.
2. `EndpointSlice` propagation to `kube-proxy`, Cilium eBPF maps, Envoy, and AWS ALB Target Groups takes `1–5 seconds`.
Traffic routed during that race window hits a closed socket → **502 Bad Gateway**.

**Exact YAML Fix:**
```yaml
spec:
  terminationGracePeriodSeconds: 45
  containers:
    - name: api
      lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 10"]    # Holds pod open while LB/Envoy removes its IP!
```
*(And ensure your app handles `SIGTERM` by draining active HTTP/gRPC requests before exiting!)*

---

## **Edge Case 2: Latency Spikes 4× While Pod CPU Utilization Shows Only 25%**

```text
Container CPU limit: 500m (50ms allowed per 100ms Linux CFS period)
App runs 4 worker threads doing a quick 20ms burst simultaneously:
  4 threads × 20ms = 80ms requested in first 20ms of period!
  -> Quota (50ms) exhausted at t = 12.5ms!
  -> Linux kernel FREEZES all 4 threads for the remaining 87.5ms!
  -> Average CPU across 10s looks like "25%", yet tail latency jumps +87ms!
```

**Symptom:** Grafana shows pod CPU averaging `20–30%`, yet p99 latency jumps randomly by `80–200ms` during moderate concurrency.

**Diagnostic Command:**
```bash
# Check cgroup v2 CPU throttling counters directly inside the pod:
kubectl exec -n checkout deploy/checkout-api -- cat /sys/fs/cgroup/cpu.stat
# Look for high: nr_throttled and throttled_usec!

# Or in PromQL:
# rate(container_cpu_cfs_throttled_periods_total[5m]) / rate(container_cpu_cfs_periods_total[5m]) > 0.15
```

**Root Cause Answer:**
**Linux CFS (Completely Fair Scheduler) CPU Quota Throttling.** Multi-threaded runtimes (Go, JVM, Node.js GC) burn their 100ms CPU quota in the first 15ms across multiple cores and then sit frozen for 85ms.

**Permanent Fix:**
- Set accurate **CPU `requests`** (for bin-packing and fair share) and **omit CPU `limits`** on latency-sensitive workloads (keep **Memory `requests == limits`** strictly!).
- Always set `GOMAXPROCS` (via `automaxprocs`) / JVM `-XX:ActiveProcessorCount` to match CPU requests so runtimes don't spawn 64 threads on a 2-core pod.

---

## **Edge Case 3: Namespace Stuck in `Terminating` State Forever**

```text
kubectl delete ns staging
  └─ Namespace Controller tries to list & delete all resources in `staging`
       └─ FAILS because:
            1) A broken/deleted APIService webhook (e.g. metrics-server / custom.metrics) returns 503, OR
            2) A CRD object (Argo App / Crossplane Claim / PVC) has an orphaned Finalizer whose controller was already uninstalled!
```

**Diagnostic Commands:**
```bash
# 1. Inspect the exact conditions blocking namespace termination (ALWAYS look here first!):
kubectl get ns staging -o jsonpath='{.status.conditions}' | jq .

# 2. Find remaining namespaced objects holding finalizers:
kubectl api-resources --verbs=list --namespaced -o name \
  | xargs -n 1 kubectl get --show-kind --ignore-not-found -n staging
```

**Root Cause Answer & Safe Fix:**
1. **Fix the broken APIService** (if `NamespaceDeletionDiscoveryFailure` appears in conditions): `kubectl get apiservice | grep False` and delete/repair the dead APIService.
2. **Clear orphaned finalizers on stuck CRDs** *only after verifying underlying cloud resources are cleaned up*:
```bash
kubectl patch application/my-app -n staging --type=merge -p '{"metadata":{"finalizers":null}}'
```
*(Never blindly strip the Namespace's own `kubernetes` finalizer via `/finalize` unless all child objects are confirmed gone — otherwise child objects become orphaned ghosts in etcd!)*

---

## **Edge Case 4: StatefulSet Pod Stuck `ContainerCreating` with `Multi-Attach Error for Volume`**

```text
Node-A crashes abruptly (kernel panic / hard power loss — kubelet stops heartbeating)
   │  EBS / Persistent Disk (ReadWriteOnce) is STILL attached to Node-A at Cloud API level!
   ▼
StatefulSet/Deployment schedules replacement Pod on Node-B
   │  Node-B CSI driver calls AWS AttachVolume -> REJECTED ("already attached to Node-A")!
   ▼
Pod stuck ContainerCreating until Node-A is fully evicted/terminated (6+ minutes!)
```

**Diagnostic Commands:**
```bash
kubectl describe pod postgres-0 -n db | grep -A 5 "Multi-Attach"
kubectl get volumeattachment | grep <pv-name>
```

**Root Cause Answer & Fix:**
Block storage (`EBS gp3`, `GCP PD`, `Azure Disk`) is **ReadWriteOnce (RWO)** and cannot attach to two VMs simultaneously. When a node dies hard, Kubernetes waits ~5–6 minutes before force-detaching to prevent split-brain data corruption.
- **Immediate Recovery (ONLY after confirming old Node-A is truly dead/powered off!):**
```bash
kubectl delete pod postgres-0 -n db --grace-period=0 --force
# If VolumeAttachment is still orphaned after confirming EC2 instance is stopped:
kubectl delete volumeattachment <va-name>
```
- **Permanent Fix:** Enable **Non-Graceful Node Shutdown (`node.kubernetes.io/out-of-service=nodeshutdown:NoExecute`)** taint automation + use cloud-native replicated storage (**CloudNativePG**, **Longhorn**, or **managed RDS/CloudSQL**).

---

## **Edge Case 5: Karpenter Spot Eviction / Cluster Upgrade Deadlocked by a Bad `PodDisruptionBudget`**

**Symptom:** A Kubernetes node upgrade or Karpenter consolidation hangs for hours logging `Cannot evict pod as it would violate the pod's disruption budget`.

**Root Cause Answer:**
A team deployed a `Deployment` with `replicas: 1` AND a `PodDisruptionBudget` with `minAvailable: 1` (or `maxUnavailable: 0`). That leaves **zero allowed disruptions**, mathematically blocking every voluntary `kubectl drain` forever!

**Diagnostic & Permanent Fix:**
```bash
# Find EVERY dangerous PDB in the cluster with ALLOWED DISRUPTIONS = 0:
kubectl get pdb -A | awk '$5 == 0 {print}'
```
- Never create a PDB for `replicas: 1` workloads (if you need availability during upgrades, run `replicas >= 2`!).
- Enforce a **Kyverno admission policy** rejecting `maxUnavailable: 0` or `minAvailable: 100%` PDBs on PRs.

---

## **Edge Case 6: Decoding Mystery Container Exit Codes (`137` vs `139` vs `143` vs `126/127`)**

| Exit Code | Signal | Exact Meaning | First Command to Run |
| --- | --- | --- | --- |
| **`137`** | `128 + 9 (SIGKILL)` | **OOMKilled** (exceeded memory limit) OR killed after `terminationGracePeriodSeconds` | `kubectl describe pod <p> \| grep -A 4 "Last State"` |
| **`139`** | `128 + 11 (SIGSEGV)` | **Segmentation Fault** (native C/C++/CGO memory corruption or Alpine musl vs glibc mismatch) | Check `kubectl logs <p> --previous` + base image libc |
| **`143`** | `128 + 15 (SIGTERM)` | Graceful termination signal received (normal drain, preemption, or liveness probe kill) | `kubectl get events --field-selector involvedObject.name=<p>` |
| **`126`** | — | Entrypoint file exists but is **not executable** (`chmod +x` missing or `noexec` mount) | Check Dockerfile `chmod +x` & non-root UID permissions |
| **`127`** | — | Command not found (or **dynamic linker missing** — glibc binary copied into Alpine/distroless!) | Run `ldd ./binary` or build Go with `CGO_ENABLED=0` |

---

## **Edge Case 7: Pods Randomly `Evicted` with `The node was low on resource: ephemeral-storage`**

**Symptom:** Pods suddenly enter `Evicted` state even though CPU and RAM are fine and PVCs have plenty of space.

**Root Cause Answer:**
An app wrote verbose debug logs, temp uploads, or core dumps to `/tmp` or container root filesystem (`overlayfs` on the node's root EBS volume) instead of `stdout` or a PVC. Once node disk crosses `85%` (`imagefs.available`), kubelet triggers node pressure eviction.

**Permanent Fix:**
- Always log to `stdout`/`stderr` (collected by Alloy/Fluent Bit with log rotation), **never** to local container files.
- Enforce **`readOnlyRootFilesystem: true`** + explicit `emptyDir: { sizeLimit: 512Mi }` for `/tmp`.
- Set `ephemeral-storage` requests & limits on every container so kubelet evicts only the offending pod, not innocent neighbors.

---

## **Edge Case 8: Argo CD Stuck in Endless `OutOfSync` → `Syncing` Flip-Flop Loop**

**Symptom:** Argo CD continuously syncs a healthy Deployment every 3 minutes forever, spamming Slack alerts and creating hundreds of ReplicaSet revisions.

**Root Cause Answer:**
Two controllers are fighting over the same field:
1. **HPA / KEDA** updates `spec.replicas`, while Git hardcodes `replicas: 3`, **OR**
2. A **Mutating Admission Webhook** (Istio sidecar, Kyverno, Vault Agent) injects fields/defaults that Argo CD sees as drift.

**Exact Fix:**
- **Remove `replicas:`** from Git manifests managed by HPA/KEDA, and configure `ignoreDifferences` + `RespectIgnoreDifferences=true` in the Argo CD `Application`.
- Enable **`ServerSideApply=true`** so Kubernetes tracks field ownership cleanly per controller (`managedFields`).

---

## **Edge Case 9: Autoscaling Burst Fails with `ImagePullBackOff` (`429 Too Many Requests`)**

**Symptom:** Traffic spikes 5×; Karpenter launches 25 fresh nodes in 40 seconds; all 120 new pods fail with `429 Too Many Requests` from Docker Hub!

**Root Cause Answer:**
Fresh nodes have empty image caches and all share the same NAT Gateway public IP, instantly blowing past Docker Hub's anonymous/free pull rate limit (`100 pulls / 6h per IP`).

**Permanent Fix:**
- Mirror all third-party images (`nginx`, `postgres`, `redis`, `alpine`) through a **private pull-through cache registry** (**AWS ECR Pull-Through Cache**, **Harbor Proxy Cache**, or **GCP Artifact Registry**).
- Never reference unauthenticated `docker.io/library/*` directly in production manifests (enforce via Kyverno `allowed-registries` policy!).

---

## **Edge Case 10: Cross-AZ Chatty Microservices Double Cloud Bill & Add +4ms Per Hop**

**Symptom:** Moving to multi-AZ EKS unexpectedly doubled your AWS bill (`DataTransfer-Regional-Bytes`) and added 12ms latency to a 6-hop service chain.

**Root Cause Answer:**
Default Kubernetes `Service` routing sprays traffic uniformly across pods in **all 3 AZs** — meaning `67%` of pod-to-pod traffic crosses AZ boundaries (`$0.02/GB` round-trip + cross-AZ RTT!).

**Permanent Fix:**
Enable **Kubernetes Topology Aware Routing** (`service.kubernetes.io/topology-mode: Auto` or `trafficDistribution: PreferClose` in K8s 1.31+) so pods talk to healthy peers in the **same AZ** first, automatically spilling over to other AZs only if local pods fail!

```yaml
apiVersion: v1
kind: Service
metadata:
  name: payments-api
spec:
  trafficDistribution: PreferClose       # K8s 1.31+ native AZ-local routing!
  selector: { app: payments-api }
  ports: [{ port: 8080 }]
```

---

## **📚 Practice & Related Playbooks**

- 🧪 [Practice Live Kubernetes Troubleshooting — practice.atrivedi.online](https://practice.atrivedi.online/)
- 🔥 [Production Outage Scenarios](./Production-Outage-Scenarios.md)
- ☁️ [Cloud, IaC & Security Edge Cases](./Cloud-and-Security-Edge-Cases.md)
- ⚡ [Karpenter, KEDA & Autoscaling](../Kubernetes/Karpenter-and-Autoscaling.md)
