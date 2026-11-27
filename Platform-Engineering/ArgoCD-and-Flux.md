# 🐙 Argo CD, Argo Rollouts & Flux v2 Cheatsheet

In 2026, **GitOps** is the universal standard for Kubernetes delivery. **Argo CD** (with **ApplicationSets** and **Argo Rollouts**) and **Flux v2** are the two CNCF Graduated controllers that continuously reconcile cluster state from Git and OCI registries.

---

## **1. Argo CD vs Flux v2 (2026 Comparison)**

| Dimension | Argo CD | Flux v2 |
| --- | --- | --- |
| **Architecture** | Centralized control plane + rich Web UI + API/CLI | Decentralized, lightweight toolkit of K8s controllers |
| **Multi-Cluster** | Hub-and-spoke via `ApplicationSet` Cluster Generator | Pull-based per cluster (or Fleet via OCI/Git repos) |
| **UI & Developer UX** | Built-in visual resource tree, live diff, sync history | CLI-first (`flux`), optional Web UI (Capacitor / Backstage) |
| **OCI Artifact Support** | Supported (Helm OCI + OCI sources) | Native first-class (`OCIRepository`, Cosign verification) |
| **Image Auto-Update** | Argo CD Image Updater (separate add-on) | Built-in (`ImageRepository`, `ImagePolicy`, `ImageUpdateAutomation`) |
| **Progressive Delivery** | **Argo Rollouts** (Canary, Blue-Green, Analysis) | **Flagger** (Canary, A/B, Blue-Green) |
| **Best For** | Developer visibility, hub-cluster multi-tenant IDPs | Minimal footprint, edge/air-gapped, pure K8s-native GitOps |

---

## **2. Argo CD — Production Application & ApplicationSet**

### Production `Application` with Self-Heal, Prune & Server-Side Apply

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: checkout-api-prod
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io     # Cascades cleanup when App is deleted
spec:
  project: commerce
  source:
    repoURL: https://github.com/acme-org/gitops-fleet.git
    targetRevision: main
    path: apps/checkout-api/overlays/prod
  destination:
    server: https://eks-prod-us-east-1.internal
    namespace: checkout
  syncPolicy:
    automated:
      prune: true                                # Removes resources deleted from Git
      selfHeal: true                             # Reverts manual kubectl edits automatically
      allowEmpty: false                          # Safety guard against accidental empty dir wipe
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true                     # Handles large CRDs (Prometheus, Istio, Crossplane)
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas                         # Let HPA/KEDA own replica count!
```

### `ApplicationSet` — Fleet & PR Ephemeral Previews

```yaml
# Matrix Generator: deploy every app across every cluster labeled env=prod
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: fleet-apps
  namespace: argocd
