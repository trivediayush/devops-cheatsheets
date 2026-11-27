# 🚀 The Modern DevOps Stack — Newer Tools by Category

**The current-generation tooling landscape.** Not the classics (those have their own cheatsheets) — the newer tools reshaping each category. What they are, why they exist, and when they're worth it.

---

## **1. Kubernetes — The New Layer**

| Tool | Replaces/extends | Why it matters |
| --- | --- | --- |
| **Karpenter** | Cluster Autoscaler | provisions right-sized nodes on-demand, consolidates, much faster scale-up |
| **Gateway API** | Ingress | standard, role-separated L4/L7 routing — the Ingress successor |
| **Cilium (eBPF)** | kube-proxy + CNI | kernel-level networking without iptables, observability + NetworkPolicy |
| **Kyverno / OPA-Gatekeeper** | admission control | policy-as-code in YAML (Kyverno) or Rego — no custom webhooks |
| **Crossplane** | cloud APIs in K8s | provision cloud resources as CRDs — "K8s as control plane for everything" |
| **vCluster** | multi-tenancy | virtual clusters inside one physical — cheap isolation |
| **ArgoCD / Flux** | kubectl apply | GitOps controllers — see the GitOps cheatsheet |
| **KEDA** | basic HPA | event-driven scaling (queue depth, cron, custom metrics) |

---

## **2. CI/CD — The New Engines**

| Tool | What it is |
| --- | --- |
| **Dagger** | pipelines as code (Go/Python/TS) — runs the same locally and in CI |
| **GitHub Actions** | the default for hosted CI — matrix builds, reusable workflows, OIDC to cloud (no stored creds) |
| **Argo Workflows** | K8s-native pipeline engine (DAG/steps as CRDs) |
| **Tekton** | the lower-level K8s CI framework Argo/GKE-style systems build on |
| **Nix / Earthly / Bazel** | hermetic builds — bit-identical outputs everywhere |
| **GitHub Merge Queue / GitLab Merge Trains** | serialized merge testing — the "green main" enforcer |

```yaml
# The modern pattern — OIDC instead of stored cloud creds:
permissions:
  id-token: write
steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::123:role/deploy   # no long-lived keys
      aws-region: us-east-1
```

---

## **3. Containers & Local Dev**

| Tool | What it does |
| --- | --- |
| **nerdctl / Rancher Desktop** | containerd-native Docker-compatible CLI / Docker Desktop alternative |
| **OrbStack** | fast lightweight Docker+Linux on macOS (Docker Desktop alternative) |
| **Podman + Quadlet** | daemonless containers managed as systemd units |
| **BuildKit / buildx** | the build engine — multi-arch, secrets, cache mounts, remote builders |
| **kaniko / ko / Jib / Buildpacks** | daemonless image builds — kaniko (in-cluster), ko (Go→image in 1 cmd), Jib (Java, no Dockerfile) |
| **devcontainers** | reproducible dev env in a container — VS Code/JetBrains/GH Codespaces |
| **DevPod / Codespaces / Gitpod** | cloud/on-demand dev environments |

---

## **4. Security & Supply Chain**

| Tool | Layer |
| --- | --- |
| **Sigstore (cosign, Rekor, Fulcio)** | sign/verify images + SBOMs — the supply-chain signing standard |
| **SLSA** | provenance framework — "was this built by the declared pipeline?" |
| **Syft / Grype** | SBOM generation / SBOM-based scanning (anchore pair) |
| **Trivy Operator** | in-cluster continuous scanning — reports as CRDs |
| **OPA / Conftest / Kyverno** | policy-as-code across configs, pipelines, K8s |
| **OpenSSF Scorecard** | repo health/security posture scanner |
| **CNAPP** (Wiz, Orca, Lacework-style) | unified cloud+workload+identity security posture |
| **secrets: SOPS / External Secrets** | encrypted-in-git secrets / sync from Vault/cloud SM |

```bash
# The modern supply-chain ritual:
cosign sign --key cosign.key reg.local/app:1.0
cosign verify --key cosign.pub reg.local/app:1.0
cosign attest --predicate sbom.spdx reg.local/app:1.0
syft reg.local/app:1.0 -o spdx-json > sbom.json
grype sbom:sbom.json
```

---

## **5. Observability — The New Pillars**

| Tool | What it is |
| --- | --- |
| **OpenTelemetry (OTel)** | the vendor-neutral instrumentation+collector standard — instrument once, ship anywhere |
| **eBPF auto-instrumentation** (Pixie, Cilium Hubble, Beyla, Coroot) | zero-code-change visibility straight from the kernel |
| **Grafana LGTM** | Loki + Grafana + Tempo + Mimir — the OSS Prometheus-era stack |
| **VictoriaMetrics** | drop-in Prometheus-compatible, way more efficient |
| **Tempo / Pyroscope** | traces / continuous profiling at scale |
| **OpenObserve / SigNoz / Uptrace** | all-in-one OTel-native backends (lighter than full ELK) |
| **OpenCost / Kubecost / Infracost** | K8s cost visibility / cloud cost in PRs (FinOps tooling) |

```text
The modern flow: OTel SDK (or eBPF auto-instr) → OTel Collector
   → Tempo(traces) + Mimir/Prometheus(metrics) + Loki(logs) → Grafana
   ← one pipeline, every signal, vendor-neutral
```

---

## **6. IaC & Platform Engineering**

| Tool | Position |
| --- | --- |
| **OpenTofu** | community Terraform fork (post-license-change) — drop-in compatible |
| **Pulumi** | IaC in real languages (TS/Python/Go) instead of HCL |
| **Crossplane** | cloud resources as K8s CRDs — GitOps-friendly infra |
| **CDK / CDKTF / SST** | cloud infra in code (CDK for AWS, SST for serverless) |
| **Backstage / Port / Cortex** | internal developer portals — service catalog + scaffolding + scorecards |
| **Platform Engineering** | the discipline: internal platform = product, paved paths, self-service |

---

## **7. How to Evaluate "New" Tools**

```text
Adopt when it:                      Avoid when it:
├── solves a measured pain          ├── is a resume-driven rewrite
├── has CNCF/maintainer backing     ├── is <1yr old for core path
├── reduces config (not adds)       ├── has a single-maintainer risk
├── plays the standard (OTel, OCI)  ├── locks you to a vendor
└── your team can operate it        └── replaces a tool you haven't outgrown
```

**Interview answer pattern:** "I follow the CNCF landscape — I adopt mature incubating/graduated tools for specific pains (Cilium for network observability, Karpenter for node efficiency, Sigstore for supply-chain), and I standardize on the open protocols (OTel, OCI, GitOps) so individual tools stay swappable."

---

## 📚 **Learning Resources**

* 🔗 [CNCF Landscape](https://landscape.cncf.io/) — the full map
* 📦 [CNCF Graduated Projects](https://www.cncf.io/projects/) — the maturity signal
* 🛡️ [OpenSSF](https://openssf.org/) — supply-chain security standards
