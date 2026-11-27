# 🧠 Kubernetes Internals — Control Plane Architecture

**What actually happens inside the cluster.** This is the architecture interviewers mean when they say "explain Kubernetes" — components, the pod creation flow, and the extension machinery (RBAC, operators, autoscaling).

---

## **1. The Cluster Architecture**

```text
CONTROL PLANE (the brain — usually 3 nodes for HA)
├── kube-apiserver      Front door: REST API, authN/authZ, admission, validates & persists to etcd
├── etcd                The only stateful component — Raft-consistent KV store of ALL cluster state
├── kube-scheduler      Assigns unscheduled pods to nodes (filter → score → bind)
├── controller-manager  Runs all controllers (Deployment, ReplicaSet, Node, Job, Endpoints…)
└── cloud-controller-mgr Cloud provider glue (LBs, node lifecycle, routes) — optional

WORKER NODES (the muscle)
├── kubelet             Node agent — registers node, starts/stops pods via CRI, reports status
├── kube-proxy          Programs Service VIP routing (iptables / IPVS / nftables) — or replaced by eBPF (Cilium)
├── container runtime   containerd / CRI-O — actually pulls images and runs containers
└── CNI plugin          Pod networking (Calico, Cilium, AWS VPC-CNI…), CSI for storage
```

**The key insight:** nothing "pushes" work. Every component **watches the API server** and reconciles observed state → desired state. Kubernetes is a giant set of control loops sharing one datastore.

---

## **2. Life of a `kubectl apply` — Step by Step**

```text
1. kubectl → API server:   POST /apis/apps/v1/deployments (authN: who are you?)
2. authZ (RBAC):           can this identity create deployments in this namespace?
3. Admission controllers:  mutate (inject sidecars, defaults) then validate (policies, quota)
4. Persist:                object written to etcd — "desired state" now exists
5. Deployment controller:  sees new Deployment → creates ReplicaSet → RS controller creates Pod objects (pending, unscheduled)
6. Scheduler:              sees pod with no nodeName → filter nodes (resources, taints, affinity, topology) → score → bind (writes pod.spec.nodeName)
7. kubelet (on that node): sees pod assigned to it → CRI: pull image → CNI: allocate IP → start containers
8. kubelet:                reports Pod status → API server → etcd. Controllers keep reconciling forever.
```

Every step is an independent async loop — this is why things are `Pending`/`ContainerCreating` transiently, and why the system self-heals when a component dies: the loops just keep retrying.

---

## **3. etcd — The Single Source of Truth**

* Distributed Raft KV store — needs **quorum** (2/3 or 3/5 members) to write. Even member counts are waste (4 tolerates same failures as 3).
* Stores *everything*: pods, secrets (base64 unless encryption-at-rest configured), configmaps, RBAC, leases.
* `kube-apiserver` is the *only* component that talks to etcd — everything else goes through the API.
* Ops duties: snapshot backups (`etcdctl snapshot save`), defrag (space reclamation), compaction (history grows).

```bash
kubectl get --raw /api/v1/namespaces/default/pods   # API server → what etcd holds
etcdctl snapshot save backup.db                      # on etcd member
etcdctl endpoint status --cluster -w table           # health/quorum
```

---

## **4. Scheduler — How Pods Land on Nodes**

```text
Filter (predicates):  Node has enough unreserved CPU/mem? Ports free? Volume attachable?
                      Taints tolerated? NodeSelector/affinity satisfied? Not unschedulable?
Score (priorities):   LeastAllocated / MostAllocated / spread / image locality
Bind:                 Write pod.spec.nodeName → kubelet takes over
```

| Mechanism | Effect |
| --- | --- |
| `nodeSelector` | Hard "only nodes with label X" |
| `nodeAffinity` | required/preferred rules on node labels |
| `podAffinity/AntiAffinity` | Place near/away from other pods (topologyKey: hostname/zone) |
| `taints + tolerations` | Repel pods from nodes unless tolerated (dedicated nodes, control-plane protection) |
| `PriorityClass` | Preemption — evicts lower-priority pods when a high-priority pod can't fit |
| `ResourceQuota / LimitRange` | Namespace ceilings + per-pod defaults |

