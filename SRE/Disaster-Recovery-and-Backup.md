# 💾 Disaster Recovery, Backups & Multi-Region Architecture Cheatsheet

Backups you have never restored are **just expensive files on S3**. Production SRE teams design **Disaster Recovery (DR)** around explicit **RPO** and **RTO** targets, automate Kubernetes + database backups, and verify restores through scheduled drills.

---

## **1. RPO vs RTO — The Two Numbers That Drive Everything**

```text
Last Successful Backup        Disaster Strikes                 Service Restored
         │                           │                                │
         ├────────── RPO ────────────┤────────────── RTO ─────────────┤
         │  Max acceptable data loss │   Max acceptable downtime      │
```

| DR Strategy | Typical RPO | Typical RTO | Cost | How It Works |
| --- | --- | --- | --- | --- |
| **Backup & Restore** | Hours (1–24h) | Hours (4–24h) | `$` | Nightly snapshots to cross-region object storage; rebuild infra via OpenTofu/IaC |
| **Pilot Light** | Minutes (1–15m) | 15–60 min | `$$` | Live cross-region DB replica running continuously; compute scales up from 0 on failover |
| **Warm Standby** | Seconds – Minutes | 5–15 min | `$$$` | Scaled-down copy of full stack running live in DR region; scale out & switch DNS |
| **Active-Active Multi-Region** | Near-Zero (Seconds) | Near-Zero (Seconds) | `$$$$` | Traffic served simultaneously from 2+ regions; global DB (CockroachDB/Spanner/Aurora Global) |

---

## **2. Kubernetes Cluster Backups with Velero**

**Velero** backs up Kubernetes API objects (Deployments, CRDs, RBAC, Secrets) AND Persistent Volumes (CSI snapshots or Kopia file-level backups) to cross-region object storage.

```bash
# Install Velero on AWS with CSI Snapshot support (zero static keys via IRSA/Pod Identity):
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.11.0 \
  --bucket acme-k8s-velero-backups-dr \
  --backup-location-config region=us-west-2 \
  --snapshot-location-config region=us-west-2 \
  --features=EnableCSI \
  --use-node-agent

# Create an automated daily backup schedule (30-day retention, exclude ephemeral namespaces):
velero schedule create prod-daily \
  --schedule="0 2 * * *" \
  --exclude-namespaces kube-system,velero,chaos-testing \
  --snapshot-volumes \
  --ttl 720h0m0s

# Trigger an ad-hoc backup before a major cluster upgrade:
velero backup create pre-upgrade-1-32 --include-namespaces checkout,payments --wait

# Inspect backup health & errors:
velero backup describe pre-upgrade-1-32 --details
velero backup logs pre-upgrade-1-32

# Perform a DR restore into a new cluster (or remap namespace for safe restore drill!):
velero restore create drill-restore-01 \
  --from-backup pre-upgrade-1-32 \
  --namespace-mappings checkout:checkout-dr-drill \
  --wait
```

> **GitOps + Velero Synergy:** Don't rely on Velero to recreate stateless Deployments — **Argo CD / Flux** recreates stateless apps cleanly from Git. Use Velero primarily for **stateful PVCs, Secrets, cluster-local state, and point-in-time rollbacks**.

---

## **3. Kubernetes `etcd` Backup & Restore (Self-Managed / On-Prem / Kubeadm)**

For non-managed clusters, `etcd` IS the entire cluster state. Automate snapshots every 30–60 minutes to off-cluster encrypted storage:

```bash
# 1. Take a consistent etcd snapshot:
ETCDCTL_API=3 etcdctl snapshot save /backup/etcd-$(date +%Y%m%d-%H%M).db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 2. Verify snapshot integrity immediately after creation:
ETCDCTL_API=3 etcdctl snapshot status /backup/etcd-20260914-0200.db --write-out=table

# 3. Restore etcd snapshot to a fresh data directory (control-plane recovery):
ETCDCTL_API=3 etcdctl snapshot restore /backup/etcd-20260914-0200.db \
  --data-dir=/var/lib/etcd-restored \
  --name=master-1 \
  --initial-cluster="master-1=https://10.0.1.10:2380" \
  --initial-advertise-peer-urls="https://10.0.1.10:2380"

# 4. Point static pod manifest (/etc/kubernetes/manifests/etcd.yaml) to /var/lib/etcd-restored
#    and verify kube-apiserver recovers:
kubectl get nodes && kubectl get pods -A
```

