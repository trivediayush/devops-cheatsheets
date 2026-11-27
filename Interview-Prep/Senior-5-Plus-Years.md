# 🎯 DevOps Interview — Senior / Lead (5+ Years)

**What interviewers test at this level**: architecture, organizational leverage, and decision quality under ambiguity. You're evaluated on *trade-off articulation*, cost awareness, failure-mode thinking, and whether you multiply the team around you.

| Expectation | What it means |
| --- | --- |
| System design | Design multi-region platforms, deployment systems, observability at scale |
| Business-aware engineering | Cost, risk, velocity trade-offs; SLAs with numbers |
| Failure-mode thinking | "What breaks when X dies?" is your reflex |
| Org leverage | Paved roads, platform engineering, mentoring, standards |

---

## **1. Architecture & System Design**

**Q: Design an internal developer platform so 200 engineers can deploy safely.** *(the defining senior question)*
A: Structure your answer:
1. **Golden path**: templates + paved-road CI/CD (reusable workflows), service catalog (Backstage), IDP giving `new-service → repo + pipeline + observability + dashboard` in minutes.
2. **Deployment**: GitOps (Argo CD) — cluster pulls desired state, drift auto-reconciled; progressive delivery (canary via Flagger/Argo Rollouts) with metric-based auto-rollback.
3. **Guardrails, not gates**: OPA/Kyverno admission policies, default NetworkPolicies, Pod Security Standards — secure by default, not by review queue.
4. **Self-service infra**: Terraform modules + Atlantis/Spacelift for PR-based provisioning; environment ephemeral previews.
5. **Platform as product**: measure adoption, DORA metrics, developer NPS — a platform nobody uses is a failure.

**Q: GitOps vs push-based deploys — argue both sides.**
A: GitOps (pull): audit trail = git log, cluster credentials never leave the cluster, drift self-corrects, easy rollback (`git revert`). Push: simpler mental model, works for non-K8s targets, better for one-off/imperative ops. Most mature orgs: GitOps for workloads, push for platform bootstrap (the chicken-and-egg problem — you still bootstrap the GitOps agent).

**Q: Multi-region active-active — what actually makes it hard?**
A: **Data**, not compute. Stateless services are easy; the hard parts are: synchronous replication latency (CAP — pick consistency or availability during partition), write conflicts in multi-writer setups, DNS/global traffic management (Route 53 latency/geo routing, GSLB), distributed transactions vs sagas, and testing failover regularly (GameDay/chaos — an untested DR plan is a hope, not a plan).

**Q: Design a deployment system for zero-downtime DB schema changes at scale.**
A: Expand-and-contract pattern enforced by tooling: lint migrations for dangerous ops (`NOT NULL` without default, `DROP` in same release), phased rollout tooling (gh-ost, Reshape, Atlas), backward/forward-compatible code deploys (N and N-1 schema must coexist), automated batch backfills with throttle.

---

## **2. SRE Deep Cuts**

**Q: Walk me through SLI→SLO→error-budget-driven release policy.**
A: Pick user-facing SLIs (availability = good/total requests; latency = % under threshold). Set SLO below SLA (99.9% internal vs 99.5% contractual = buffer). Error budget = 1−SLO → e.g., 43.2 min downtime/month at 99.9%. Policy: budget healthy → ship fast; budget burned >X% → freeze risky deploys, shift eng capacity to reliability. It converts the dev-vs-ops tension into a shared metric.

**Q: Why not aim for 100% reliability?**
A: Each 9 costs roughly an order of magnitude more (multi-region, formal verification, chaos programs) while users can't perceive it — their last mile (Wi-Fi, browser, ISP) is flakier than your 99.95%. Spend the marginal dollar on features or reducing MTTR instead. **MTTR beats MTBF** at scale — things will fail; optimize detection + recovery speed.

**Q: Reduce MTTR — concretely?**
A: Detection: symptom-based alerts, short MTTD via burn-rate alerts. Triage: one-click dashboards, traces with request IDs, "recent deploys" overlay. Mitigation: practiced rollback (deploy = one command), feature flags to kill-switch changes without redeploy, runbooks + incident roles (IC, ops, comms). Learning: blameless postmortems with action items that actually get tracked.

**Q: Chaos engineering — where does it fit?**
A: Controlled failure injection (kill AZ, add latency, drop DNS) in *staging first, then prod during business hours* — proving resilience hypotheses before reality tests them. Start with a hypothesis ("survives one AZ loss with <5% error"), blast radius limits, and an abort button.

---

## **3. Cost, Capacity & Cloud Judgment**

