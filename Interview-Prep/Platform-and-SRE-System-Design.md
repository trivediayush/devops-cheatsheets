# 🏛️ Platform & SRE System Design Interview Playbook (2026)

Senior, Staff, and Principal **DevOps, Platform, and SRE** interviews in 2026 go far beyond "write a Dockerfile" — interviewers evaluate how you architect **multi-region resilience, zero-downtime migrations, high-scale IDPs, observability pipelines, and calm incident debugging under pressure**.

---

## **1. The 45-Minute SRE / Platform Design Framework**

| Phase | Time | What Great Senior/Staff Candidates Do |
| --- | --- | --- |
| **1. Clarify Scope & SLOs** | 5 min | Ask scale (RPS, teams, regions, data size), target **SLO / RPO / RTO**, compliance (SOC2/HIPAA), and budget |
| **2. Back-of-Envelope Math** | 5 min | Estimate peak RPS, Little's Law concurrency, bandwidth, storage/month, and telemetry cardinality |
| **3. High-Level Control & Data Planes** | 10 min | Draw clear separation between **Control Plane** (GitOps/IaC/Portal) and **Data Plane** (Runtime traffic) |
| **4. Deep-Dive 2–3 Critical Flows** | 15 min | Dive into failure modes, blast-radius isolation, zero-downtime rollouts, and security boundaries |
| **5. Failure Modes, Cost & Day-2 Ops** | 10 min | Proactively cover AZ/region loss, upgrades, observability, FinOps, and trade-offs you intentionally rejected |

---

## **2. Scenario 1: Design an Internal Developer Platform (IDP) for 500 Engineers**

### Requirements to Clarify
- 500 devs, ~300 microservices, multi-AZ/multi-region AWS/GCP, strict SOC2 compliance, self-service DBs & queues.

### Reference Architecture
```text
Developer ──► Backstage Portal (Catalog + Scaffolder Templates + TechDocs + Scorecards)
                    │  creates repo + PR (never mutates prod directly!)
                    ▼
              GitOps Fleet Repo (Kustomize + Crossplane Claims + Score specs)
                    │  signed OCI artifacts (Dagger + Cosign + Trivy + SBOM)
                    ▼
              Hub Management Cluster (Argo CD ApplicationSets + Crossplane Control Plane)
                    │  reconciles declaratively across isolated cell clusters
                    ▼
              Workload Clusters (EKS/GKE + Cilium eBPF + Gateway API + Karpenter + Kyverno + ESO)
                    │
                    ▼
              Shared Observability (Grafana Alloy -> Mimir / Loki / Tempo + Sloth SLOs + OpenCost)
```

### Key Staff-Level Trade-Offs to Highlight
- **Cell-based cluster isolation:** Split into multiple medium clusters (e.g., by region + tier) instead of one giant 5,000-node cluster — caps Kubernetes upgrade & API-server blast radius.
- **Golden Paths with escape hatches:** 85% of apps use standard templates; 15% special workloads (ML/stateful) can bring raw Kustomize/Helm while still passing mandatory Kyverno security policies.
- **Day-2 fleet upgrades:** Centralize CI via reusable workflows/Dagger and run automated Renovate PRs so upgrading 300 services takes days, not quarters.

---

## **3. Scenario 2: Multi-Region Active-Active API (`99.99%` Availability, RPO < 5s)**

### Architecture Decisions
1. **Global Entry:** Anycast edge (**Cloudflare / AWS Global Accelerator**) with health-checked regional **Gateway API / Envoy** pools (eliminates stale DNS TTL failover delays).
2. **Stateless Compute:** Independent Kubernetes clusters per region (`us-east-1`, `eu-west-1`, `ap-southeast-1`) — **zero cross-region synchronous RPC calls** on the hot request path!
3. **Data Layer Strategy (Always Call Out CAP Trade-Off!):**
   - **Option A — Regional Primary + Read Replicas (Aurora Global):** Writes route to home region (or user-sharded home cell); reads served locally (`< 10ms`). Simple consistency, `~60s` failover RTO.
   - **Option B — Distributed SQL (CockroachDB / Cloud Spanner):** True active-active writes via Raft/Paxos; pay cross-region commit latency (`40–100ms`) unless row-level geo-partitioning is used.
4. **Independent Control Planes:** Never let a control-plane outage in `us-east-1` prevent `eu-west-1` from serving traffic or autoscaling (**Static Stability** — pre-provisioned warm capacity + cached configs).
5. **Continuous Proof:** Run monthly regional traffic evacuation drills (drain 100% traffic out of `us-east-1` for 30 min during business hours).

