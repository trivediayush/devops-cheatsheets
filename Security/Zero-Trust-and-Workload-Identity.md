# 🪪 Zero-Trust & Workload Identity (SPIFFE/SPIRE, OIDC & Pod Identity) Cheatsheet

In 2026, **static long-lived credentials (`AWS_ACCESS_KEY_ID`, JSON service account keys, shared API tokens) are obsolete and an audit failure**. Modern platforms identify every pod, CI job, and VM cryptographically using **short-lived, automatically rotated workload identities** (**SPIFFE/SPIRE**, **AWS EKS Pod Identity**, **GCP Workload Identity Federation**, **GitHub OIDC**).

---

## **1. Static Secrets vs Cryptographic Workload Identity**

```text
Legacy Secret-Zero Model (Fragile):
  Human creates IAM user key -> saves in CI / K8s Secret -> rotates once a year (or never!)
  -> One leak = full account compromise.

2026 Zero-Trust Workload Identity Model:
  Platform attests workload kernel/K8s identity -> mints short-lived X.509/JWT (15m–1h TTL)
  -> Auto-rotates silently every 30 min -> Zero static secrets anywhere!
```

| Use Case | 2026 Standard Solution | Token Lifetime |
| --- | --- | --- |
| **AWS EKS Pod → AWS APIs** | **EKS Pod Identity** (successor to IRSA) | Short-lived STS (~1h) |
| **GCP GKE Pod → GCP APIs** | **GKE Workload Identity Federation** | Short-lived OAuth2 (1h) |
| **Azure AKS Pod → Azure APIs** | **Azure Workload Identity** (OIDC) | Short-lived Entra JWT |
| **GitHub Actions → AWS/GCP/Azure** | **GitHub OIDC Federation** | Single job (~15m) |
| **Multi-Cloud / On-Prem Service-to-Service** | **SPIFFE & SPIRE** (CNCF Graduated) | 1h X.509 SVID (auto-rotated at 50% TTL) |
| **Human SSH / Internal Admin Access** | **Zero-Trust Identity Proxy** (Tailscale, Teleport, Cloudflare Access) | 8h SSO-bound cert |

---

## **2. SPIFFE & SPIRE (Cross-Cloud Cryptographic Workload Identity)**

**SPIFFE** is the open specification (`spiffe://<trust-domain>/<workload-path>`); **SPIRE** is its production runtime implementation:

```text
SPIRE Server (Cluster CA + Registration Entries)
      │  Node Attestation (AWS IID / K8s PSAT / TPM)
      ▼
SPIRE Agent (DaemonSet on every Node)
      │  Workload Attestation (verifies Linux UID, K8s Pod Namespace + ServiceAccount)
      │  Delivers X.509-SVID & JWT-SVID over local Unix socket (/run/spire/sockets/agent.sock)
      ▼
Application Pod (or Envoy / Cilium / Vault)
  Identity: spiffe://prod.acme.io/ns/checkout/sa/checkout-api
```

### Example SPIRE `ClusterSPIFFEID` CRD (Kubernetes Auto-Registration)

```yaml
apiVersion: spire.spiffe.io/v1alpha1
kind: ClusterSPIFFEID
metadata:
  name: prod-workloads
spec:
  spiffeIDTemplate: "spiffe://{{ .TrustDomain }}/ns/{{ .PodMeta.Namespace }}/sa/{{ .PodSpec.ServiceAccountName }}"
  podSelector:
    matchLabels:
      spiffe.io/identity: enabled
  workloadSelectorTemplates:
    - "k8s:ns:{{ .PodMeta.Namespace }}"
    - "k8s:sa:{{ .PodSpec.ServiceAccountName }}"
```

### Inspecting Live SPIFFE Identities

```bash
# Inspect SVID issued to a workload via SPIRE Agent socket:
kubectl exec -n checkout deploy/checkout-api -- \
  /opt/spire/bin/spire-agent api fetch x509 -socketPath /run/spire/sockets/agent.sock

# Verify registered entries & trust bundle on SPIRE Server:
kubectl exec -n spire-system sts/spire-server -- \
  /opt/spire/bin/spire-server entry show
kubectl exec -n spire-system sts/spire-server -- \
  /opt/spire/bin/spire-server bundle show -format spiffe
```

