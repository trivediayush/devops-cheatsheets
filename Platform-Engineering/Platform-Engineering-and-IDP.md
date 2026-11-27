# 🏗️ Platform Engineering & Internal Developer Platforms (IDP) Cheatsheet

**Platform Engineering** treats internal infrastructure and delivery tooling as a **product** built for application developers. Instead of filing tickets to an ops queue or forcing every product team to master Terraform, Helm, IAM, and Istio from scratch, a platform team builds an **Internal Developer Platform (IDP)** with self-service **Golden Paths** (paved roads) that encode security, compliance, FinOps, and observability by default.

---

## **1. DevOps vs SRE vs Platform Engineering (2026 Model)**

| Discipline | Primary Focus | Core Customers | Key Artifacts | Success Metric |
| --- | --- | --- | --- | --- |
| **DevOps** | Culture & practices bridging dev and ops | Engineering org | CI/CD pipelines, IaC, automation | Lead time, deploy frequency |
| **SRE** | Production reliability, latency, resilience | End users & product teams | SLIs/SLOs, error budgets, runbooks, chaos | Availability, MTTR, toil % |
| **Platform Engineering** | Self-service paved roads & developer experience | Internal app developers | IDP, Golden Paths, Control Planes, Templates | Time-to-first-PR, DevEx, adoption % |

```text
The 5 Planes of a Modern 2026 Internal Developer Platform:

  ┌──────────────────────────────────────────────────────────┐
  │ 1. Developer Control Plane (Portal / CLI / Git)          │
  │    Backstage · Score · GitOps PRs · Platform CLI         │
  ├──────────────────────────────────────────────────────────┤
  │ 2. Integration & Delivery Plane                          │
  │    GitHub Actions · Dagger · Argo CD / Flux · Rollouts   │
  ├──────────────────────────────────────────────────────────┤
  │ 3. Resource & Orchestration Plane                        │
  │    Kubernetes · Crossplane · OpenTofu · Karpenter · KEDA │
  ├──────────────────────────────────────────────────────────┤
  │ 4. Observability & FinOps Plane                          │
  │    OpenTelemetry · LGTM (Loki/Grafana/Tempo/Mimir)       │
  ├──────────────────────────────────────────────────────────┤
  │ 5. Security & Governance Plane                           │
  │    Kyverno · SPIFFE/SPIRE · External Secrets · Sigstore  │
  └──────────────────────────────────────────────────────────┘
```

---

## **2. Core Principles (Platform as a Product)**

1. **Thinnest Viable Platform (TVP)** — Start with the smallest set of paved roads that solves the top 2–3 developer bottlenecks (e.g., "scaffold a microservice with CI, observability, and staging deploy in < 10 minutes"). Never build a giant platform in isolation.
2. **Golden Paths, Not Golden Cages** — Make the right thing the easiest thing, while keeping an **escape hatch** for teams with legitimate edge-case requirements.
3. **Low Cognitive Load** — Abstract *boilerplate* (VPC peering, IRSA bindings, Prometheus scrape annotations, TLS certs), not *understanding*.
4. **Declarative Workload Specs** — Developers declare *what* their app needs (port, Postgres DB, Redis cache, env vars), and the platform provisions *how* it runs per environment (Docker Compose locally, EKS + RDS in prod).
5. **Shift-Down Security** — Bake SBOMs, image signing, Kyverno policies, and least-privilege IAM into the Golden Path so devs get compliance for free.

---

## **3. Workload Specification with Score (CNCF)**

**Score** decouples what an app requires from the underlying orchestrator. One `score.yaml` works across local Docker Compose and production Kubernetes/Crossplane:

```yaml
# score.yaml — owned by the application developer
apiVersion: score.dev/v1b1
metadata:
  name: checkout-api

containers:
  api:
    image: .
    variables:
      PORT: "8080"
      DB_HOST: "${resources.db.host}"
      DB_PORT: "${resources.db.port}"
      DB_NAME: "${resources.db.name}"
      DB_USER: "${resources.db.username}"
      DB_PASS: "${resources.db.password}"
      REDIS_URL: "redis://${resources.cache.host}:${resources.cache.port}"

service:
  ports:
    http:
      port: 80
      targetPort: 8080

resources:
  db:
    type: postgres
    params:
      version: "16"
  cache:
    type: redis
  dns:
    type: dns
  route:
    type: route
    params:
      host: ${resources.dns.host}
      path: /
      port: 80
```

```bash
# Render for local development (Docker Compose):
score-compose init
score-compose generate score.yaml
docker compose up --build

# Render for Kubernetes (Deployment + Service + HTTPRoute + Crossplane Claims):
score-k8s init
score-k8s generate score.yaml
kubectl apply -f manifests.yaml
```

---

## **4. Measuring Platform Success: DORA + SPACE + DevEx**

### DORA Metrics (2026 Benchmarks)

| Metric | Elite | High | Medium | Low |
| --- | --- | --- | --- | --- |
| **Deployment Frequency** | On-demand (multiple/day) | Daily to weekly | Weekly to monthly | < Monthly |
| **Lead Time for Changes** | < 1 hour | 1 day – 1 week | 1 week – 1 month | > 1 month |
| **Change Failure Rate (CFR)** | 0 – 5% | 5 – 10% | 10 – 15% | > 15% |
| **Failed Deployment Recovery Time** | < 1 hour | < 1 day | 1 day – 1 week | > 1 week |
| **Rework Rate** *(added in recent DORA)* | < 2% | 2 – 5% | 5 – 10% | > 10% |