`Pending` pod? `kubectl describe pod` → scheduler events name the exact failed predicate.

---

## **5. Controllers & the Reconciliation Loop**

```go
// Pseudocode every controller runs, forever:
for {
  desired := readSpec()     // from API server
  observed := readStatus()  // from API server / world
  if desired != observed {
    act()                   // create/update/delete to converge
  }
}
```

* **Deployment controller** → manages **ReplicaSets** → manages Pods. Rollout = create new RS, scale it up while scaling old down.
* Rolling update knobs: `maxSurge` (extra pods allowed above desired), `maxUnavailable` (pods allowed down) — `maxSurge: 25%, maxUnavailable: 0` = safest default.
* `kubectl rollout undo` = scale the old ReplicaSet back up — which is why history (`--revision-history-limit`) matters.

---

## **6. RBAC — Who Can Do What**

```text
Subject (User/Group/ServiceAccount)
  → bound by RoleBinding (namespace) or ClusterRoleBinding (cluster)
    → to Role (namespaced rules) or ClusterRole (cluster-wide rules)
      → rules: [apiGroups, resources, verbs]
```

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { namespace: prod, name: deployer }
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "update", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { namespace: prod, name: deployer-binding }
subjects:
  - kind: ServiceAccount
    name: deploy-sa
    namespace: prod
roleRef:
  kind: Role
  name: deployer
  apiGroup: rbac.authorization.k8s.io
```

```bash
kubectl auth can-i create deployments --as=system:serviceaccount:prod:deploy-sa -n prod
kubectl auth can-i --list --as=alice -n prod       # audit what an identity can do
```

**Gotcha:** `get`/`list` on Secrets in a namespace ≈ full compromise of that namespace's creds. Bound service accounts are the modern path — `automountServiceAccountToken: false` where not needed.

---

## **7. Autoscaling Stack — HPA/VPA/CA/Karpenter**

| Scaler | Scales | Driven by | Gotcha |
| --- | --- | --- | --- |
| **HPA** | Pod replica count | Metrics API (CPU/mem), custom/external metrics | Needs `resources.requests` — percentages are of *requests*, not node |
| **VPA** | Pod resource requests/limits | Observed usage history | Recreates pods to resize (in-place resize maturing); conflicts with HPA on same metric |
| **Cluster Autoscaler** | Node count | Unschedulable pods / idle nodes | Cloud-dependent, scale-up takes minutes |
| **Karpenter** | Node provisioning | Pod requirements directly | Faster, consolidates, picks instance types — AWS-native-first |

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: api }
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
    - type: Pods                              # custom metric example
      pods: { metric: { name: queue_depth }, target: { type: AverageValue, averageValue: "30" } }
```

HPA math: `desiredReplicas = ceil(currentReplicas × currentMetric / targetMetric)`. Scale-down has a default 5-min stabilization window (prevents flapping).

---

## **8. Extension Machinery — CRDs, Operators, Admission**

* **CRD (CustomResourceDefinition)**: define new API objects (`kind: Certificate`, `kind: PostgresCluster`) — the API server stores them like native resources.
* **Operator**: a controller watching a CRD, encoding operational knowledge (backups, upgrades, failover). Postgres-operator, cert-manager, Argo — all operators.
* **Admission webhooks**: mutating (inject sidecars — how Istio works) + validating (policy enforcement — OPA Gatekeeper, Kyverno). They intercept *every* API write.
* **API aggregation**: extend the API server with your own endpoints (metrics-server works this way).

```bash
kubectl get crd | wc -l                  # how extended is this cluster?
kubectl api-resources | grep -v "v1\|apps" | head   # custom kinds
kubectl explain mycrd.spec               # self-documenting
```