---

## **4. Scenario 3: Zero-Downtime Database Migration (40M+ Row Table in Prod)**

Never run a locking `ALTER TABLE` or big-bang cutover on a live `99.99%` service! Use the **Expand-and-Contract (Parallel Change)** pattern:

```text
Phase 1 (Expand):    Add new nullable column / new DB table (online DDL, zero locks)
Phase 2 (Dual-Write): App writes to BOTH old & new schema; reads from old
Phase 3 (Backfill):  Throttled background worker copies historical rows in batches (check replication lag!)
Phase 4 (Verify):    Dark-read shadow comparator validates 100% parity (old vs new)
Phase 5 (Cutover):   Feature-flag reads from old -> new (1% -> 10% -> 100%, instant rollback!)
Phase 6 (Contract):  Stop writing old column; drop old column 1–2 sprints later
```

---

## **5. Scenario 4: High-Throughput Observability Pipeline (10M Logs/sec + 500k Spans/sec)**

### Key Bottlenecks & Solutions
- **Ingestion Spikes:** Place a durable buffer (**Kafka / Redpanda**) between edge collectors (**Grafana Alloy / OTel Collector**) and storage backends so traffic bursts never drop telemetry or OOM storage nodes.
- **Cost Explosion (Top Interview Question!):**
  - Enforce **Tail-Based Sampling** (keep 100% of `5xx` & latency `> p95` traces, sample `2–5%` of healthy traces).
  - Switch full-text log indexing (ELK) to **Loki label + structured metadata indexing** on S3/GCS.
  - Drop unused high-cardinality Prometheus labels (`pod_uid`, raw URL paths with IDs) at the collector before `remote_write`.
- **Self-Monitoring ("Who Watches the Watcher?"):** Run a lightweight independent meta-monitoring probe outside the main cluster checking Alertmanager dead-man's-switch heartbeat (`Watchdog` alert → PagerDuty).

---

## **6. Scenario 5: Live Production Debugging Round ("Latency Jumped 5x After Zero Deploys!")**

Interviewers love testing systematic debugging rather than random guessing. Follow **USE + RED + Isolation**:

1. **Scope the Blast Radius:** One endpoint or all? One region/AZ or global? All users or one large tenant?
2. **Check Changes Beyond App Deploys:** Upstream vendor degradation? Cloud AZ incident? Traffic mix shift (bot/scraper surge)? Cron job / batch ETL running? Certificate or cache TTL expiry?
3. **Walk the Request Path via Traces (Tempo/Jaeger):** Where is the extra 400ms spent — Edge/TLS, Gateway/Envoy, App CPU/GC, DNS lookup, Redis cache miss storm, or DB lock contention?
4. **Check Saturation (USE Method):**
   - **CPU throttling** (`container_cpu_cfs_throttled_periods_total` — noisy CPU limit!)
   - **DB connection pool queuing** (`pg_stat_activity` waiting on locks / dead tuples / autovacuum / bad query plan flip)
   - **Network/DNS** (`conntrack` table full, CoreDNS timeouts, NAT Gateway port exhaustion)
5. **Mitigate First, Root-Cause Second:** Enable rate-limiting/load-shedding for abusive tenant, scale read replicas, bypass broken cache, or shift traffic away from degraded AZ.

---

## **7. High-Signal Staff Trade-Off Cheat Sheet**

| Design Dilemma | Nuanced Senior/Staff Answer |
| --- | --- |
| **Monorepo vs Polyrepo for GitOps?** | App code can be polyrepo or monorepo, but **cluster fleet state** works best in environment/domain-scoped GitOps repos (or OCI artifacts) to isolate RBAC and speed up Argo/Flux syncs |
| **Sidecar Mesh (Istio) vs Sidecar-less (Cilium / Istio Ambient)?** | Prefer **sidecar-less eBPF/Ambient** in 2026 for lower RAM overhead, faster pod startup, and decoupled proxy upgrades unless legacy per-pod Envoy WASM filters are mandatory |
| **CPU Limits on Kubernetes Pods?** | Set **CPU `requests`** accurately + **Memory `requests == limits`** (prevents surprise OOM kills), and consider **omitting CPU `limits`** on latency-sensitive services to avoid unnecessary Linux CFS throttling |
| **Build vs Buy (Observability / IDP / CI)?** | Buy commodity SaaS when team < 50 engineers (time-to-market wins); adopt open-source CNCF standards (**OTel + LGTM + Backstage + Crossplane**) at scale to prevent 7-figure vendor lock-in |
