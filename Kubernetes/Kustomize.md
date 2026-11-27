# 🧩 Kustomize Cheatsheet

**Kustomize** is Kubernetes' built-in, template-free configuration management tool (`kubectl apply -k`). Instead of wrapping YAML in Go-template braces (`{{ .Values }}`), Kustomize keeps every manifest valid Kubernetes YAML and layers environment-specific **overlays** cleanly on top of a shared **base**.

---

## **1. Kustomize vs Helm (When to Use Which)**

| Criteria | Kustomize | Helm |
| --- | --- | --- |
| **Mechanism** | Template-free declarative patching (Bases + Overlays) | Go templating + versioned release packages (Charts) |
| **Best For** | Your own internal microservices across `dev / staging / prod` | Distributing & installing third-party vendor apps (Cert-Manager, Prometheus, Cilium) |
| **GitOps Diff Readability** | Crystal-clear YAML patches | Often complex `values.yaml` + template logic |
| **2026 Combo Pattern** | Use Kustomize `helmCharts:` inflation to render a vendor Helm chart, then patch fields the chart forgot to expose! |

---

## **2. Standard Production Directory Layout**

```text
apps/checkout-api/
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   └── pdb.yaml
├── components/                    # Reusable opt-in feature bundles!
│   ├── otel-sidecar/
│   │   └── kustomization.yaml
│   └── external-secret/
│       └── kustomization.yaml
└── overlays/
    ├── dev/
    │   ├── kustomization.yaml
    │   └── patch-replicas.yaml
    ├── staging/
    │   └── kustomization.yaml
    └── prod/
        ├── kustomization.yaml
        ├── hpa.yaml
        └── patch-resources.yaml
```

---

## **3. Base & Overlay `kustomization.yaml` (Modern v5 Syntax)**

### `base/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - deployment.yaml
  - service.yaml
  - pdb.yaml

labels:
  - pairs:
      app.kubernetes.io/part-of: commerce
      app.kubernetes.io/managed-by: kustomize
    includeSelectors: false         # Safe! Never mutate immutable Deployment selectors accidentally

configMapGenerator:
  - name: checkout-config
    literals:
      - LOG_LEVEL=info
      - METRICS_PORT=9090
    # Kustomize appends a content hash (checkout-config-7f9k2d8m) automatically!
    # Changing config updates the hash -> triggers zero-downtime rolling Deployment update!
```

### `overlays/prod/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: checkout-prod

resources:
  - ../../base
  - hpa.yaml

components:
  - ../../components/otel-sidecar
  - ../../components/external-secret

images:
  - name: ghcr.io/acme/checkout-api
    newTag: v2.18.4
    digest: sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08

replicas:
  - name: checkout-api
    count: 6

configMapGenerator:
  - name: checkout-config
    behavior: merge                 # Merges into base ConfigMap instead of creating a duplicate
    literals:
      - LOG_LEVEL=warn
      - ENV=production

patches:
  # 1. Strategic Merge Patch (file):
  - path: patch-resources.yaml

  # 2. Inline JSON 6902 Patch (surgical array/field edits):
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: checkout-api
    patch: |-
      - op: replace
        path: /spec/template/spec/containers/0/livenessProbe/initialDelaySeconds
        value: 20
      - op: add
        path: /spec/template/spec/topologySpreadConstraints
        value:
          - maxSkew: 1
            topologyKey: topology.kubernetes.io/zone
            whenUnsatisfiable: DoNotSchedule
            labelSelector:
              matchLabels: { app: checkout-api }
```

---

## **4. Modern `replacements` (Replaces Deprecated `vars`)**

Copy a value dynamically from one resource (e.g., ConfigMap or Service name) into another resource:

```yaml
replacements:
  - source:
      kind: ConfigMap
      name: cluster-info
      fieldPath: data.DOMAIN
    targets:
      - select:
          kind: HTTPRoute
          name: checkout-route
        fieldPaths:
          - spec.hostnames.0
```

---

## **5. Rendering & Patching a Helm Chart Inside Kustomize**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

helmCharts:
  - name: ingress-nginx
    repo: https://kubernetes.github.io/ingress-nginx
    version: 4.11.3
    releaseName: ingress-nginx
    namespace: ingress-nginx
    valuesFile: values-prod.yaml

patches:
  - target:
      kind: Deployment
      name: ingress-nginx-controller
    patch: |-
      - op: add
        path: /spec/template/metadata/annotations/custom.acme.io~1tier
        value: "platform"
```

```bash
# Build with Helm inflation enabled:
kustomize build --enable-helm overlays/prod
```

---

## **6. Essential CLI Commands**

```bash
# Preview final rendered YAML without touching the cluster:
kustomize build overlays/prod
kubectl kustomize overlays/prod

# Preview exact live cluster diff before applying:
kubectl diff -k overlays/prod

# Apply directly (prefer GitOps Argo CD / Flux in prod!):
kubectl apply -k overlays/prod

# Update an image tag cleanly from CI (commits back to GitOps repo):
cd overlays/prod && kustomize edit set image ghcr.io/acme/checkout-api=ghcr.io/acme/checkout-api:v2.19.0

# Validate rendered output against real K8s schemas (kubeconform in CI):
kustomize build overlays/prod | kubeconform -strict -summary
```

---

## **7. Common Pitfalls & Fixes**

| Pitfall | Cause | Fix |
| --- | --- | --- |
| **Immutable field error on `spec.selector`** | Old `commonLabels:` injects labels into `spec.selector.matchLabels` | Use modern `labels:` with `includeSelectors: false` |
| **ConfigMap hash suffix breaks hardcoded references** | Referencing ConfigMap in CRD field Kustomize doesn't rewrite | Set `generatorOptions: { disableNameSuffixHash: true }` or add `nameReference` |
| **JSON Patch `/` in annotation key fails** | Forward slash `/` in path must be escaped as `~1` (`~` as `~0`) | Write `custom.acme.io~1tier` instead of `custom.acme.io/tier` |
| **SecretGenerator committing plaintext secrets** | Using `secretGenerator` with real prod creds in Git | Never store prod secrets in Kustomize — use **External Secrets Operator** |
| **Built-in `kubectl kustomize` version lag** | `kubectl` ships an older bundled Kustomize | Install standalone `kustomize` v5+ CLI for CI validation |
