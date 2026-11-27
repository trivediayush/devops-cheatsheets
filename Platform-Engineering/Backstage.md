# 🎭 Backstage (Internal Developer Portal) Cheatsheet

**Backstage** (CNCF Graduated, originally created by Spotify) is the de facto open-source **Developer Portal** framework in 2026. It unifies service ownership, Golden Path scaffolding, technical documentation, and operational plugins (Kubernetes, Argo CD, CI/CD, Cost Insights) behind a single extensible UI.

---

## **1. Core Pillars of Backstage**

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Backstage Portal                         │
├─────────────────┬─────────────────┬──────────────┬──────────────┤
│ Software        │ Software        │ TechDocs     │ Plugin       │
│ Catalog         │ Templates       │ (Docs-as-    │ Ecosystem    │
│ (Ownership &    │ (Scaffolder     │  Code via    │ (K8s, Argo,  │
│  Dependencies)  │  Golden Paths)  │  MkDocs)     │  CI, FinOps) │
└────────┬────────┴────────┬────────┴──────┬───────┴──────┬───────┘
         │                 │               │              │
   catalog-info.yaml  template.yaml   mkdocs.yml     Backend APIs
   in every Git repo  in platform repo in app repos  (OIDC / RBAC)
```

---

## **2. Software Catalog — System Model & Entity Kinds**

| Entity Kind | Represents | Example |
| --- | --- | --- |
| **Domain** | Business area grouping systems | `payments`, `commerce` |
| **System** | Collection of cooperating services & resources | `checkout-system` |
| **Component** | Deployable software unit (service, website, library) | `checkout-api` |
| **API** | Contract exposed/consumed (OpenAPI, gRPC, GraphQL, AsyncAPI) | `checkout-grpc-api` |
| **Resource** | Physical/cloud infra needed by components | `checkout-postgres-db` |
| **Group / User** | Teams and engineers (synced from Okta/Entra/GitHub) | `team-checkout` |

### Production `catalog-info.yaml` (lives in every service repo)

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: checkout-api
  title: Checkout API
  description: Handles order checkout, payment authorization, and receipts.
  annotations:
    github.com/project-slug: acme-org/checkout-api
    backstage.io/techdocs-ref: dir:.
    backstage.io/kubernetes-id: checkout-api
    argocd/app-name: checkout-api-prod
    pagerduty.com/integration-key: "abc123def456"
    sonarqube.org/project-key: acme_checkout-api
  tags:
    - go
    - grpc
    - tier-1
  links:
    - url: https://grafana.internal/d/checkout-slo
      title: SLO Dashboard
      icon: dashboard
    - url: https://runbooks.internal/checkout
      title: On-Call Runbook
      icon: docs
spec:
  type: service
  lifecycle: production          # experimental | production | deprecated
  owner: group:default/team-checkout
  system: checkout-system
  providesApis:
    - checkout-openapi
  consumesApis:
    - payments-grpc
  dependsOn:
    - resource:default/checkout-postgres
    - resource:default/checkout-redis
```

---

## **3. Scaffolder — Golden Path Software Templates**

A `template.yaml` defines a multi-step wizard (`parameters` → `steps` → `output`) that turns user inputs into a compliant Git repo + GitOps deployment:

```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: go-microservice-golden-path
  title: Go Microservice (Production Golden Path)
  description: Scaffolds a Go gRPC/HTTP service with OTel, Dockerfile, CI, and Argo CD app.
  tags:
    - recommended
    - go
    - kubernetes
spec:
  owner: group:default/platform-team
  type: service

  parameters:
    - title: Service Identity
      required: [name, owner, system]
      properties:
        name:
          title: Service Name
          type: string
          pattern: '^[a-z0-9-]+$'
          ui:autofocus: true
        description:
          title: Description
          type: string
        owner:
          title: Owning Team
          type: string
          ui:field: OwnerPicker
          ui:options:
            catalogFilter: { kind: Group }
        system:
          title: System
          type: string
          ui:field: EntityPicker
          ui:options:
            catalogFilter: { kind: System }

    - title: Infrastructure Options
      properties:
        needsPostgres:
          title: Provision Managed PostgreSQL (Crossplane)?
          type: boolean
          default: false
        tier:
          title: Criticality Tier
          type: string
          enum: [tier-1, tier-2, tier-3]
          default: tier-2

  steps:
    - id: fetch-skeleton
      name: Render Go Service Skeleton
      action: fetch:template
      input:
        url: ./skeleton
        values:
          name: ${{ parameters.name }}
          owner: ${{ parameters.owner }}
          system: ${{ parameters.system }}
          needsPostgres: ${{ parameters.needsPostgres }}
          tier: ${{ parameters.tier }}

    - id: publish-repo
      name: Create GitHub Repository
      action: publish:github
      input:
        repoUrl: github.com?owner=acme-org&repo=${{ parameters.name }}
        defaultBranch: main
        protectDefaultBranch: true
        requireCodeOwnerReviews: true

    - id: register-gitops
      name: Open GitOps Onboarding PR
      action: publish:github:pull-request
      input:
        repoUrl: github.com?owner=acme-org&repo=gitops-fleet
        branchName: onboard-${{ parameters.name }}
        title: "feat(gitops): onboard ${{ parameters.name }}"
        sourcePath: ./gitops

    - id: register-catalog
      name: Register in Software Catalog
      action: catalog:register
      input:
        repoContentsUrl: ${{ steps['publish-repo'].output.repoContentsUrl }}
        catalogInfoPath: /catalog-info.yaml

  output:
    links:
      - title: Open Repository
        url: ${{ steps['publish-repo'].output.remoteUrl }}
      - title: Open in Catalog
        icon: catalog
        entityRef: ${{ steps['register-catalog'].output.entityRef }}
      - title: GitOps Onboarding PR
        url: ${{ steps['register-gitops'].output.remoteUrl }}
```

