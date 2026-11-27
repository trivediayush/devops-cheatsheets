# 🛠️ Kubernetes Daily Commands — The kubectl Workbench

**The kubectl you actually type every day.** Context juggling, inspection, debugging, rollouts, and the error→fix table.

---

## **1. Context & Namespace Juggling**

```bash
kubectl config get-contexts                # all clusters
kubectl config use-context prod            # switch cluster — CHECK TWICE
kubectl config current-context             # where am I?
kubectl config set-context --current --namespace=app   # sticky namespace
alias k=kubectl                            # everyone does this
export KUBE_EDITOR=nano                    # for kubectl edit

# The safety habit before prod ops:
kubectl config current-context && kubectl get ns
```

---

## **2. Get — Reading the Cluster**

```bash
kubectl get pods                           # this namespace
kubectl get pods -A                        # all namespaces
kubectl get pods -o wide                   # + node, IP
kubectl get pods --watch / -w              # live refresh
kubectl get pods -l app=api                # label filter
kubectl get pods --field-selector=status.phase!=Running -A   # problems only
kubectl get all -n app                     # pods+svc+deploy+rs together
kubectl get deploy,sts,ds                  # several kinds at once
kubectl get events --sort-by=.lastTimestamp -n app           # the truth lives here
kubectl get events -A --field-selector type=Warning          # warnings only
kubectl get nodes -o wide                  # node health/IPs
kubectl top nodes; kubectl top pods -A     # live resource use
kubectl api-resources                      # every kind the cluster knows
kubectl explain deploy.spec.template       # field docs without a browser
```

**Output tricks:**

```bash
kubectl get pods -o yaml                   # full manifest
kubectl get pods -o json | jq '.items[].metadata.name'
kubectl get pods -o jsonpath='{.items[*].spec.containers[*].image}'   # all images
kubectl get pods -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,IP:.status.podIP
kubectl get pod api -o yaml | kubectl neat  # strip noise (krew plugin)
```

---

## **3. Describe & Logs — Where Bugs Live**

```bash
kubectl describe pod <pod>                 # events at the bottom — always first
kubectl describe node <node>               # taints, pressure, capacity
kubectl logs <pod>                         # current container
kubectl logs <pod> --previous              # ⭐ the CRASHED instance — key flag
kubectl logs <pod> -c <container>          # multi-container pods
kubectl logs -f deploy/api --tail=100      # via deployment
kubectl logs -l app=api --prefix=true -f   # all replicas, tagged
kubectl logs <pod> --since=10m
kubectl debug -it <pod> --image=busybox:1.36 --target=app   # ephemeral debug
kubectl debug node/<node> -it --image=ubuntu                # debug the NODE
```

---

## **4. Exec, Port-Forward, Copy**

```bash
kubectl exec -it <pod> -- sh               # shell inside
kubectl exec -it <pod> -c <container> -- bash
kubectl exec <pod> -- env | sort           # check injected env
kubectl exec <pod> -- cat /etc/resolv.conf
kubectl port-forward svc/api 8080:80       # service → localhost:8080
kubectl port-forward <pod> 5432:5432       # pod direct
kubectl port-forward deploy/api 8080:8080 --address 0.0.0.0   # shareable
kubectl cp <pod>:/app/dump.sql ./dump.sql  # file transfer
```

---

## **5. Apply, Create, Edit, Delete**

```bash
kubectl apply -f app.yaml                  # create or update (declarative)
kubectl apply -f ./manifests/              # whole directory
kubectl apply -f https://.../deploy.yaml   # remote URL
kubectl diff -f app.yaml                   # preview changes (server-side)
kubectl create deploy api --image=img:v1 --replicas=3   # imperative quick
kubectl expose deploy api --port=80 --target-port=8080
kubectl create configmap cfg --from-env-file=.env
kubectl create secret generic s --from-literal=KEY=value
kubectl edit deploy api                    # live-edit (opens editor)
kubectl patch deploy api -p '{"spec":{"replicas":5}}'
kubectl patch svc api -p '{"spec":{"type":"NodePort"}}'
kubectl replace -f app.yaml                # full replace (not merge)
kubectl delete -f app.yaml
kubectl delete pod api --grace-period=0 --force   # ⚠️ hard kill
kubectl delete pods --field-selector=status.phase=Failed -n prod
```

**The `dry-run` generators — build YAML without memorizing it:**

