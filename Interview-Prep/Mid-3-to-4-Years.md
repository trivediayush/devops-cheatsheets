# 🎯 DevOps Interview — Mid-Level (3–4 Years)

**What interviewers test at this level**: internals, trade-offs, and judgment. "It depends" with reasoning is a *better* answer than a confident absolute. Expect "design X", "why would you choose X over Y", and production-incident scenarios.

| Expectation | What it means |
| --- | --- |
| Internals | How K8s schedules, how Terraform decides a plan, how the scheduler/kubelet/etcd interact |
| Trade-off reasoning | Managed vs self-hosted, monorepo vs polyrepo, sync vs async deploys |
| Production maturity | Incidents, on-call, rollbacks, DR, security in the pipeline |
| Scaling systems & teams | Multi-env promotion, modules/templates, paved-road thinking |

---

## **1. Kubernetes Internals — The Deep End**

**Q: What happens when you `kubectl apply` a Deployment?** *(trace the full path)*
A: `kubectl` → API server (authN/authZ/admission) → object stored in **etcd** → Deployment **controller** sees it, creates ReplicaSet → **scheduler** assigns pods to nodes (filters by resources/taints/affinity, scores) → **kubelet** on node pulls image via container runtime → CNI sets up networking → kubelet reports status back. Everything is a *reconciliation loop*: controllers continuously drive actual → desired state.

**Q: etcd — what is it and why does the cluster die without it?**
A: Distributed, strongly-consistent (Raft) key-value store holding ALL cluster state. Lose quorum = API server can't read/write = cluster brain dead even if workloads keep running. Backup etcd snapshots; odd-numbered members (3/5) for quorum.

**Q: How does pod-to-pod networking work?**
A: Each pod gets a unique IP (flat network, no NAT between pods — a K8s requirement). The **CNI plugin** (Calico, Cilium, AWS VPC-CNI) programs routes/overlay. `kube-proxy` (or eBPF replacement) implements Service VIPs via iptables/IPVS rules.

**Q: NetworkPolicy?**
A: L3/L4 firewall for pods — default is allow-all; a NetworkPolicy selects pods and whitelists ingress/egress (needs a CNI that enforces it). "Default deny + explicit allow" is the secure posture.

**Q: HPA vs VPA vs Cluster Autoscaler vs Karpenter?**
A: HPA = scale pod *count* on CPU/custom metrics. VPA = right-size pod *requests* vertically. Cluster Autoscaler/Karpenter = scale *nodes* when pods are unschedulable. They compose: HPA scales pods → unschedulable pods trigger node scale-up.

**Q: PDB, taints, affinity — the availability toolkit.**

```yaml
# PodDisruptionBudget — keep 2 pods alive during drains/upgrades
apiVersion: policy/v1
kind: PodDisruptionBudget
spec:
  minAvailable: 2
  selector:
    matchLabels: { app: api }
---
# Anti-affinity — spread pods across nodes/AZs
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector: { matchLabels: { app: api } }
          topologyKey: topology.kubernetes.io/zone
```

**Q: Helm — when does it bite you?**
A: Templating complexity (values merge order is confusing), CRDs aren't managed by lifecycle hooks, `helm upgrade` doesn't apply CRDs, drift when someone edits resources outside Helm. Know: `helm template` for debugging, `--atomic --wait` for auto-rollback on failed upgrade.

---

## **2. Terraform — State, Modules, Scale**

**Q: How does Terraform compute a plan?**
A: Refreshes real resource state (API calls) → builds dependency **graph** from references → diffs config vs refreshed state → outputs create/update/delete. It's a graph walk, which is why `depends_on` exists for hidden dependencies.

**Q: State got corrupted / locked — recover.**
A: Lock: `terraform force-unlock <LOCK_ID>` (verify the holder is dead first!). Corruption: restore versioned state backup (S3 versioning — always enable), or `terraform state rm` + `import` to re-adopt.

**Q: Monorepo vs separate repos for IaC? Terragrunt?**
A: Monorepo = atomic cross-stack changes, shared modules, but big blast radius and CI complexity. Split repos = autonomy, but version skew. Terragrunt = thin wrapper adding DRY `terraform {}`/`inputs` config + dependency ordering across stacks.

**Q: `moved` blocks vs `terraform state mv`?**
A: `moved` blocks (TF ≥1.1) codify renames *in config* — they apply for everyone on next plan; `state mv` is a one-off local/surgical command. Prefer `moved` blocks in shared codebases.

**Q: How do you structure environments — workspaces vs directories?**
A: Workspaces share config but share state backend risk + can't vary provider config per env cleanly; directory-per-env (`envs/dev`, `envs/prod`) with shared modules = isolated state, env-specific backend — the common prod-grade pattern.