---

## **4. TechDocs (Docs-Like-Code)**

Keep docs next to code in `docs/` + `mkdocs.yml`, built in CI and uploaded to S3/GCS so the Backstage backend stays stateless and fast:

```yaml
# mkdocs.yml (in service repository)
site_name: Checkout API
nav:
  - Overview: index.md
  - Architecture: architecture.md
  - Runbook: runbook.md
plugins:
  - techdocs-core
```

```bash
# Build & publish TechDocs in CI (recommended production mode, not local-build):
npx @techdocs/cli generate --no-docker --source-dir . --output-dir ./site
npx @techdocs/cli publish \
  --publisher-type awsS3 \
  --storage-name acme-backstage-techdocs \
  --entity default/Component/checkout-api
```

---

## **5. Production `app-config.production.yaml`**

```yaml
app:
  title: Acme Internal Developer Portal
  baseUrl: https://portal.acme.internal

backend:
  baseUrl: https://portal.acme.internal
  listen:
    port: 7007
  database:
    client: pg
    connection:
      host: ${POSTGRES_HOST}
      port: ${POSTGRES_PORT}
      user: ${POSTGRES_USER}
      password: ${POSTGRES_PASSWORD}
      ssl: { rejectUnauthorized: true }
  auth:
    keys:
      - secret: ${BACKEND_SECRET}

auth:
  environment: production
  providers:
    github:
      production:
        clientId: ${AUTH_GITHUB_CLIENT_ID}
        clientSecret: ${AUTH_GITHUB_CLIENT_SECRET}
    okta:
      production:
        clientId: ${OKTA_CLIENT_ID}
        clientSecret: ${OKTA_CLIENT_SECRET}
        audience: https://acme.okta.com

catalog:
  providers:
    github:
      orgDiscovery:
        organization: acme-org
        catalogPath: '/catalog-info.yaml'
        filters:
          branch: 'main'
          repository: '.*'
        schedule:
          frequency: { minutes: 30 }
          timeout: { minutes: 5 }
    githubOrg:
      id: production
      githubUrl: https://github.com
      orgs: ['acme-org']
      schedule:
        frequency: { hours: 1 }
        timeout: { minutes: 10 }

techdocs:
  builder: 'external'           # ALWAYS external in production (CI builds, Backstage reads)
  publisher:
    type: 'awsS3'
    awsS3:
      bucketName: acme-backstage-techdocs
      region: us-east-1
```

---

## **6. New Backend System (2025/2026 Standard)**

Backstage migrated to the modular **New Backend System** (`@backstage/backend-defaults`):

```ts
// packages/backend/src/index.ts
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-auth-backend-module-github-provider'));
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(import('@backstage/plugin-catalog-backend-module-github'));
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(import('@backstage/plugin-techdocs-backend'));
backend.add(import('@backstage/plugin-kubernetes-backend'));
backend.add(import('@backstage/plugin-permission-backend'));

backend.start();
```

---

## **7. Essential CLI Commands & Local Workflow**

```bash
# Scaffold a new Backstage portal app:
npx @backstage/create-app@latest

# Run frontend + backend locally with hot reload:
yarn dev

# Upgrade Backstage dependencies safely across monorepo:
yarn backstage-cli versions:bump

# Validate all catalog-info.yaml files in CI:
npx @backstage/cli config:check
npx @roadiehq/catalog-model-validator catalog-info.yaml

# Build production container image:
yarn install --immutable
yarn tsc
yarn build:backend
docker build -f packages/backend/Dockerfile -t registry.acme.internal/backstage:1.35.0 .
```

---

## **8. High-Value Production Plugins & Governance**

| Plugin | Purpose |
| --- | --- |
| **Kubernetes Plugin** | Shows pod status, crash loops, HPA, and container logs right on the entity page |
| **Argo CD Plugin** | Displays GitOps sync status, revision SHA, and sync button per environment |
| **Soundcheck / Tech Insights** | Scorecards grading services on SLOs, PagerDuty config, SBOM, and K8s readiness |
| **Permission Framework (RBAC)** | Restricts who can run destructive Scaffolder actions or unregister entities |
| **OpenCost / Kubecost Plugin** | Surfaces monthly cluster spend directly to each owning team |

---

## **9. Common Production Pitfalls & Fixes**

| Issue | Root Cause | Fix |
| --- | --- | --- |
| **Stale catalog entries / zombie services** | Manual registration instead of org discovery | Use `github` EntityProvider with `schedule` + GitHub webhooks for real-time sync |
| **Backstage OOMKills on TechDocs view** | `techdocs.builder: 'local'` running MkDocs inside the pod | Switch to `builder: 'external'` and publish from CI to S3/GCS |
| **Low developer adoption** | Catalog only shows links; doesn't save devs time | Ship high-leverage Scaffolder templates + live K8s/Argo/SLO scorecards |
| **GitHub API rate limits (403)** | Using a personal PAT instead of GitHub App | Configure a **GitHub App** integration (5,000–15,000 req/hr per installation) |
| **Upgrade pain across plugins** | Heavy custom forks of core plugins | Stick to standard extension points and run `versions:bump` monthly |