---

## **4. Database Point-in-Time Recovery (PITR) & Cross-Region DR**

### PostgreSQL / CloudNativePG (Kubernetes-Native Postgres with Barman/S3 WAL Archiving)

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: checkout-pg
  namespace: checkout
spec:
  instances: 3
  storage:
    size: 200Gi
  backup:
    barmanObjectStore:
      destinationPath: "s3://acme-pg-wal-dr/checkout/"
      s3Credentials:
        inheritFromIAMRole: true
      wal:
        compression: gzip
        maxParallel: 4
    retentionPolicy: "30d"
```

```bash
# AWS RDS / Aurora Point-in-Time Recovery (restore to exact second BEFORE accidental DROP TABLE):
aws rds restore-db-cluster-to-point-in-time \
  --source-db-cluster-identifier prod-checkout-aurora \
  --db-cluster-identifier prod-checkout-pitr-recovery \
  --restore-to-time "2026-09-14T13:59:45Z" \
  --db-subnet-group-name prod-private-subnets

# Promote a cross-region Aurora Global Database secondary during a regional outage:
aws rds failover-global-cluster \
  --global-cluster-identifier prod-global-checkout \
  --target-db-cluster-identifier arn:aws:rds:us-west-2:123456789012:cluster:dr-checkout-west
```

---

## **5. The 3-2-1-1-0 Ransomware-Proof Backup Rule (2026 Standard)**

| Rule | Meaning | Production Implementation |
| --- | --- | --- |
| **3** Copies | Production data + 2 independent backups | Live DB + local snapshot + remote copy |
| **2** Media / Accounts | Separate AWS/GCP **Backup Vault Account** | Isolated backup account with separate IAM root/SCPs |
| **1** Offsite / Cross-Region | Replicated to a second geographic region | S3 Cross-Region Replication (`us-east-1` → `us-west-2`) |
| **1** Immutable / Air-Gapped | **Object Lock (WORM / Compliance Mode)** | Ransomware/compromised admin CANNOT delete backups |
| **0** Unverified Errors | Automated weekly/monthly restore verification | CI job restores snapshot to ephemeral env & runs `SELECT count(*)` |

---

## **6. DNS & Traffic Failover Checklist**

- **Keep DNS TTL low (`30s`–`60s`)** on failover records (Route 53 Failover Routing / Cloudflare Load Balancer), OR use **Anycast / AWS Global Accelerator** to avoid stubborn ISP DNS caching altogether.
- **Health checks must test real readiness** (DB reachability, not just static HTTP 200), while avoiding shallow dependency loops that falsely trip *both* regions offline.
- **Avoid Split-Brain Writes:** Before promoting Region B to primary, fence/demote Region A's writers (or ensure conflict resolution / CRDTs in active-active stores).
- **Pre-warm capacity in DR:** Ensure AWS/GCP service quotas (vCPUs, EBS volumes, NAT Gateways, ENIs, Karpenter limits) in the DR region are ALREADY raised to handle 100% production peak load!

---

## **7. Quarterly DR Drill Checklist**

1. **Automated Restore Verification** — Restore latest production DB snapshot + Velero PVC into an isolated sandbox every week; measure actual **RTO** and **RPO** against targets.
2. **Region Evacuation Drill** — Shift 10% → 100% of live traffic out of Primary Region for 30 minutes using Route 53 / Global Accelerator; verify latency, auth tokens, webhooks, and external partner IP allowlists.
3. **Break-Glass Credential Test** — Verify engineers can access DR console/clusters even if Okta SSO or the primary AWS region's STS endpoint is degraded.
4. **Update Runbook with Observed Timings** — Document real observed RTO (e.g., *"Aurora promotion took 62s; Karpenter scaled 40 nodes in 3m15s"*).