spec:
  goTemplate: true
  goTemplateOptions: ["missingkey=error"]
  generators:
    - matrix:
        generators:
          - git:
              repoURL: https://github.com/acme-org/gitops-fleet.git
              revision: main
              directories:
                - path: apps/*
          - clusters:
              selector:
                matchLabels:
                  env: prod
  template:
    metadata:
      name: '{{.path.basename}}-{{.name}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/acme-org/gitops-fleet.git
        targetRevision: main
        path: '{{.path.path}}/overlays/{{.metadata.labels.env}}'
      destination:
        server: '{{.server}}'
        namespace: '{{.path.basename}}'
      syncPolicy:
        automated: { prune: true, selfHeal: true }
```

### Sync Waves & Hooks (Ordered Rollouts & DB Migrations)

```yaml
# Run DB migration Job BEFORE Deployment rolls out:
apiVersion: batch/v1
kind: Job
metadata:
  name: checkout-db-migrate
  annotations:
    argocd.argoproj.io/hook: PreSync              # PreSync | Sync | PostSync | SyncFail
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation
    argocd.argoproj.io/sync-wave: "-1"            # Lower numbers apply first (-1 -> 0 -> 1)
```

---

## **3. Argo Rollouts — Automated Canary with Prometheus Analysis**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: checkout-api
  namespace: checkout
spec:
  replicas: 10
  selector:
    matchLabels: { app: checkout-api }
  template:
    metadata:
      labels: { app: checkout-api }
    spec:
      containers:
        - name: api
          image: ghcr.io/acme/checkout-api:v2.4.1
          ports: [{ containerPort: 8080 }]
  strategy:
    canary:
      canaryService: checkout-api-canary
      stableService: checkout-api-stable
      trafficRouting:
        plugins:
          argoproj-labs/gatewayAPI:
            httpRoute: checkout-api-route
            namespace: checkout
      steps:
        - setWeight: 10
        - pause: { duration: 2m }
        - analysis:
            templates:
              - templateName: checkout-slo-gate
        - setWeight: 50
        - pause: { duration: 5m }
        - analysis:
            templates:
              - templateName: checkout-slo-gate
        - setWeight: 100
---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: checkout-slo-gate
  namespace: checkout
spec:
  metrics:
    - name: error-rate-check
      interval: 1m
      count: 3
      successCondition: result[0] <= 0.01         # Abort & auto-rollback if 5xx > 1%!
      failureLimit: 1
      provider:
        prometheus:
          address: http://prometheus.monitoring.svc:9090
          query: |
            sum(rate(http_requests_total{service="checkout-api-canary",status=~"5.."}[2m]))
            /
            sum(rate(http_requests_total{service="checkout-api-canary"}[2m]))
```

---

## **4. Flux v2 — OCI + Kustomization + HelmRelease + Cosign**

```yaml
# 1. Pull signed OCI artifact (faster & more secure than cloning Git repos in-cluster):
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: OCIRepository
metadata:
  name: checkout-manifests
  namespace: flux-system
spec:
  interval: 2m
  url: oci://ghcr.io/acme/checkout-manifests
  ref:
    semver: ">=1.0.0"
  verify:
    provider: cosign                              # Verifies Sigstore signature before reconcile!
---
# 2. Reconcile Kustomization with health checks & dependency ordering:
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: checkout-prod
  namespace: flux-system
spec:
  interval: 5m
  retryInterval: 1m
  timeout: 3m
  prune: true
  wait: true
  dependsOn:
    - name: platform-crds
  sourceRef:
    kind: OCIRepository
    name: checkout-manifests
  path: ./overlays/prod
  postBuild:
    substituteFrom:
      - kind: ConfigMap
        name: cluster-vars
---
# 3. Declarative HelmRelease with automatic rollback on failure:
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: ingress-gateway
  namespace: flux-system
spec:
  interval: 10m
  chart:
    spec:
      chart: gateway
      version: "1.2.x"
      sourceRef:
        kind: HelmRepository
        name: envoy-gateway
  install:
    remediation: { retries: 3 }
  upgrade:
    cleanupOnFail: true
    remediation: { retries: 3, remediateLastFailure: true }
```

---

## **5. Essential Daily CLI Commands**

### Argo CD & Argo Rollouts CLI

```bash
# Login via SSO:
argocd login argocd.acme.internal --sso

# Inspect diff before syncing:
argocd app diff checkout-api-prod
argocd app get checkout-api-prod

# Sync with prune (or dry-run first):
argocd app sync checkout-api-prod --dry-run
argocd app sync checkout-api-prod --prune

# Hard refresh (clears repo-server cache):
argocd app get checkout-api-prod --hard-refresh

# Watch & control Argo Rollouts:
kubectl argo rollouts get rollout checkout-api -n checkout --watch
kubectl argo rollouts promote checkout-api -n checkout
kubectl argo rollouts abort checkout-api -n checkout
kubectl argo rollouts undo checkout-api -n checkout
```

### Flux v2 CLI

```bash
# Bootstrap Flux onto a cluster from GitHub:
flux bootstrap github --owner=acme-org --repository=gitops-fleet \
  --branch=main --path=clusters/prod --personal=false

# Check overall health & reconciliation status:
flux check
flux get all -A
flux get kustomizations -A
flux get helmreleases -A

# Force immediate reconciliation (don't wait for interval):
flux reconcile source git flux-system
flux reconcile kustomization checkout-prod --with-source

# Suspend / resume reconciliation during emergency incident debugging:
flux suspend kustomization checkout-prod
flux resume kustomization checkout-prod

# Stream Flux controller logs:
flux logs --all-namespaces --level=error --follow
```

---

## **6. Production Pitfalls & Fixes**

| Pitfall | Cause | Fix |
| --- | --- | --- |
| **Perpetual `OutOfSync` on `Deployment.spec.replicas`** | HPA/KEDA changes replicas while Git pins `replicas: 3` | Omit `replicas` in Git or add `ignoreDifferences` for `/spec/replicas` |
| **CRD annotation > 262KB apply error** | Client-side `kubectl apply` stores `last-applied-configuration` | Enable `ServerSideApply=true` in Argo CD (Flux uses SSA by default) |
| **Secrets committed to Git** | Putting raw K8s Secrets in GitOps repo | Use **External Secrets Operator** (ESO) or **SOPS + KMS** (native in Flux) |
| **App-of-Apps blast radius** | Root app deleting everything if Git branch is misconfigured | Set `allowEmpty: false`, enable branch protection, use `AppProject` RBAC |
| **Argo repo-server OOM / slow syncs** | Massive monorepo with hundreds of Helm renders | Split repos or push pre-rendered OCI artifacts; scale `argocd-repo-server` replicas |
