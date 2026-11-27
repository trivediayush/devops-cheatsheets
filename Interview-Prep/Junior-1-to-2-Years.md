# 🎯 DevOps Interview — Junior (1–2 Years)

**What interviewers test at this level**: you can own tasks end-to-end — write a pipeline, deploy to Kubernetes, debug a broken deploy — and you understand the *systems* behind the tools, not just the commands.

| Expectation | What it means |
| --- | --- |
| Working pipeline knowledge | You can draw your team's pipeline from commit → prod |
| K8s object fluency | Pod vs Deployment vs StatefulSet vs DaemonSet without notes |
| IaC in practice | Written Terraform/Ansible, not just run it |
| Basic troubleshooting | Reads logs, checks events, bisects failures methodically |

---

## **1. Docker — Beyond the Basics**

**Q: Reduce a 1.2GB image to <200MB — walk me through it.**
A: Multi-stage build (build deps in stage 1, copy artifacts to runtime stage); use `alpine`/distroless/`slim` base; `.dockerignore` (node_modules, .git); combine RUN layers; don't ship dev dependencies.

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER node                     # don't run as root
CMD ["node", "dist/server.js"]
```

**Q: Container is `Exited (137)` — what happened?**
A: 137 = SIGKILL — almost always **OOMKilled** by the kernel or `docker stop` timeout. Check `docker inspect` → `OOMKilled: true`, then raise the memory limit or find the leak.

**Q: Volumes vs bind mounts?**
A: Bind mount = map host path (dev convenience, host-coupled). Named volume = Docker-managed storage in `/var/lib/docker/volumes` — preferred for prod persistence.

**Q: Docker networking — how do two containers talk?**
A: Same user-defined bridge network → container names resolve as DNS. `docker network create app-net` then run both with `--network app-net`. Never rely on IPs.

---

## **2. Kubernetes — Core Objects**

**Q: Pod vs Deployment vs StatefulSet vs DaemonSet vs Job?**

| Object | Use it for | Key trait |
| --- | --- | --- |
| Pod | One deployable unit (1+ containers) | Ephemeral IP, smallest unit |
| Deployment | Stateless apps | Rolling updates, ReplicaSet under it |
| StatefulSet | DBs, Kafka — need identity | Stable names (`pod-0`), ordered scale, PVC per pod |
| DaemonSet | Node agents (log/monitor) | One pod per node |
| Job / CronJob | Run-to-completion tasks | Retries, scheduling |

**Q: Service types?**
A: `ClusterIP` (internal only, default) → `NodePort` (port on every node) → `LoadBalancer` (cloud LB) → Ingress (L7 routing, host/path rules, TLS termination).

**Q: A pod is `CrashLoopBackOff` — debug it.**

```bash
kubectl get pods                          # status
kubectl describe pod <name>               # events: scheduling, probes, OOM
kubectl logs <name> --previous            # logs of the crashed attempt
kubectl get events --sort-by=.lastTimestamp
```

Causes ranked: app crash → failing liveness probe → bad config/secret → OOM → image pull issues (`ImagePullBackOff` = registry/auth/tag).

**Q: Readiness vs liveness probe?**
A: Readiness = should this pod receive *traffic* (failure = removed from Service endpoints). Liveness = is the pod *healthy* (failure = restart). A pod can be live but not ready (e.g., warming a cache).

**Q: Requests vs limits?**
A: Requests = what the scheduler reserves (placement + QoS). Limits = hard ceiling — CPU gets throttled, memory gets OOMKilled.

```yaml
resources:
  requests: { cpu: 100m, memory: 128Mi }
  limits:   { cpu: 500m, memory: 512Mi }