---

## **3. Pipeline & Platform Design**

**Q: Design CI/CD for 50 microservices — monorepo or not?**
A: Either is defensible — justify it. Monorepo: shared pipeline templates, atomic refactors, needs strong CI (affected-only builds — Bazel/Nx/path filters). Polyrepo: team autonomy, simpler CI, but dependency/version management and duplicated pipeline logic. Paved path: reusable pipeline *library* (GitHub Actions reusable workflows / Jenkins shared libraries) so teams don't roll their own.

**Q: Secrets management at scale?**
A: Central secret store (Vault, AWS Secrets Manager) → workloads authenticate via identity (K8s SA → OIDC → cloud role), secrets injected at runtime via CSI driver / External Secrets Operator → syncs to K8s Secrets or mounts. Rotation: short TTL, dynamic DB creds. CI itself uses OIDC → no long-lived keys anywhere.

**Q: Progressive delivery — implement a canary without a service mesh?**
A: Two Deployments (stable + canary) behind one Service; Ingress controller weighting (NGINX/ALB annotations) or Argo Rollouts / Flagger automating analysis (metrics-based promote/rollback). Mesh (Istio) gives finer traffic splits + shadowing.

**Q: What's a pipeline "security gate" and where do they go?**
A: Automated pass/fail checkpoints: secrets (pre-commit+CI), SAST & SCA (PR/build), image scan (registry/post-build), IaC scan (plan stage), DAST (staging), policy-as-code (pre-deploy). Gate = exit code + severity threshold; everything else reports-only. See DevSecOps cheatsheet.

---

## **4. Observability — Metrics, Logs, Traces**

**Q: The three pillars — and when each fails you.**
A: Metrics = aggregates, cheap, great for alerts, bad for "what happened to THIS request". Logs = detailed events, expensive at scale, need structure (JSON) + correlation IDs. Traces = request journey across services (OpenTelemetry) — the only way to debug latency in distributed systems. You need all three linked by trace/request ID.

**Q: Design an alert that wakes someone up — what makes a good alert?**
A: Pages on **symptoms** (user-facing: error rate, latency SLO burn), not causes (CPU high). Multi-window burn-rate alerting for SLOs. Every alert must have a runbook link and be actionable — if it fires and no action is needed, delete it (alert fatigue kills on-call).

```promql
# Burn-rate alert: 2% of 30d error budget consumed in 1h
sum(rate(http_requests_total{status=~"5.."}[1h]))
  / sum(rate(http_requests_total[1h]))
  > (0.02 * 0.001) / 3600   # budget fraction / window
```

**Q: Cardinality — why did Prometheus fall over?**
A: Too many unique label combinations (e.g., `user_id`, `request_id` as labels → millions of time series → OOM). Rule: labels = bounded dimensions only (endpoint, status, region — never IDs).

---

## **5. Reliability & Incident Scenarios**

**Q: Define SLI / SLO / SLA / error budget.**
A: SLI = measured metric (e.g., % requests <300ms). SLO = internal target (99.9%). SLA = contractual target with penalties (usually looser than SLO). Error budget = allowed failure (0.1% of requests/month) — spend it on velocity; when exhausted, freeze releases.

**Q: Design for zone failure vs region failure?**
A: Zone: multi-AZ deployment + cross-AZ LB — table stakes. Region: multi-region DR — active-active (hard: data replication, split-brain) vs active-passive (RTO/RPO trade-offs). Always define **RTO** (how fast you must be back) and **RPO** (how much data you can lose) first — they drive the architecture.

**Q: Database migration on a 500GB prod table with zero downtime — how?**
A: Expand-and-contract: add new column nullable → dual-write/backfill in batches → switch reads → drop old column in a later release. Never one big `ALTER TABLE` on a live table (locks). Tools: gh-ost/pt-online-schema-change for MySQL.

**Q: Your node pool ran out of IPs — what's going on?**
A: VPC CNI allocates IPs per pod; subnet exhausted → pods Pending. Fix: bigger pod CIDR/secondary CIDR ranges, prefix delegation, or IPAM tuning (`WARM_IP_TARGET`).

---

## **6. Grilling Traps at This Level**

* "It depends" without criteria is a dodge — follow with *what* it depends on.
* Know your last incident deeply: timeline, detection → mitigation → RCA → preventive fix. Interviewers smell rehearsed postmortems.
* If asked "biggest mistake", have a real one with a remediation story — "I work too hard" is an eye-roll.

---

## 📚 **Learning Resources**

* 🔗 [Kubernetes Components Deep Dive](https://kubernetes.io/docs/concepts/overview/components/)
* 📦 [Google SRE Workbook — Alerting](https://sre.google/workbook/alerting-on-slos/)
* 🛡️ [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
