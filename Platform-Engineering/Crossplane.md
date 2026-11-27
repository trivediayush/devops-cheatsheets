# ✈️ Crossplane Cheatsheet

**Crossplane** (CNCF Graduated) turns Kubernetes into a **Universal Control Plane** for provisioning and continuously reconciling cloud infrastructure (AWS, GCP, Azure, Vault, GitHub, SQL) using Kubernetes CRDs. Instead of one-shot CLI runs (`terraform apply`), Crossplane reconciles desired cloud state continuously — fixing drift automatically and exposing clean, self-service APIs to application teams.

---

## **1. Architecture & Core Primitives**

```text
Application Team (Namespace-scoped)
  └─ Claim (e.g., PostgreSQLInstance in ns: checkout)
        │  binds to
        ▼
Platform Team API (Cluster-scoped)
  ├─ XRD (CompositeResourceDefinition) — defines the OpenAPI schema
  ├─ XR  (CompositeResource)           — concrete instance created from Claim
  └─ Composition (+ Composition Functions) — maps XR → cloud Managed Resources
        │  provisions & continuously reconciles
        ▼
Providers (provider-aws-rds, provider-gcp-sql, provider-helm, ...)
  └─ Managed Resources (DBInstance, DBSubnetGroup, SecurityGroup, Secret)
        │
        ▼
Cloud APIs (AWS / GCP / Azure / SaaS)
```

| Concept | Owner | Role |
| --- | --- | --- |
| **Provider** | Platform | Controller + CRDs for an external API (e.g., Upbound `provider-aws-rds`) |
| **ProviderConfig** | Platform | Credentials & auth method (IRSA / Pod Identity / Workload Identity) |
| **Managed Resource (MR)** | Crossplane | 1:1 Kubernetes representation of a cloud resource (`RDS Instance`, `S3 Bucket`) |
| **XRD** | Platform | Defines your custom internal API (e.g., `XPostgreSQLInstance` + `PostgreSQLInstance`) |
| **Composition** | Platform | Implementation blueprint turning an XR into one or more Managed Resources |
| **Function** | Platform | Containerized pipeline step (Go, Python, Patch&Transform, Go-Templating) |
| **Claim** | App Team | Simple namespace-scoped request for infrastructure (10 lines of YAML) |

---

## **2. Installing Crossplane & Providers**

```bash
# Install Crossplane via Helm:
helm repo add crossplane-stable https://charts.crossplane.io/stable
helm repo update
helm install crossplane crossplane-stable/crossplane \
  --namespace crossplane-system --create-namespace \
  --wait

# Install the Crossplane CLI (essential for local render & validation):
curl -sL "https://raw.githubusercontent.com/crossplane/crossplane/main/install.sh" | sh
sudo mv crossplane /usr/local/bin/
```

```yaml
# Provider (use modular Upbound family providers to avoid CRD bloat!)
apiVersion: pkg.crossplane.io/v1
kind: Provider
metadata:
  name: provider-aws-rds
spec:
  package: xpkg.upbound.io/upbound/provider-aws-rds:v1.18.0
  runtimeConfigRef:
    name: aws-irsa-runtime
---
# ProviderConfig using AWS EKS Pod Identity / IRSA (zero static keys):
apiVersion: aws.upbound.io/v1beta1
kind: ProviderConfig
metadata:
  name: default
spec:
  credentials:
    source: IRSA
```

---

## **3. Defining an Internal Platform API (XRD + Function Composition)**

### Step 1: CompositeResourceDefinition (XRD)

```yaml
apiVersion: apiextensions.crossplane.io/v1
kind: CompositeResourceDefinition
metadata:
  name: xpostgresqlinstances.platform.acme.io
spec:
  group: platform.acme.io
  names:
    kind: XPostgreSQLInstance
    plural: xpostgresqlinstances
  claimNames:
    kind: PostgreSQLInstance
    plural: postgresqlinstances
  versions:
    - name: v1alpha1
      served: true
      referenceable: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              required: [storageGB, tier]
              properties:
                storageGB:
                  type: integer
                  minimum: 20
                  maximum: 2000
                tier:
                  type: string
                  enum: [dev, staging, prod]
                engineVersion:
                  type: string
                  default: "16.4"
            status:
              type: object
              properties:
                endpoint:
                  type: string
```

### Step 2: Composition Using Composition Functions Pipeline (2026 Standard)

> In Crossplane v1.17+ / v2, **Pipeline Mode with Composition Functions** replaces legacy inline Patch & Transform (`mode: Resources`).

```yaml
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: aws-postgres-rds
  labels:
    provider: aws
spec:
  compositeTypeRef:
    apiVersion: platform.acme.io/v1alpha1
    kind: XPostgreSQLInstance
  mode: Pipeline
  pipeline:
    - step: render-rds-resources
      functionRef:
        name: function-patch-and-transform
      input:
        apiVersion: pt.fn.crossplane.io/v1beta1
        kind: Resources
        resources:
          - name: rds-instance
            base:
              apiVersion: rds.aws.upbound.io/v1beta2
              kind: Instance
              spec:
                forProvider:
                  region: us-east-1
                  engine: postgres
                  instanceClass: db.t4g.medium
                  publiclyAccessible: false
                  storageEncrypted: true
                  skipFinalSnapshot: false
                  autoGeneratePassword: true
                  passwordSecretRef:
                    key: password
                    namespace: crossplane-system
                writeConnectionSecretToRef:
                  namespace: crossplane-system
            patches:
              - type: FromCompositeFieldPath
                fromFieldPath: spec.storageGB
                toFieldPath: spec.forProvider.allocatedStorage
              - type: FromCompositeFieldPath
                fromFieldPath: spec.engineVersion
                toFieldPath: spec.forProvider.engineVersion
              - type: FromCompositeFieldPath
                fromFieldPath: spec.tier
                toFieldPath: spec.forProvider.multiAz
                transforms:
                  - type: map
                    map: { dev: false, staging: false, prod: true }
              - type: ToCompositeFieldPath
                fromFieldPath: status.atProvider.endpoint
                toFieldPath: status.endpoint
            connectionDetails:
              - name: host
                fromConnectionSecretKey: endpoint
              - name: port
                fromConnectionSecretKey: port
              - name: username
                fromConnectionSecretKey: username
              - name: password
                fromConnectionSecretKey: password
    - step: auto-ready
      functionRef:
        name: function-auto-ready
```