```

**Q: ConfigMap vs Secret?**
A: Both inject config as env/files; Secret is base64 (not encryption!) + optional encryption at rest in etcd + RBAC. Rule: Secret for anything sensitive; ideally use external secret stores (Vault, AWS SM) via CSI/ESO.

---

## **3. Terraform — Working Knowledge**

**Q: What is state? Why does it matter?**
A: `terraform.tfstate` maps your config ↔ real resources. Lose it = Terraform forgets what it manages. Remote state (S3 + DynamoDB lock / Terraform Cloud) enables team collaboration and prevents concurrent corruption.

**Q: `plan` vs `apply` vs `destroy`? Modules?**
A: plan = dry-run diff. apply = execute. Module = reusable parameterised config unit (like a function).

```bash
terraform init       # providers, backend
terraform plan -out=tfplan
terraform apply tfplan
terraform fmt && terraform validate
terraform state list
terraform state mv aws_s3_bucket.old aws_s3_bucket.new   # rename without recreate
terraform import aws_instance.web i-0123456789           # adopt existing infra
terraform workspace new staging
```

**Q: How do you handle secrets in Terraform?**
A: Never in `.tf` files or state-visible plain vars — pass via env (`TF_VAR_*`), fetch from a secret manager data source, mark outputs `sensitive = true`. State still contains values → encrypt state backend + restrict access.

**Q: `count` vs `for_each`?**
A: `count` = numeric, position-indexed (removing item 1 of 3 shifts and recreates). `for_each` = keyed by map/set — deleting a key only deletes that resource. Prefer `for_each`.

---

## **4. CI/CD — Real Pipeline Questions**

**Q: Design a pipeline for a Node.js microservice.**
A: lint → unit tests → SAST/dependency scan → build image → push to registry (tag = commit SHA) → deploy to staging → integration tests + DAST → manual gate → prod (canary) → smoke tests → auto-rollback on health-check failure.

**Q: How do you rollback?**
A: Depends on deploy style: re-apply previous image tag (`kubectl rollout undo deployment/app`), flip blue-green router back, or redeploy the previous artifact version. Key: **rollback = deploy the previous artifact, not a git revert** (though revert is the long-term fix).

**Q: Secrets in CI — how?**
A: CI secret store (GitHub Secrets, GitLab masked vars), injected as env at runtime, never echoed. Better: OIDC federation → short-lived cloud credentials, no stored keys.

**Q: Caching to speed up pipelines?**
A: Dependency cache keyed by lockfile hash; Docker layer cache / registry-based cache (`--cache-from`); incremental builds. A 20min→4min pipeline is a real achievement to name-drop.

---

## **5. Monitoring & Troubleshooting**

**Q: What do you monitor — the "four golden signals"?**
A: Latency, traffic, errors, saturation (Google SRE book). Know this one cold — it's asked constantly.

**Q: Prometheus pull vs push?**
A: Prometheus **pulls** metrics by scraping `/metrics` endpoints (service discovery finds targets). Pushgateway exists for short-lived jobs.

```promql
rate(http_requests_total{status=~"5.."}[5m])              # error rate
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))  # p95 latency
```

**Q: Users report the app is slow — walk me through your debug process.**
A: (Structured answer = the real test) 1. Confirm & scope: which endpoint, since when, what changed (recent deploy?) 2. Check dashboards: error rate, latency p95, CPU/mem saturation 3. Layer by layer: LB → app → DB → external deps 4. Correlate with logs/traces for a request ID 5. Mitigate first (rollback/scale), root-cause second.

---

## **6. Scenario Grilling**

**Q: Deployment caused a spike in 500s — what do you do?**
A: Roll back immediately (mitigate first), then investigate with the old version still serving: diff the release, check logs, repro in staging. Postmortem: why did tests miss it → add coverage.

**Q: `terraform apply` deleted a prod database — now what?**
A: Restore from backup/snapshot immediately (this is why automated backups + `prevent_destroy` lifecycles matter). Then fix the config: `lifecycle { prevent_destroy = true }` on stateful resources, protect prod workspaces, require plan review.

**Q: Teammate asks "why is my pod Pending?"**
A: `kubectl describe pod` → usually insufficient resources (requests > node capacity) or unbound PVC or taints without tolerations.

---

## 📚 **Learning Resources**

* 🔗 [Kubernetes Docs — Concepts](https://kubernetes.io/docs/concepts/)
* 📦 [Terraform Tutorials (HashiCorp)](https://developer.hashicorp.com/terraform/tutorials)
* 🛡️ [Google SRE Book — Monitoring Chapter](https://sre.google/sre-book/monitoring-distributed-systems/)
