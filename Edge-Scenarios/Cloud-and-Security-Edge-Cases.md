# ☁️ Cloud, IaC, Security & AI/GPU Edge Cases — Playbook & Answers

Cloud platforms, IaC state files, IAM evaluation rules, telemetry pipelines, and GPU clusters have notoriously sharp edges. Here are **10 high-stakes 2026 production edge cases** with architecture flows, diagnostic commands, and exact recovery answers.

> Practice hands-on cloud, IaC, security, and Linux scenarios at **[practice.atrivedi.online](https://practice.atrivedi.online/)**.

---

## **Edge Case 1: Terraform / OpenTofu State Locked After Crashed CI Runner — Or Worse, Accidental `destroy` Preview**

```text
CI Runner OOM-kills mid-apply -> Remote Lock stays held -> Every subsequent PR blocked!
  OR
Module refactor renames resource `aws_db_instance.main` -> `aws_db_instance.primary`
  -> OpenTofu plans: "- destroy aws_db_instance.main" + "+ create aws_db_instance.primary" (DATA LOSS!)
```

**Diagnostic & Safe Recovery Answers:**
1. **Stuck State Lock:** First confirm **zero active CI pipelines or humans** are actually running `apply` right now! Only then inspect lock metadata and unlock:
```bash
tofu force-unlock <LOCK_ID>
```
2. **Preventing Accidental Resource Recreation During Refactors:** Never let `plan` destroy & recreate stateful resources! Use declarative **`moved {}`** blocks (or `removed {}` to stop managing without destroying):
```hcl
moved {
  from = aws_db_instance.main
  to   = aws_db_instance.primary
}
```
3. **Production Guardrail:** Add `lifecycle { prevent_destroy = true }` on every RDS, S3 bucket, KMS key, and EKS cluster, plus enable **S3 Versioning** on your state bucket so corrupted state can be rolled back in 30 seconds.

---

## **Edge Case 2: "Access Denied" Even Though IAM Role Has `AdministratorAccess`!**

```text
AWS IAM Policy Evaluation Order (ANY Explicit Deny Wins Immediately!):
  1. AWS Organizations SCP (Service Control Policy)   ──► Explicit Deny? BLOCKED!
  2. Resource-Based Policy (S3 / KMS / SQS)           ──► Explicit Deny? BLOCKED!
  3. IAM Permission Boundary                          ──► Missing Allow? BLOCKED!
  4. VPC Endpoint Policy                              ──► Missing Allow? BLOCKED!
  5. Session Policy (STS / Pod Identity / SSO)        ──► Missing Allow? BLOCKED!
  6. Identity Policy (Role's AdministratorAccess)     ──► Checked LAST!
```

**Root Cause Answer:**
`AdministratorAccess` on an IAM role does **NOT** override an **AWS Organizations SCP**, a **Permission Boundary**, a **VPC Endpoint Policy**, or a **KMS Key Policy** that lacks `Enable IAM User Permissions` (`arn:aws:iam::<acct>:root`).

**Diagnostic Commands:**
```bash
# Decode exact authorization failure message (when STS returns an encoded error):
aws sts decode-authorization-message --encoded-message <encoded-string> | jq -r '.DecodedMessage | fromjson'

# Simulate policy evaluation across IAM + boundaries:
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:role/checkout-api \
  --action-names s3:GetObject kms:Decrypt \
  --resource-arns arn:aws:s3:::prod-bucket/data.json
```

---

## **Edge Case 3: RDS / Aurora Failover Completed in 45s — Yet App Kept Failing for 20 Minutes!**

```text
Aurora Failover: prod-db.cluster-xxx.rds.amazonaws.com
   14:00:00  DNS TTL=5s updates IP: 10.0.1.15 (Old Primary) -> 10.0.2.42 (New Primary)
   14:00:45  New Primary is 100% healthy!
   14:05:00  Java / Python / Go app STILL sends writes to 10.0.1.15 (Read-Only / Dead!)
```

**Root Cause Answer:**
1. **Stale DNS Caching** (older JVMs default `networkaddress.cache.ttl` to `-1` = cache forever when SecurityManager is active, or HTTP/DB connection pools hold onto resolved IPs).
2. **Stale Open TCP Connections** in the app's DB connection pool pointing to the demoted old primary (now read-only → `cannot execute INSERT in a read-only transaction`).

**Permanent Fix:**
- Set JVM `-Dsun.net.inetaddr.ttl=5` (and verify Go/Node DNS resolver honors TTL).
- Put **AWS RDS Proxy** (handles Aurora failovers transparently in `< 2s`!) or **PgBouncer** in front of the cluster, and configure pool `maxLifetime: 5m` + `testOnBorrow` validation.

---

## **Edge Case 4: Regional DR Failover Fails Halfway Because DR Region Hits AWS Service Quotas**

**Symptom:** Primary `us-east-1` goes down. You trigger your DR runbook to scale up `us-west-2` — Karpenter tries to launch 60 `c7g.4xlarge` nodes and AWS returns **`VcpuLimitExceeded`**!

**Root Cause Answer:**
AWS/GCP/Azure **service quotas are per-region and per-account**. A brand-new DR region starts with tiny default limits (e.g., 32 On-Demand vCPUs, 5 Elastic IPs, 20 NAT Gateways, 100 ALB target groups).

**Permanent Fix:**
- Manage DR region quotas as code (`aws_servicequotas_service_quota` in OpenTofu) to match `1.2×` primary peak load.
- Run **AWS Trusted Advisor / Quota Monitor** alerts when primary peak usage exceeds `75%` of DR region quota!

---

## **Edge Case 5: GitHub Actions OIDC Fails with `Not authorized to perform sts:AssumeRoleWithWebIdentity`**

**Root Cause Answer (Top 3 Hidden Causes):**
1. **`sub` claim mismatch:** When a workflow uses `environment: production`, GitHub changes the JWT `sub` claim from `repo:org/app:ref:refs/heads/main` to **`repo:org/app:environment:production`**!
2. Missing `permissions: { id-token: write }` in the workflow YAML.
3. Audience (`aud`) mismatch (`sts.amazonaws.com` vs custom audience).

**Fix:** Always align the IAM trust policy `StringEquals` condition with the exact workflow trigger (`environment:production` vs `ref:refs/heads/main`), and **never** use wildcard `repo:org/*` in production IAM roles!

---

## **Edge Case 6: HashiCorp Vault Cluster Sealed After Rolling Node Upgrade — Entire Platform Locked Out**

```text
3-node Raft Vault cluster -> Unattended node upgrade reboots 2 nodes simultaneously
  -> Quorum lost -> Auto-unseal KMS endpoint unreachable (or manual Shamir unseal needed)
  -> All pods restarting fail ESO secret sync & cert-manager PKI issuance!
```

**Root Cause Answer & Permanent Fix:**
- Always run Vault with **Auto-Unseal** (AWS KMS / GCP KMS / Azure Key Vault) + a strict **PodDisruptionBudget (`minAvailable: 2` on 3-node Raft, or `3` on 5-node Raft)**.
- Store **Recovery Keys** in a separate out-of-band offline break-glass vault (never inside Vault itself!).
- Ensure **External Secrets Operator** uses `deletionPolicy: Retain` so existing K8s Secrets stay usable if Vault briefly goes offline!

---

## **Edge Case 7: High-Cardinality Label Explosion Crashes Prometheus & Loki Overnight**

```text
Developer adds `user_id` or raw `/api/orders/9847231` URL path as a Prometheus / Loki label!
  100,000 users × 50 endpoints = 5,000,000 active time series in 10 minutes!
  -> Prometheus OOMKills -> Alertmanager goes blind during an outage!
```

**Diagnostic Commands:**
```bash
# Find the top cardinality offender metrics in Prometheus immediately:
curl -s http://prometheus:9090/api/v1/status/tsdb | jq '.data.seriesCountByMetricName[:10]'
```

**Permanent Fix:**
- Enforce **normalized route templates** (`/api/orders/:id`, never raw IDs!) in OTel HTTP instrumentation.
- Enforce **per-tenant `max_global_series_per_user`** in Mimir and **`max_streams_per_user`** in Loki, and drop rogue labels via `metric_relabel_configs` at **Grafana Alloy**.

---

## **Edge Case 8: GPU Node Silently Drops Inference Requests (`CUDA Error` / `Xid 79`)**

```text
NVIDIA H100 GPU suffers hardware bus failure (Xid 79: GPU has fallen off the bus)
   │  Node Linux OS & kubelet stay 100% Ready=True!
   ▼
Kubernetes keeps scheduling vLLM pods onto the zombie GPU node -> CrashLoopBackOff loop!
```

**Diagnostic Commands:**
```bash
dmesg -T | grep -i "NVRM: Xid"
kubectl logs -n gpu-operator -l app=nvidia-dcgm-exporter | grep XID
```

**Permanent Fix:**
- Deploy **Kubernetes Node Problem Detector (NPD)** + **AWS/GCP GPU Health Check DaemonSet** watching kernel `Xid` errors (48, 63, 64, 79, 95).
- Automatically taint/cordon the node (`nvidia.com/gpu-unhealthy:NoSchedule`) and let Karpenter/ASG replace the faulty GPU host automatically.

---

## **Edge Case 9: Secret Accidentally Pushed to Public/Private Git Repo — Deleting the Commit Didn't Fix It!**

**Symptom:** An engineer committed `.env` with `STRIPE_SECRET_KEY`, then pushed a second commit deleting `.env`. Security scanner still flags it — and bots already scraped it within 40 seconds!

**Root Cause Answer:**
Git commits are immutable snapshots; deleting a file in commit #2 leaves the secret readable forever in commit #1 (and in GitHub PR refs / reflogs / forks).

**Correct Response Order:**
1. **REVOKE & ROTATE the secret FIRST** (assume compromise within seconds!).
2. Purge from Git history using `git-filter-repo --invert-paths --path .env` + force-push (and ask GitHub Support to purge cached PR views if needed).
3. Block future leaks at **pre-commit + PR CI + GitHub Push Protection** using **Gitleaks / TruffleHog**.

---

## **Edge Case 10: S3 Bucket Policy Accidental Lockout ("Even Account Admin Gets 403!")**

**Symptom:** Someone applied a buggy S3 Bucket Policy with `"Effect": "Deny", "Principal": "*"` and a wrong `NotPrincipal` or `StringNotEquals` condition — now even IAM Admins get `403 AccessDenied` when trying to fix or delete the policy!

**Recovery Answer:**
Only the **AWS Account Root User** (which cannot be blocked by an S3 bucket policy) can delete the broken policy via `aws s3api delete-bucket-policy --bucket <bucket>` (or AWS Console signed in as Root with hardware MFA).
**Prevention:** Test every bucket/KMS policy in OpenTofu with IAM Policy Simulator + always include your CI/break-glass admin ARN inside the `StringNotLike: { "aws:PrincipalArn": [...] }` exclusion!

---

## **📚 Practice & Related Playbooks**

- 🧪 [Practice Live Cloud & Security Scenarios — practice.atrivedi.online](https://practice.atrivedi.online/)
- 🔥 [Production Outage Scenarios](./Production-Outage-Scenarios.md)
- ☸️ [Kubernetes Production Edge Cases](./Kubernetes-Edge-Cases.md)
- 🪪 [Zero-Trust & Workload Identity](../Security/Zero-Trust-and-Workload-Identity.md)
