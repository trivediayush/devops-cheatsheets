# ⚡ Rapid-Fire Revision — DevOps/SRE Flash Cheatsheet

**The 10-minute pre-interview scan.** One-line definitions and commands across the whole stack — when the interviewer says "in 30 seconds, what is X?"

---

## **1. Definitions — Say It in One Line**

| Term | 30-second answer |
| --- | --- |
| **DevOps** | Culture + practices unifying dev & ops for fast, reliable delivery — automation, CI/CD, IaC, monitoring, shared ownership. |
| **CI/CD** | Integrate+test every change continuously; deliver/deploy it automatically. |
| **IaC** | Infrastructure as versioned code — repeatable, reviewable, drift-free. |
| **Container** | Isolated process sharing the host kernel (namespaces + cgroups), packaged with its deps. |
| **Image** | Immutable layered template a container runs from. |
| **Kubernetes** | Container orchestrator — schedules, self-heals, scales workloads via declarative desired state. |
| **Pod** | Smallest deployable unit — one+ containers sharing network + storage. |
| **Service** | Stable virtual IP + DNS name load-balancing to a set of pods. |
| **Ingress** | L7 HTTP routing rules into the cluster (host/path → Service), TLS termination. |
| **ConfigMap/Secret** | Config injected into pods; Secret for sensitive values (base64 ≠ encryption). |
| **HPA** | Scales pod count on metrics (CPU, custom). |
| **Helm** | Package manager for K8s — templated manifests versioned as charts. |
| **GitOps** | Git is the source of truth; agents (Argo/Flux) reconcile cluster state to git. |
| **Terraform state** | Mapping of config↔real resources; remote backend + locking for teams. |
| **Idempotency** | Running it twice gives the same result — core property of IaC/config mgmt. |
| **SLO/SLI/SLA** | Internal target / measured metric / contractual promise. Error budget = 1−SLO. |
| **Blue-green** | Two envs, flip traffic — instant rollback. |
| **Canary** | Small % traffic to new version, ramp gradually with metric checks. |
| **Rolling** | Replace instances in batches — default K8s Deployment strategy. |
| **SAST/DAST/SCA** | Scan source code / running app / third-party dependencies. |
| **SBOM** | Bill of materials — full dependency inventory (CycloneDX/SPDX). |
| **Observability** | Metrics + logs + traces to infer internal state from outputs. |
| **Golden signals** | Latency, traffic, errors, saturation. |
| **Service mesh** | Sidecar/eBPF layer adding mTLS, traffic control, observability between services. |
| **MTTR/MTBF** | Mean time to repair / between failures — optimize MTTR first. |

---

## **2. Linux Speed Round**

```bash
top / htop / ps aux              # processes, CPU, mem
df -h / du -sh <dir>             # disk usage
free -h                          # memory
ss -tulpn                        # listening ports
journalctl -u svc / tail -f log  # logs
chmod 755 f / chown u:g f        # permissions
systemctl restart nginx          # service control
grep -r "err" /var/log           # search logs
curl -v URL                      # HTTP debug
ssh -i key user@host             # remote access
kill -15/-9 PID                  # graceful / force kill
```

**One-liners to know:** zombie process = dead child not reaped by parent. `nohup`/`&`/`disown` = survive terminal close. `nice`/`renice` = CPU priority. File descriptors = everything is a file (sockets too).

---

## **3. Git Speed Round**

```bash
git rebase main                  # replay commits → linear history
git merge --no-ff feature        # merge with commit
git reset --soft/--hard HEAD~1   # undo commit keep / drop changes
git revert <sha>                 # safe undo (new commit)
git stash push -m "wip"          # shelve work
git cherry-pick <sha>            # copy a commit
git reflog                       # rescue "lost" commits
git push --force-with-lease      # safer force push
```

**Traps:** rebase ≠ merge (history rewriting); `pull` = fetch+merge; never force-push shared branches; `.gitignore` doesn't untrack already-committed files (`git rm --cached`).

---

## **4. Docker Speed Round**

```bash
docker build -t img:tag .
docker run -d -p 8080:80 --name app img:tag
docker exec -it app sh
docker logs -f app / inspect app
docker system prune -a           # reclaim space
docker compose up -d / down / logs -f
```

