# 🔐 External Secrets Operator & cert-manager Cheatsheet

Never commit plaintext secrets to Git, and never renew TLS certificates manually. In 2026, **External Secrets Operator (ESO)** and **cert-manager** are mandatory foundational add-ons on every production Kubernetes platform.

---

## **1. External Secrets Operator (ESO) — Architecture**

```text
AWS Secrets Manager / HashiCorp Vault / GCP Secret Manager / Azure Key Vault
        │
        │  Authenticated via Workload Identity (IRSA / Pod Identity / WIF — zero static keys)
        ▼
ClusterSecretStore / SecretStore  (defines backend + auth)
        │
        ▼
ExternalSecret (namespace-scoped: declares which keys to fetch & refreshInterval)
        │  syncs & rotates automatically
        ▼
Native Kubernetes Secret  ──► Mounted into Pods (env / volume)
```

### ClusterSecretStore (AWS Secrets Manager via EKS Pod Identity / IRSA)

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secrets-manager
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
            namespace: external-secrets
```

### ClusterSecretStore (HashiCorp Vault via Kubernetes Auth)

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: vault-backend
spec:
  provider:
    vault:
      server: "https://vault.acme.internal:8200"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "eso-reader"
          serviceAccountRef:
            name: external-secrets-sa
            namespace: external-secrets
```

### ExternalSecret with Templating & Automatic Rotation

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: checkout-db-credentials
  namespace: checkout
spec:
  refreshInterval: 1h                 # Polls secret manager every hour for rotations
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: checkout-db-secret          # Resulting K8s Secret name
    creationPolicy: Owner             # Garbage-collected if ExternalSecret is deleted
    deletionPolicy: Retain            # Optional: keep K8s Secret if upstream is deleted
    template:
      engineVersion: v2
      data:
        DATABASE_URL: "postgres://{{ .user }}:{{ .pass }}@{{ .host }}:5432/checkout?sslmode=require"
  data:
    - secretKey: user
      remoteRef:
        key: prod/checkout/db
        property: username
    - secretKey: pass
      remoteRef:
        key: prod/checkout/db
        property: password
    - secretKey: host
      remoteRef:
        key: prod/checkout/db
        property: host
```

### Pairing ESO with Reloader (Zero-Downtime Secret Rotation)
Kubernetes updates mounted Secret volumes automatically (~60s), **not** `env:` variables. Pair ESO with **Stakater Reloader** so Deployments trigger a rolling restart whenever the synced Secret changes:

```yaml
metadata:
  annotations:
    reloader.stakater.com/auto: "true"
```

---

## **2. ESO vs Sealed Secrets vs SOPS vs CSI Secret Store**

| Solution | Secrets Live In | Rotation | Best Fit |
| --- | --- | --- | --- |
| **External Secrets Operator (ESO)** | External Vault / AWS / GCP / Azure | Automatic (`refreshInterval`) | Standard 2026 cloud/enterprise platforms |
| **Secrets Store CSI Driver** | External Vault / Cloud (mounted in tmpfs) | Auto-rotation on volume | High-security workloads avoiding K8s `Secret` in etcd |
| **Mozilla SOPS (with Flux)** | Encrypted YAML in Git (KMS/Age) | Manual re-encrypt + commit | Small/edge clusters with minimal moving parts |
| **Bitnami Sealed Secrets** | Encrypted CRD in Git (cluster pubkey) | Manual `kubeseal` + commit | Single-cluster GitOps without external secret manager |

---

## **3. cert-manager — Automated TLS & Internal PKI**

```text
Certificate (or Gateway/Ingress annotation)
      │
      ▼
CertificateRequest ──► Order (ACME) ──► Challenge (HTTP-01 or DNS-01)
      │
      ▼