---

## **9. The Ecosystem Tools — kubectl & Friends**

| Tool | What it is | Killer feature |
| --- | --- | --- |
| **k9s** | Terminal UI for the whole cluster | `:` to jump resource types, `s` shell into pod, `x` X-Ray resource tree |
| **kubectx / kubens** | Switch context / namespace | `kubectx prod` vs editing kubeconfig |
| **stern** | Multi-pod log tail | `stern api-` tails all matching pods with per-pod colors |
| **krew** | kubectl plugin manager | `kubectl krew install ctx ns neat` |
| **kubectl-neat** | Strips server-managed fields | Clean YAML for gitops |
| **kustomize** | Template-free YAML overlays | Built into `kubectl apply -k` — base + env overlays |
| **kubeseal** | Sealed Secrets client | Commit encrypted secrets to git safely |

```bash
kubectl config get-contexts / use-context prod
kubectl neat get -- deploy api -o yaml    # gitops-ready output
stern -n prod api --since 10m             # all api pods' logs, last 10m
```

---

## **10. End-to-End Flows — The Sequence Diagrams**

### Pod Creation — Who Does What, In Order

```text
kubectl apply -f deploy.yaml
     │
     ▼
1. API server: authN → authZ(RBAC) → admission webhooks
   → validate schema → write to etcd → 201 Created
     │
     ▼
2. Deployment controller (watching API) sees new Deployment
   → creates ReplicaSet → ReplicaSet creates Pod object (no node yet)
     │
     ▼
3. Scheduler (watching unbound pods): filter nodes → score
   → writes pod.spec.nodeName → "bind" back to API server
     │
     ▼
4. Kubelet on that node (watching pods bound to it):
   a. admits pod (checks resources/taints vs node)
   b. calls CRI → runPodSandbox (the pause container)
   c. pause container's netns → CNI plugin assigns pod IP
   d. pulls images via CRI → registry (imagePullSecrets)
   e. mounts volumes (CSI), configmaps, secrets into the sandbox
   f. creates + starts app containers in the pod's namespaces
     │
     ▼
5. Kubelet reports pod status → API server → etcd
   kubelet's probes run: startup → readiness → Service endpoints
     │
     ▼
6. EndpointSlice controller adds pod IP → Service routes traffic
```

**The mental model:** K8s is a *level-triggered* system — every component just watches etcd and reconciles. Nothing is a one-shot command; everything is loops converging on desired state.

---

### Service Traffic — Packet Walk (kube-proxy, iptables mode)

```text
podA → svc "api" ClusterIP 10.96.0.10:80
     │
     ▼ podA's netns → veth → node
kube-proxy's iptables rules (per-service, per-endpoint DNAT):
   -A KUBE-SVC-XXX -d 10.96.0.10 -p tcp --dport 80 → KUBE-SEP-YYY
   KUBE-SEP-YYY → DNAT to 10.244.1.7:8080  (random endpoint pick)
     │
     ▼ conntrack remembers the pick (session affinity)
podB on node2 → overlay/encap (VXLAN etc. per CNI) → podB:8080
```

```text
NodePort flow (external client):
client → nodeIP:30080
     │
     ▼ iptables KUBE-NODEPORTS → DNAT to random endpoint pod
     │
     └── externalTrafficPolicy: Cluster (SNAT, any node, loses client IP)
                              vs Local   (only nodes with the pod, keeps IP)

LoadBalancer = NodePort + cloud LB provisioned pointing at it
Ingress     = an L7 router pod (nginx/traefik) routing on host/path
             to Services — the LB only fronts the ingress
```

```bash
# Where does a service IP actually go?
kubectl get endpointslices -l kubernetes.io/service-name=api
iptables -t nat -L KUBE-SVC-XXX -n -v     # on the node — see DNAT rules
kubectl get svc api -o jsonpath='{.spec.clusterIP}'
```