**Q: Cloud bill grew 40% in a quarter — find it.**
A: Tag everything (cost-center/env/service) → cost explorer by tag and service → top movers are usually: data egress (cross-AZ/region/NAT — silent killer), idle/dev resources on 24×7, oversized requests (right-size via VPA recommendations), storage growth (unbounded logs/snapshots), Spot/commitment coverage dropped. Fixes: Savings Plans/RIs for steady baseline, Spot for fault-tolerant compute, autoscaling, S3 lifecycle policies, VPC endpoints to skip NAT fees, FinOps dashboards per team (cost as a metric → accountability).

**Q: Managed service vs self-host on K8s — how do you decide?**
A: Decision factors, not religion: team expertise & on-call cost (running Postgres HA yourself is a career), differentiating vs commodity work (don't run your own Kafka unless it *is* your business), managed premium vs engineer-hours math, portability/lock-in requirements, and compliance. Commodity infra → managed. Core competency → own it.

**Q: When do you say no to Kubernetes?**
A: Small team + simple workload → PaaS/ECS/App Runner beats a k8s control plane you now own. Serverless for spiky/event workloads. K8s earns its complexity at multi-service scale, when you need its primitives (operators, scheduling, ecosystem) — not because it's on everyone's resume.

---

## **4. Security & Compliance at Scale**

**Q: Supply-chain security — design controls for it.**
A: Dependency: lockfiles + SCA gates + private registry proxy (Artifactory) with curated upstream. Build: hermetic/reproducible builds, ephemeral CI runners (no state leak between jobs), OIDC cloud auth (no stored secrets), signed commits. Artifact: SBOM per build (CycloneDX), image signing (Cosign/Sigstore), admission policy: *only signed images run*. Runtime: least-privilege IRSA/workload identity, seccomp/AppArmor, no `:latest` tags, egress policies. Compliance mapping: SLSA levels — name-drop SLSA L3 as a target.

**Q: A secret hit a public repo — incident response at scale?**
A: Rotate immediately (assume scraped within minutes) → audit usage logs for the leaked cred → purge history → find root cause (why could a dev put it there? add pre-commit + push protection + short-lived creds so it can't recur). Then systemic fix: move the class of secrets to OIDC/managed identity so there's nothing to leak.

---

## **5. Leadership & Process Grilling**

**Q: Dev vs ops "throw over the wall" culture — fix it.**
A: Don't reorganize first — change incentives: shared on-call rotation (devs carry the pager for what they ship), shared SLOs, embedded platform team providing self-service (product mindset: internal customers, paved roads), DORA metrics visible to leadership. You can't mandate culture; you redesign the system so the right behavior is the easy behavior.

**Q: DORA metrics — name them and their failure modes.**
A: Deployment frequency, lead time for changes, change failure rate, MTTR. Gaming risks: shipping trivial changes to boost frequency, hiding failures by not paging. Use as team health signals, not individual scorecards.

**Q: Tell me about a technical decision you reversed.**
A: Have a real one (e.g., adopted service mesh → complexity outweighed benefit → rolled back to ingress + sidecarless mTLS). Senior = knowing when sunk cost isn't a reason to continue.

**Q: How do you evaluate a new tool vs building in-house?**
A: Total cost incl. maintenance/on-call (the hidden 70%), maturity & community, exit cost (data/API portability), whether it's your differentiator. Run a bounded spike, document the decision in an ADR (Architecture Decision Record) — bring up ADRs unprompted; it's a senior signal.

---

## **6. Scenario Gauntlet — Practice These**

| Scenario | What they're probing |
| --- | --- |
| "Black Friday traffic 10× — prep the platform." | Capacity planning, load testing, autoscaling limits, graceful degradation, feature flags |
| "Prod is down, CEO wants updates every 5 min." | Incident command, comms discipline, mitigation-first |
| "Migrate 100 VMs to Kubernetes in a year." | Phasing, strangler pattern, not everything belongs on k8s, team enablement |
| "Your best engineer pushes to prod on Fridays and breaks things." | People problem disguised as tech — deploy windows, flags, coaching |
| "Design CI for a regulated industry (audit + approvals)." | Segregation of duties, signed artifacts, immutable audit trail, change management |

---

## 📚 **Learning Resources**

* 🔗 [The Site Reliability Workbook](https://sre.google/workbook/table-of-contents/)
* 📦 [Platform Engineering — Team Topologies](https://teamtopologies.com/)
* 🛡️ [SLSA Supply-Chain Framework](https://slsa.dev/)
* 📐 [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)
