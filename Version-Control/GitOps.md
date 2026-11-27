# 🔄 GitOps Cheatsheet

**GitOps** — Git is the single source of truth for *what runs*. Agents inside the cluster continuously reconcile live state → Git state. No `kubectl apply` by hand, no "who changed prod" mystery.

---

## **1. The Core Principles**

```text
1. Declarative        → the desired state is declared (YAML), not scripted
2. Versioned          → that state lives in Git (audit trail, rollback = revert)
3. Pulled             → an in-cluster agent pulls changes (no CI credentials INTO prod)
4. Reconciled         → the agent continuously converges live → desired
```

```text
Developer ──PR──► Git repo (desired state)
                     │        ▲
                     │ watch  │ drift back? reconcile
                     ▼        │
   CI builds image ──► GitOps controller (ArgoCD/Flux) in cluster
                     │ syncs
                     ▼
              live cluster state  ◄── drift detection alerts
```

**Push vs pull (the key difference):** CI *push* = pipeline has prod credentials, runs `kubectl` — creds leak outward. GitOps *pull* = the cluster agent reads Git — prod creds never leave the cluster.

---

## **2. ArgoCD — The UI-Driven GitOps**

```yaml
# application.yaml — an ArgoCD App = "sync this Git path to this cluster"
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://git.internal.com/platform/api.git
    targetRevision: main
    path: deploy/prod            # Helm chart / kustomize dir / plain YAML
    helm:
      valueFiles: [values-prod.yaml]
  destination:
    server: https://kubernetes.default.svc   # same cluster
    namespace: api
  syncPolicy:
    automated:                   # auto-sync on Git change
      prune: true                # delete removed-from-Git resources
      selfHeal: true             # revert manual kubectl edits (drift fix)
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
    retry: { limit: 5, backoff: { duration: 5s, maxDuration: 3m } }
```

```bash
# The daily ArgoCD CLI:
argocd login argocd.local
argocd app list                          # all apps + sync status
argocd app get api                       # detail + diff
argocd app sync api                      # manual sync
argocd app rollback api <history-id>     # rollback
argocd app diff api                      # live vs git
argocd app refresh api                   # force re-check git
argocd app history api                   # sync history
argocd app terminate-op api              # cancel a stuck sync
```

**App of Apps** — the bootstrap pattern: one root Application whose Git path contains *other* Application manifests → the whole platform self-describes.

**Sync waves** — order resources with `argocd.argoproj.io/sync-wave: "-1|0|1"` annotations (namespaces → CRDs → secrets → deployments → ingress).

**Health hooks** — `argocd.argoproj.io/hook: PreSync|Sync|PostSync|SyncFail` for jobs that run around the sync (migrations, smoke tests).

---

## **3. Flux — The CLI/Toolkit GitOps**

```bash
# Bootstrap → Flux installs itself as Git-managed manifests
flux bootstrap gitlab \
  --owner=platform --repository=infra --branch=main --path=clusters/prod

# The daily Flux CLI:
flux get sources all               # what's being watched
flux get kustomizations            # sync status
flux reconcile source git infra    # force pull from git
flux reconcile kustomization apps  # force apply
flux suspend/resume kustomization apps
flux logs -f                       # controller logs
flux diff kustomization apps       # live vs git diff
flux export kustomization apps > backup.yaml
```

```yaml
# The Flux object chain: source → kustomization → resources
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
spec:
  interval: 1m
  url: https://git.internal.com/platform/infra.git
  ref: { branch: main }
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
spec:
  interval: 10m
  path: ./clusters/prod
  prune: true                       # delete removed resources
  validation: client                # dry-run before apply
  sourceRef: { kind: GitRepository, name: infra }
```

---

## **4. ArgoCD vs Flux — The Pick**

| | ArgoCD | Flux |
| --- | --- | --- |
| UI | rich web UI — visualize diff/drift | minimal (Weave GitOps gone) |
| Style | Application CRD per app | composable controllers (source/kustomize/helm/notification) |
| SSO/RBAC | built-in | relies on cluster RBAC |
| Image automation | argocd-image-updater | built-in (image-reflector/automation controllers) |
| Multi-cluster | native, easy | works, more manual |
| Feel | batteries-included | unix-y toolkit |

**Rule:** want a UI + onboarding teams → ArgoCD. Want minimal composable controllers, deep customization → Flux. Many shops run ArgoCD for apps + Flux for infra bootstrap.

---

## **5. Secrets in GitOps — The Problem and Answers**

```text
Problem: secrets can't live in Git as plaintext.
```

| Approach | How |
| --- | --- |
| **External Secrets Operator** | Git stores `ExternalSecret` CRs pointing at Vault/AWS SM/Azure KV — synced into K8s Secrets. **The modern default.** |
| **SOPS + Mozilla age/KMS** | encrypt values in the YAML — Git-safe ciphertext, decrypted at apply-time (Flux has native SOPS support) |
| **Sealed Secrets (Bitnami)** | encrypt a secret with the cluster's pubkey — only that cluster can unseal it |
| **HashiCorp Vault Agent/CSI** | pods fetch at runtime — secret never touches Git or etcd |

```yaml
# ExternalSecret — the pattern most teams standardize on:
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
spec:
  secretStoreRef: { name: vault, kind: ClusterSecretStore }
  target: { name: db-creds }
  data:
    - secretKey: password
      remoteRef: { key: prod/api/db, property: password }
```

---

## **6. Drift, Promotion & The Workflow**

```text
PR merged to main
   │
   ▼ CI: build image → push registry → update image tag in Git (env repo)
   │        (commit to Git = the deploy trigger)
   ▼
GitOps controller sees new tag → syncs → rolling update
   │
   ▼ drift detected? (someone kubectl-edited)
   selfHeal: reverts it    OR    alert fires
```

```bash
# Promotion between envs = Git operation:
git tag -a v1.4.2 -m "promote to prod"
# or PR: env/staging → env/prod value change → merge → sync

# Emergency rollback = git revert:
git revert <deploy-commit> && git push   # controller syncs back
```

**The discipline rules:**
- All changes flow through Git — `kubectl edit` is a break-glass, alerts on it.
- Split **app repo** (code) from **env/config repo** (what deploys where) — CI updates the env repo's image tag; that's the promotion mechanism.
- `selfHeal: true` for prod (kills manual drift), maybe off for dev.
- Sync waves + hooks for ordering; health assessment decides "synced = healthy".

---

## 📚 **Learning Resources**

* 🔗 [OpenGitOps Principles](https://opengitops.dev/) — the spec
* 📦 [ArgoCD Docs](https://argo-cd.readthedocs.io/)
* 🛠️ [Flux Docs](https://fluxcd.io/flux/)
* 🔐 [External Secrets Operator](https://external-secrets.io/)