```bash
kubectl create deploy api --image=nginx --dry-run=client -o yaml > deploy.yaml
kubectl create job test --image=busybox --dry-run=client -o yaml -- date > job.yaml
kubectl create cm cfg --from-literal=k=v --dry-run=client -o yaml
```

---

## **6. Rollouts — The Deploy Lifecycle**

```bash
kubectl rollout status deploy/api          # wait for rollout — CI gates on this
kubectl rollout history deploy/api         # revisions
kubectl rollout history deploy/api --revision=3
kubectl rollout undo deploy/api            # rollback to previous
kubectl rollout undo deploy/api --to-revision=3
kubectl rollout restart deploy/api         # bounce pods (new config env)
kubectl rollout pause/resume deploy/api    # freeze during canary/debug
kubectl scale deploy/api --replicas=5
kubectl autoscale deploy api --min=2 --max=10 --cpu-percent=70   # quick HPA
```

---

## **7. Node Ops — Cordon, Drain, Taint**

```bash
kubectl cordon <node>                      # unschedulable (pods keep running)
kubectl uncordon <node>                    # back to normal
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
                                         # evict pods for maintenance
kubectl describe node <node> | grep -A5 Taints
kubectl taint nodes <n> key=value:NoSchedule         # repel pods
kubectl taint nodes <n> key=value:NoSchedule-        # remove taint
```

---

## **8. Error → Fix Table**

| Error/status | What it means | First moves |
| --- | --- | --- |
| `Pending` | scheduler can't place it | `describe` → insufficient CPU/mem, taints, unbound PVC |
| `ImagePullBackOff` | can't fetch image | tag exists? registry reachable? `imagePullSecrets` set? |
| `CrashLoopBackOff` | starts then dies | `logs --previous`; probe too aggressive? missing env/secret? |
| `OOMKilled` | over memory limit | raise limit or fix the leak; check `resources` in describe |
| `CreateContainerConfigError` | missing ConfigMap/Secret | `kubectl get cm,secret` in the namespace |
| `RunContainerError` | bad command/mount | check `command`/`args`, volume paths |
| `Evicted` | node disk/mem pressure | node `df -h`; pod QoS; `kubectl describe node` conditions |
| `Terminating` forever | finalizer or node gone | `kubectl get pod -o json \| jq .metadata.finalizers`; force delete if node dead |
| `Init:0/1` stuck | init container failing | `logs <pod> -c <init-container>` |
| `CrashLoopBackOff` only on one node | node-specific (disk, image corrupt) | `drain` the node, check kubelet logs |
| Service has no endpoints | `get endpoints <svc>` empty | selector labels ≠ pod labels; readiness failing |
| `FailedMount` | volume can't attach | PVC bound? secret exists? CSI driver healthy? |

---

## **9. One-Liners That Earn Their Keep**

```bash
# Every non-running pod cluster-wide:
kubectl get pods -A | grep -v Running | grep -v Completed

# Pod count per namespace:
kubectl get pods -A -o json | jq -r '.items[].metadata.namespace' | sort | uniq -c | sort -rn

# All images in use (audit what's deployed):
kubectl get pods -A -o jsonpath='{range .items[*]}{.spec.containers[*].image}{"\n"}{end}' | sort -u

# Restart every deployment in a namespace:
kubectl get deploy -n app -o name | xargs -I{} kubectl rollout restart {} -n app

# Find pods with no resource limits:
kubectl get pods -A -o json | jq -r '.items[] | select(.spec.containers[].resources.limits == null) | .metadata.name'

# Which pods are on a node:
kubectl get pods -A -o wide --field-selector spec.nodeName=<node>

# exec into every pod matching a label (parallel):
kubectl get pods -l app=api -o name | xargs -P4 -I{} kubectl exec {} -- date
```

---

## **10. k9s & Friends — The Daily GUI Layer**

```bash
k9s                          # TUI — pods, logs, exec, describe in keystrokes
k9s -n app                   # straight into a namespace
#   :pods  :svc  :deploy  :events  :nodes   → navigate
#   l=logs  s=shell  d=describe  ctrl+d=delete  /=filter  ?=help

kubectx                      # switch context fast
kubens app                   # switch namespace fast
stern api -n app             # multi-pod log tail (regex, colors, --since)
krew install neat ctx ns     # the plugin manager
```

---

## 📚 **Learning Resources**

* 🔗 [kubectl Reference](https://kubernetes.io/docs/reference/kubectl/)
* 📦 [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/) — the official quick list
* 🛠️ [k9s Docs](https://k9scli.io/) — the TUI everyone runs