---

## **3. AWS EKS Pod Identity (2026 Preferred Over Legacy IRSA)**

**Why EKS Pod Identity replaced IRSA:** No per-cluster OIDC Provider thumbprints, no complex IAM trust policy conditions per cluster, and **one IAM role works cleanly across 50 EKS clusters** with automatic session tags (`eks-cluster-name`, `kubernetes-namespace`, `kubernetes-service-account`)!

```hcl
# 1. IAM Role Trust Policy for EKS Pod Identity (OpenTofu / Terraform):
resource "aws_iam_role" "checkout_api" {
  name = "checkout-api-pod-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "pods.eks.amazonaws.com" }
      Action    = ["sts:AssumeRole", "sts:TagSession"]
    }]
  })
}

# 2. Bind Role to K8s Namespace + ServiceAccount:
resource "aws_eks_pod_identity_association" "checkout_api" {
  cluster_name    = aws_eks_cluster.prod.name
  namespace       = "checkout"
  service_account = "checkout-api-sa"
  role_arn        = aws_iam_role.checkout_api.arn
}
```

```bash
# Verify Pod Identity associations on a live EKS cluster:
aws eks list-pod-identity-associations --cluster-name prod-eks
```

---

## **4. GitHub Actions OIDC — Keyless Cloud Deployments**

Never store `AWS_ACCESS_KEY_ID` in GitHub Secrets! Scope the IAM trust policy strictly to **exact org, repo, and branch/environment**:

```hcl
# AWS IAM Trust Policy restricted to ONLY main branch of acme-org/infra-live:
data "aws_iam_policy_document" "github_oidc" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:acme-org/infra-live:environment:production"]  # NEVER use repo:acme-org/* in prod!
    }
  }
}
```

```yaml
# .github/workflows/deploy.yml
permissions:
  id-token: write       # Required to request GitHub OIDC JWT
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502 # pinned SHA!
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-prod-deploy
          aws-region: us-east-1
      - run: aws sts get-caller-identity
```

---

## **5. Zero-Trust Human Access (Retiring Bastion Hosts & Static VPNs)**

| Legacy Model | 2026 Zero-Trust Replacement |
| --- | --- |
| Public SSH bastion + `~/.ssh/id_rsa` shared keys | **Teleport / AWS SSM Session Manager / Tailscale SSH** (SSO + short-lived certs + session recording) |
| Open VPN giving flat `/16` access to all prod DBs | **Identity-Aware Proxy** (Cloudflare Access / BeyondCorp / Tailscale ACLs) granting per-app access |
| Permanent `cluster-admin` RBAC for all SREs | **Just-in-Time (JIT) Break-Glass Elevation** (1–4h ticket-linked elevation with full audit trail) |

### AWS SSM Session Manager (Zero Inbound Port 22!)

```bash
# Connect to a private EC2 node with ZERO public IP, ZERO port 22, full CloudTrail audit:
aws ssm start-session --target i-0a1b2c3d4e5f67890

# Secure port-forwarding to private RDS/internal admin UI over SSM:
aws ssm start-session \
  --target i-0a1b2c3d4e5f67890 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["prod-db.internal"],"portNumber":["5432"],"localPortNumber":["15432"]}'
```

---

## **6. Zero-Trust Security Audit Checklist**

- **Zero IAM Users with Access Keys** in production cloud accounts (enforce via AWS SCP / GCP Org Policy `iam.disableServiceAccountKeyCreation`).
- **IMDSv2 Mandatory (`httpPutResponseHopLimit: 1`)** on all EC2 nodes so SSRF vulnerabilities cannot steal node IAM credentials.
- **Disable Auto-Mounted K8s ServiceAccount Tokens** (`automountServiceAccountToken: false`) on every Pod that does not talk to the Kubernetes API.
- **mTLS Everywhere** (Cilium WireGuard / Istio Ambient / Linkerd + SPIFFE) with explicit L4/L7 authorization policies — never trust "inside the VPC".