---

### DNS Resolution Flow — The `ndots:5` Trap

```text
pod: curl http://api/prod

resolv.conf in pod:  nameserver 10.96.0.10 (CoreDNS svc IP)
                     search prod.svc.cluster.local svc.cluster.local cluster.local
                     options ndots:5

"api" has <5 dots → try search domains FIRST, in order:
  api.prod.svc.cluster.local      ✓ found → return ClusterIP
     │
     ▼ if all search domains miss → try literal "api" last

External name (api.example.com, 1 dot):
  api.example.com.prod.svc...     ✗ 5+ wasted queries
  api.example.com.svc...          ✗
  api.example.com.cluster.local   ✗
  api.example.com                 ✓ finally resolves
  → every external DNS lookup costs ~6 queries
```

```bash
# Fix: fully-qualify external names (trailing dot skips search):
curl http://api.example.com./prod

kubectl exec <pod> -- cat /etc/resolv.conf
kubectl -n kube-system logs -l k8s-app=kube-dns --tail=20
```

---

### Volume Mount — PVC to Pod

```text
PVC created → external-provisioner (CSI sidecar watching PVCs)
     │
     ▼ calls cloud/storage API → real volume created → PV object
PV ↔ PVC bound (1:1)
     │
     ▼ pod scheduled to node
attach/detach controller → CSI ControllerPublishVolume
     → attach disk to the node (EBS attach / Azure disk attach)
     │
     ▼ kubelet → CSI NodeStageVolume (format+stage) →
     NodePublishVolume (bind-mount into pod dir)
     │
     ▼ container starts, sees the volume at mountPath
```

**Failure signatures:** `Multi-Attach` (volume still on old node — force-detach or wait), `FailedAttachVolume` (cloud API/quota), `MountVolume.SetUp failed` (CSI driver, permissions, bad secret).

---

### etcd — Raft Write Path (Why It Matters for HA)

```text
kubectl write → API server → etcd leader
     │
     ▼ leader appends to its log → replicates to followers
     │
     ▼ majority (quorum: 2/3, 3/5) acknowledge → COMMITTED
     │
     ▼ applied to state machine → API server returns success
```

| etcd members | Tolerates failures | Writes need |
| --- | --- | --- |
| 3 | 1 | 2/3 (quorum) |
| 5 | 2 | 3/5 |
| 4 | 1 | 3/4 ← worse than 3, never use even counts |

> [!WARNING]
> etcd losing quorum = **read-only cluster**. `kubectl get` works, `apply`/`delete` hang. Disk latency (fsync) is etcd's #1 killer — co-located noisy workloads or slow NFS = leader elections storming. Keep etcd on fast local SSD.

---

### Kubelet — The Node's Agent Loop

```text
kubelet sync loop (~every few seconds via PLEG + watch):
   desired state (API: pods bound to this node)
        vs
   actual state (runtime reports, container states)
        │
        ▼ diff → act via CRI:
        ├── missing sandbox?   → runPodSandbox + CNI
        ├── image missing?     → pull via CRI image service
        ├── container gone?    → create + start
        ├── probe config?      → run liveness/readiness/startup
        └── status changed?    → PATCH pod status to API
```

```bash
# Talk to the runtime directly on a node (bypassing kubectl):
crictl ps                          # containers the K8s way sees
crictl pods                        # sandboxes
crictl inspect <id> | jq .status   # deep state
crictl logs <id>                   # same as kubectl logs, node-level
systemctl status kubelet           # node agent health
journalctl -u kubelet -f           # node-level pod errors live here
```

---

## 📚 **Learning Resources**

* 🔗 [Kubernetes Architecture Docs](https://kubernetes.io/docs/concepts/architecture/)
* 📦 [Scheduler Docs](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/)
* 🛡️ [Operator Pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/)
* 🧪 [Cluster Setup with kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/) — see every component get wired by hand