### DevEx Core Dimensions (Forsgren / Noda)

| Dimension | What It Measures | Platform Lever |
| --- | --- | --- |
| **Feedback Loops** | CI build wait, PR review latency, local test speed | Ephemeral preview envs, Dagger/Bazel remote cache |
| **Cognitive Load** | Context switching, tribal knowledge, YAML sprawl | Golden Path templates, Score, unified portal |
| **Flow State** | Uninterrupted coding blocks, self-service autonomy | Zero-ticket DB/queue/namespace provisioning |

### Platform Product KPIs
- **Time to Hello World (TTHW)** — Minutes from onboarding a new hire to shipping their first PR to production (target: Day 1).
- **Golden Path Adoption Rate** — `%` of production services running on paved templates vs bespoke snowflaked infra.
- **Self-Service Ratio** — `%` of infra changes completed without a human ops ticket.
- **Platform NPS / Quarterly DevEx Survey** — Qualitative signal from internal users.

---

## **5. Team Topologies for Platform Teams**

```text
Stream-Aligned Teams (Product / Feature Teams)
       │  consumes via X-as-a-Service (self-service API / portal / templates)
       ▼
Platform Team (Builds & operates the IDP + Golden Paths)
       ▲  temporary collaboration / upskilling
       │
Enabling Team (Security, SRE, FinOps coaches helping teams adopt paved roads)
```

| Interaction Mode | When to Use |
| --- | --- |
| **Collaboration** | Early discovery of a new Golden Path (2–6 weeks with 1–2 pilot product teams) |
| **X-as-a-Service** | Steady-state consumption via APIs, Backstage templates, Crossplane XRs |
| **Facilitating** | Helping a team migrate off legacy infra onto the platform |

---

## **6. Ephemeral Environments & Golden Path Lifecycle**

A production-grade 2026 Golden Path automates the entire service lifecycle:

1. **Scaffold** — Developer picks a template in Backstage (`Go API + Postgres + OTel`).
2. **Bootstrap** — Template creates Git repo, registers in Software Catalog, adds CI workflow, Dockerfile, Helm/Kustomize manifests, and Argo CD Application.
3. **Preview on PR** — Opening a PR spins up an isolated preview namespace (`pr-412`) with seeded test data and posts the preview URL on the PR.
4. **Promote via GitOps** — Merging to `main` builds a signed OCI image (Cosign + SBOM), updates staging manifest, runs smoke/contract tests, then opens a promotion PR to production.
5. **Observe & Cost-Track** — Auto-wired Grafana dashboard, SLO alerts, and Kubecost/OpenCost namespace labels appear on day 0.
6. **Day-2 Maintenance** — Automated Renovate/Dependabot PRs + template drift notifications keep services patched.

---

## **7. CNCF Platform Maturity Model**

| Level | Stage | Characteristics |
| --- | --- | --- |
| **Level 1** | **Provisional** | Ad-hoc scripts, wiki docs, manual Jira tickets for infra |
| **Level 2** | **Operational** | Reusable Terraform modules & CI templates, still ticket-driven for exceptions |
| **Level 3** | **Scalable** | Self-service IDP (Backstage + Crossplane/GitOps), standardized Golden Paths, automated guardrails |
| **Level 4** | **Optimizing** | Product-managed platform, measured DevEx/DORA KPIs, continuous feedback loops, multi-cloud portability |

---

## **8. Common Anti-Patterns & Pitfalls**

| Anti-Pattern | Why It Fails | Fix |
| --- | --- | --- |
| **Renaming Ops to "Platform"** | Same ticket queue, new title | Measure self-service ratio and eliminate manual handoffs |
| **Portal-First, API-Never** | Pretty UI wrapping broken/slow scripts | Build clean declarative APIs (Crossplane/GitOps) first; put UI on top |
| **Over-Abstraction** | Devs cannot debug when pods crash or queries stall | Expose logs, traces, events, and raw K8s status transparently |
| **Mandated Adoption Too Early** | Product teams resent immature tooling | Earn adoption with 2 pilot teams, iterate, then standardize |
| **Ignoring Day-2 Operations** | Easy to scaffold Day-1, impossible to upgrade 200 repos on Day-200 | Pair templates with automated fleet upgrades (Renovate, central reusable workflows) |

---

## **9. Interview Quick-Fire**

- **Q: How do you decide what belongs in an IDP vs. what stays with product teams?**
  **A:** Anything undifferentiated, repeated across >= 3 teams, or carrying compliance/reliability risk (CI pipelines, cluster provisioning, secrets, telemetry, databases) belongs in the platform; domain business logic stays with stream-aligned teams.
- **Q: What is the difference between a Developer Portal and an IDP?**
  **A:** A portal (like Backstage) is the **frontend interface** for discovery and triggering actions; the **IDP** is the entire ecosystem underneath (orchestrators, GitOps controllers, Crossplane/OpenTofu, policy engines, observability).
- **Q: How do you prevent Golden Paths from turning into bottlenecks?**
  **A:** Keep templates modular, accept inner-source PRs from product engineers, maintain an explicit escape hatch for special workloads, and publish SLAs for platform APIs.
