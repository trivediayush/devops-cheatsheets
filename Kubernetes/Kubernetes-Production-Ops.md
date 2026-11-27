# ⚙️ Kubernetes Production Ops — Workloads, Storage & Day-2

**The ops layer between "I deployed a pod" and running a real service.** Workload objects in depth, probes, QoS, storage, policies, and the kubectl cookbook for daily operations.

---

## **1. Workload Objects — When Each Is Right**

| Object | For | Key behavior |
| --- | --- | --- |
| **Deployment** | Stateless apps | ReplicaSet + rolling updates + rollback |
| **StatefulSet** | Stateful: DBs, Kafka, ES | Stable pod names (`app-0`), ordered scale up/down, PVC template per pod |
| **DaemonSet** | Per-node agents | Logging/monitoring/CNI — one pod per node (tolerates node taints) |
| **Job** | Run-to-completion | Retries (`backoffLimit`), `activeDeadlineSeconds` cap, `ttlSecondsAfterFinished` cleanup |
| **CronJob** | Scheduled jobs | `schedule: "0 3 * * *"` — beware `concurrencyPolicy` overlap on slow jobs |
| **ReplicaSet** | (internal) | Don't create directly — Deployments own them |
| **Pod** | (atom) | Don't create bare pods in prod — no rescheduling |

```yaml
# Deployment — the production shape
apiVersion: apps/v1
kind: Deployment
spec:
  revisionHistoryLimit: 5
  strategy:
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }   # zero-downtime updates
  minReadySeconds: 10
  progressDeadlineSeconds: 300                          # stuck rollout → failed
  template:
    spec:
      terminationGracePeriodSeconds: 60                 # drain time on SIGTERM
      containers:
        - name: app
          lifecycle:
            preStop: { exec: { command: ["/bin/sh","-c","sleep 10"] } }  # let LB deregister
```

---

## **2. Probes, QoS & Lifecycle — Reliability Plumbing**

```yaml
livenessProbe:     # unhealthy → restart the container
  httpGet: { path: /healthz, port: 8080 }
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:    # not-ready → removed from Service endpoints (NO restart)
  httpGet: { path: /readyz, port: 8080 }
  periodSeconds: 5

startupProbe:      # slow-starting apps — liveness ignored until this passes
  httpGet: { path: /healthz, port: 8080 }
  failureThreshold: 30    # 30×10s = 5min startup budget
  periodSeconds: 10
```

**The trap:** liveness probe on a dependency — app can't start because DB is down → liveness restarts it → crashloop forever. Liveness = "is the process deadlocked", readiness = "can it serve".

**QoS classes** (from requests/limits):

| Class | Set | Eviction order |
| --- | --- | --- |
| **Guaranteed** | requests == limits for all containers | Last — safest under node pressure |
| **Burstable** | requests < limits | Middle |
| **BestEffort** | no requests/limits | First evicted — the "why did my pod die under load" cause |

```bash
kubectl get pod <p> -o jsonpath='{.status.qosClass}'
```

---

## **3. Storage — PV/PVC/StorageClass**

```text
StorageClass (provisioner template: gp3, azure-disk, local)
  → PVC (claim: "I need 10Gi RWO")
    → PV (the actual volume, bound 1:1)
      → Pod volumeMounts
```

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: { name: fast }
provisioner: ebs.csi.aws.com
parameters: { type: gp3, iops: "3000" }
reclaimPolicy: Retain             # Retain = data survives PVC delete (safe)
volumeBindingMode: WaitForFirstConsumer   # provision in the pod's AZ, not random!
allowVolumeExpansion: true
```

```bash
kubectl get pv,pvc -A                # bound? Pending PVC = no provisioner match
kubectl describe pvc <name>          # events say why
kubectl get sc                       # default StorageClass marked (default)
```

**Gotchas:** `WaitForFirstConsumer` or your EBS volume lands in the wrong AZ; `Retain` prevents data loss on accidental PVC deletion; StatefulSets use `volumeClaimTemplates` (PVC per pod ordinal — `data-app-0`).

---

## **4. Network Policies — Pod Firewalls**

Default = **allow all**. Any NetworkPolicy selecting a pod makes it default-deny for the listed direction.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: api-ingress }
spec:
  podSelector: { matchLabels: { app: api } }
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - podSelector: { matchLabels: { app: frontend } }
        - namespaceSelector: { matchLabels: { name: ingress-nginx } }
      ports: [{ port: 8080, protocol: TCP }]
  egress:
    - to: [{ podSelector: { matchLabels: { app: db } } }]
      ports: [{ port: 5432 }]
    - to: [{ ipBlock: { cidr: 0.0.0.0/0, except: [10.0.0.0/8] } }]  # internet but not internal
      ports: [{ port: 443 }]
```