### Step 3: Developer Claim (10 lines — zero AWS boilerplate!)

```yaml
apiVersion: platform.acme.io/v1alpha1
kind: PostgreSQLInstance
metadata:
  name: checkout-db
  namespace: checkout
spec:
  storageGB: 100
  tier: prod
  writeConnectionSecretToRef:
    name: checkout-db-conn      # App mounts this Secret directly!
```

---

## **4. Local Testing & Validation with Crossplane CLI**

Always test Compositions locally before pushing to a cluster:

```bash
# Render an XR locally through Composition Functions (no cluster needed!):
crossplane render xr.yaml composition.yaml functions.yaml

# Validate rendered manifests against provider CRD schemas:
crossplane render xr.yaml composition.yaml functions.yaml \
  | crossplane beta validate schemas/ -

# Trace the entire Claim -> XR -> Managed Resources tree in a live cluster:
crossplane beta trace postgresqlinstance/checkout-db -n checkout

# Inspect top-level resource health quickly:
kubectl get managed
kubectl get composite
kubectl get claim -A
```

---

## **5. Crossplane vs OpenTofu / Terraform (2026 Decision Matrix)**

| Criteria | Crossplane | OpenTofu / Terraform |
| --- | --- | --- |
| **Execution Model** | Continuous Kubernetes reconciliation loop | On-demand CLI / CI pipeline (`plan` + `apply`) |
| **Drift Handling** | Auto-heals drift within minutes | Detected only on scheduled `plan` runs |
| **State Storage** | Kubernetes etcd (no state files or locks!) | Remote state backend (S3/GCS/TFC + locking) |
| **Self-Service Abstraction** | First-class CRDs (Claims/XRDs) via GitOps | Modules + wrappers (Terragrunt/Atlantis/Spacelift) |
| **Best Fit For** | App-facing infra (DBs, buckets, queues, IAM roles) | Base layer (VPCs, EKS/GKE bootstrap, org accounts) |

> **2026 Industry Pattern:** Use **OpenTofu/Terraform** for the foundational layer (AWS accounts, VPCs, Transit Gateways, bootstrap management cluster) and **Crossplane** for developer-facing, continuously reconciled platform APIs.

---

## **6. Production Safeguards & Policies**

```yaml
# Protect production databases from accidental `kubectl delete`:
spec:
  deletionPolicy: Orphan         # Deletes K8s object only; preserves live cloud RDS!
  managementPolicies:
    - Observe                    # Read-only mode (great for importing existing cloud infra)
    - Create
    - Update
    # Omit "Delete" to forbid Crossplane from ever destroying the resource
```

### Importing Existing Cloud Resources Safely
1. Set `metadata.annotations["crossplane.io/external-name"]` to the existing AWS resource ID.
2. Set `spec.managementPolicies: ["Observe"]` first and verify `SYNCED=True` and `READY=True`.
3. Once verified, expand `managementPolicies` to `["Observe", "Create", "Update"]` (keeping `Delete` omitted for stateful prod DBs).

---

## **7. Troubleshooting Playbook**

```bash
# 1. Trace why a Claim is stuck READY=False:
crossplane beta trace postgresqlinstance/checkout-db -n checkout --show-connection-secrets

# 2. Check events on the failing Managed Resource:
kubectl describe instance.rds.aws.upbound.io <mr-name>

# 3. Check provider pod logs (IAM errors, API throttling, bad region):
kubectl logs -n crossplane-system -l pkg.crossplane.io/provider=provider-aws-rds --tail=100

# 4. Check Composition Function pod logs:
kubectl logs -n crossplane-system -l pkg.crossplane.io/function=function-patch-and-transform

# 5. Unstick a deleted resource blocked by finalizer (ONLY after verifying cloud resource state):
kubectl patch instance.rds.aws.upbound.io <name> --type=merge -p '{"metadata":{"finalizers":null}}'
```

| Symptom | Common Cause | Fix |
| --- | --- | --- |
| **`etcd` size / API server slowdown** | Installed monolithic `provider-aws` (1,000+ CRDs) | Use modular family providers (`provider-aws-rds`, `provider-aws-s3`, `provider-aws-iam`) |
| **`CannotResolveResourceReferences`** | Referenced SubnetGroup / SecurityGroup not Ready yet | Check `crossplane beta trace` for the upstream failing dependency |
| **Cloud API RateLimitExceeded** | Too many MRs polling too fast | Tune `--poll-interval=10m` and `--max-reconcile-rate=10` in `DeploymentRuntimeConfig` |
| **Claim stuck Terminating** | Cloud delete blocked (e.g. non-empty S3 bucket or deletion protection) | Clear cloud blocker or switch `deletionPolicy: Orphan` |