**Traps:** container ≠ VM (shared kernel); layer caching (order Dockerfile least→most changing); `CMD` vs `ENTRYPOINT`; exit 137 = OOMKilled; exit 1 = app error; distroless/alpine = small+secure; never `:latest` in prod.

---

## **5. Kubernetes Speed Round**

```bash
kubectl get pods -A / describe pod X / logs -f X --previous
kubectl exec -it X -- sh
kubectl apply -f f.yaml / diff -f f.yaml
kubectl rollout status/undo deploy/app
kubectl port-forward svc/api 8080:80
kubectl top pods/nodes
kubectl drain <node> --ignore-daemonsets
kubectl get events --sort-by=.lastTimestamp
```

**Traps:** Deployment→ReplicaSet→Pod hierarchy; StatefulSet = stable identity for stateful apps; readiness ≠ liveness; requests drive scheduling, limits cap usage; `Pending` = no node fits/taints/PVC; `CrashLoopBackOff` → check `--previous` logs; `ImagePullBackOff` → auth/tag; etcd = cluster brain (Raft); Service types ClusterIP→NodePort→LoadBalancer→Ingress; NetworkPolicy = pod firewall; RBAC: Role vs ClusterRole + bindings.

---

## **6. Terraform Speed Round**

```bash
terraform init/plan/apply/destroy
terraform fmt/validate
terraform state list/show/rm/mv
terraform import aws_x.y <id>
terraform workspace list/select/new
terraform taint aws_instance.web    # force recreate (deprecated-ish → -replace)
terraform apply -replace=aws_instance.web
```

**Traps:** state is critical → remote backend + locking + encryption; secrets live in state; `for_each` > `count` for lists; `moved` blocks > `state mv`; `lifecycle { prevent_destroy }` on stateful resources; modules = reusable units.

---

## **7. CI/CD & Security Speed Round**

```bash
trivy fs/image/config <target> --severity HIGH,CRITICAL --exit-code 1
gitleaks git . --redact
semgrep scan --config p/owasp-top-ten
checkov -d ./terraform
zap-baseline.py -t https://staging.app
syft img -o cyclonedx-json=sbom.json && grype sbom:sbom.json
cosign sign/verify <image>
```

**Traps:** gate = severity threshold + exit code (not just reports); secrets → rotate first, purge history second; OIDC > stored CI credentials; scan in PR (shift-left), full scans nightly.

---

## **8. Monitoring Speed Round**

```promql
rate(http_requests_total[5m])                              # req/s
rate(http_requests_total{status=~"5.."}[5m])               # errors/s
histogram_quantile(0.99, rate(latency_bucket[5m]))         # p99
increase(node_cpu_seconds_total{mode="idle"}[5m])          # idle CPU
up == 0                                                    # target down
```

**Traps:** cardinality kills Prometheus (no unbounded label values); alert on symptoms not causes; golden signals = latency/traffic/errors/saturation; Prometheus pulls, doesn't push.

---

## **9. Cloud Speed Round**

* Region = geography, AZ = isolated DCs inside it — multi-AZ is table stakes HA.
* S3 = object, EBS = block, EFS = file. IaaS/PaaS/SaaS ladder.
* Security group = stateful instance firewall; NACL = stateless subnet firewall.
* IAM: users/roles/policies; roles > users; least privilege always.
* NAT gateway = private subnet outbound internet; VPC endpoint = private AWS service access.
* Spot = cheap interruptible; Reserved/Savings Plans = commit discount for baseline.
* Egress costs money — the silent bill killer.

---

## **10. Interview-Day Micro-Habits**

* ✅ Clarify before answering design questions: scale? constraints? managed OK?
* ✅ Think out loud — interviewers grade reasoning, not just answers.
* ✅ Name trade-offs explicitly: "X is simpler but caps at Y; Z scales but adds ops cost."
* ✅ Numbers > adjectives: "p99 latency 250ms, 99.95% availability, deploy 12×/day."
* ✅ Own your unknowns: "Haven't used it — closest thing I know is X, and I'd…"
* ❌ Don't bluff internals — "I'm not sure how etcd handles X, my understanding is…" is fine.