ClusterIssuer (Let's Encrypt / Vault PKI / AWS Private CA)
      │
      ▼
TLS Kubernetes Secret (tls.crt + tls.key) — auto-renewed before expiry!
```

### ClusterIssuer — Let's Encrypt Production (DNS-01 for Wildcards & Private Clusters)

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod-dns
spec:
  acme:
    email: platform-alerts@acme.io
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - dns01:
          route53:
            region: us-east-1
            # Uses EKS Pod Identity / IRSA — no accessKeyID/secretAccessKey needed
```

### ClusterIssuer — Internal mTLS via Vault PKI

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: vault-internal-pki
spec:
  vault:
    server: https://vault.acme.internal:8200
    path: pki_int/sign/internal-services
    auth:
      kubernetes:
        mountPath: /v1/auth/kubernetes
        role: cert-manager-issuer
        serviceAccountRef:
          name: cert-manager
```

### Gateway API Automatic Certificate Integration (2026 Pattern)

Enable `--enable-gateway-api` on cert-manager, then simply annotate your `Gateway`:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: prod-gateway
  namespace: gateway
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod-dns
spec:
  gatewayClassName: cilium
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      hostname: "*.acme.io"
      tls:
        mode: Terminate
        certificateRefs:
          - name: wildcard-acme-tls   # cert-manager auto-creates & renews this Secret!
```

### Standalone `Certificate` with Explicit Rotation & Key Hygiene

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: api-tls
  namespace: checkout
spec:
  secretName: api-tls-secret
  duration: 2160h                     # 90 days
  renewBefore: 720h                   # Renew 30 days before expiry
  privateKey:
    algorithm: ECDSA
    size: 256
    rotationPolicy: Always            # Always rotate private key on renewal
  dnsNames:
    - api.acme.io
    - checkout.acme.io
  issuerRef:
    name: letsencrypt-prod-dns
    kind: ClusterIssuer
```

---

## **4. Essential Debugging Commands**

### External Secrets Operator

```bash
# Check status of all ExternalSecrets & SecretStores:
kubectl get clustersecretstore,secretstore -A
kubectl get externalsecret -A

# Inspect sync errors (IAM Denied, SecretNotFound, bad JSON key):
kubectl describe externalsecret checkout-db-credentials -n checkout

# Force an immediate refresh (don't wait for refreshInterval):
kubectl annotate externalsecret checkout-db-credentials -n checkout \
  force-sync=$(date +%s) --overwrite

# Check ESO controller logs:
kubectl logs -n external-secrets -l app.kubernetes.io/name=external-secrets --tail=100
```

### cert-manager (`cmctl` CLI + `kubectl`)

```bash
# Inspect full Certificate -> Request -> Order -> Challenge chain:
kubectl get certificate,certificaterequest,order,challenge -A

# Detailed diagnosis with cmctl:
cmctl status certificate api-tls -n checkout
cmctl renew api-tls -n checkout

# Debug stuck ACME challenge (DNS propagation or HTTP-01 routing failure):
kubectl describe challenge -n checkout
dig +short TXT _acme-challenge.api.acme.io @8.8.8.8

# Verify issued cert expiry directly from the K8s Secret:
kubectl get secret api-tls-secret -n checkout -o jsonpath='{.data.tls\.crt}' \
  | base64 -d | openssl x509 -noout -subject -issuer -dates
```

---

## **5. Production Checklist & Common Gotchas**

- **Test with Let's Encrypt Staging first** (`acme-staging-v02.api.letsencrypt.org`) to avoid hitting the 5-failures/hour or 50-certs/week production rate limits.
- **Monitor certificate expiry in Prometheus** using cert-manager's built-in metric `certmanager_certificate_expiration_timestamp_seconds` (alert if `< 14 days` remaining!).
- **Use `trust-manager`** (cert-manager companion) to distribute internal CA trust bundles consistently across all namespaces via `Bundle` CRDs.
- **Encrypt Kubernetes etcd at rest** (AWS KMS / GCP KMS / Azure Key Vault envelope encryption) since ESO creates standard K8s `Secret` objects in etcd.
- **Scope `ClusterSecretStore` access** with `conditions.namespaces` or `namespaceSelector` so dev namespaces cannot read `prod/*` secrets.