> [!WARNING]
> NetworkPolicy needs a CNI that enforces it (Calico, Cilium — AWS VPC-CNI needs the NetworkPolicy feature). Deny-all egress without a DNS allow rule = everything breaks (allow UDP/TCP 53 to kube-dns).

---

## **5. ConfigMaps, Secrets & the 12-Factor Split**

```yaml
# ConfigMap — non-sensitive config
envFrom: [{ configMapRef: { name: app-config } }]
# Secret — sensitive (base64, optionally encrypted at rest in etcd)
envFrom: [{ secretRef: { name: app-secrets } }]
# Single keys:
env:
  - name: DB_PASS
    valueFrom:
      secretKeyRef: { name: app-secrets, key: password }
# Mounted as files (auto-updates on change, unlike env):
volumeMounts: [{ name: cfg, mountPath: /etc/app }]
volumes:
  - name: cfg
    secret: { secretName: app-secrets }
```

**Facts that matter:** env vars don't update without restart; mounted files update (eventually, ~60s). Secrets are base64 not encryption — enable `encryption at rest` + restrict `get/list secrets` RBAC. Real answer for prod: external secrets (Vault/AWS SM) via External Secrets Operator or CSI driver.

---

## **6. The Ops Cookbook — Commands You'll Type Daily**

```bash
# === Inspection ===
kubectl get pods -A -o wide --sort-by=.metadata.creationTimestamp
kubectl describe pod <p>                       # events — always first
kubectl get events -A --field-selector type=Warning --sort-by=.lastTimestamp
kubectl top nodes / top pods -A

# === Logs & exec ===
kubectl logs <p> -c <container> --previous     # crashed instance's logs
kubectl logs -f deploy/api --tail=50           # via deployment (any replica)
kubectl exec -it <p> -c <container> -- sh
kubectl debug -it <p> --image=busybox:1.36 --target=app   # ephemeral debug container
kubectl debug node/<node> -it --image=ubuntu             # debug the NODE

# === Rollout ops ===
kubectl rollout status deploy/api
kubectl rollout history deploy/api
kubectl rollout undo deploy/api --to-revision=3
kubectl rollout restart deploy/api              # rolling restart (config changes)

# === Scale/patch/drain ===
kubectl scale deploy/api --replicas=5
kubectl patch deploy api -p '{"spec":{"replicas":3}}'
kubectl cordon <node>                           # mark unschedulable
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data

# === Bulk/field tricks ===
kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}{"\t"}{.metadata.name}{"\n"}{end}'
kubectl get pods --field-selector=status.phase=Failed -A
kubectl delete pods --field-selector=status.phase=Failed -n prod
kubectl get all -l app=api -n prod              # everything with a label
```

---

## **7. The Debugging Decision Tree**

```text
Pod not Running?
├── Pending        → describe → scheduler reason (resources/taints/PVC)
├── ImagePull*     → image exists? tag? pull secrets? registry reachable?
├── CrashLoop      → logs --previous → app error / probe kill / OOM
├── CreateContainer* → config/secret missing, bad command
├── OOMKilled      → memory limit → raise or fix leak
└── Evicted        → node disk/memory pressure → QoS/capacity

Pod Running but broken?
├── No traffic     → get endpoints <svc> → empty = readiness/selector
├── Wrong traffic  → port name mismatch svc.targetPort vs containerPort
├── DNS fails      → nslookup from debug pod → NetworkPolicy? coredns?
└── Slow           → throttled? cpu.stat → resource limits / noisy neighbor
```

---

## 📚 **Learning Resources**

* 🔗 [Kubernetes Workloads Docs](https://kubernetes.io/docs/concepts/workloads/)
* 📦 [Pod Lifecycle & Probes](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
* 🛡️ [Production Checklist (learnk8s)](https://learnk8s.io/production-best-practices)
