# ⚡ Karpenter, KEDA & Kubernetes Autoscaling Cheatsheet

In 2026, production Kubernetes clusters combine **three complementary autoscaling layers**:
1. **Pod Horizontal Scaling** — **HPA** (CPU/Memory) and **KEDA** (event-driven queues, Kafka, Prometheus, scale-to-zero).
2. **Pod Vertical Right-Sizing** — **VPA** (and **In-Place Pod Resize** in K8s 1.32+).
3. **Node Provisioning & Bin-Packing** — **Karpenter** (sub-minute just-in-time right-sized nodes + automatic cost consolidation).

---

## **1. The 3-Layer Autoscaling Architecture**

```text
Incoming Traffic / Queue Depth (SQS, Kafka, HTTP RPS)
         │
         ▼
  ┌─────────────────────────┐
  │ KEDA / HPA              │  Scales Pod replicas (0 -> 500)
  └───────────┬─────────────┘
              │  Pods enter Pending (Unschedulable)
              ▼
  ┌─────────────────────────┐
  │ Karpenter               │  Inspects exact Pod CPU/RAM/GPU/AZ needs
  │ (NodePool + NodeClass)  │  Launches optimal EC2/VM in ~35–55 seconds!
  └───────────┬─────────────┘
              │  Consolidation loop (when utilization drops)
              ▼
  Replaces oversized/underutilized nodes with smaller/cheaper ones automatically!
```

---

## **2. Karpenter vs Cluster Autoscaler**

| Feature | Karpenter (2026 Default) | Cluster Autoscaler (Legacy) |
| --- | --- | --- |
| **Node Provisioning Speed** | **~35–60 seconds** (direct Cloud API, no ASG wait) | 2–5 minutes (Auto Scaling Group indirection) |
| **Instance Selection** | Picks optimal SKU dynamically across 100+ instance types | Limited to pre-defined Node Groups / ASGs |
| **Spot Resilience** | Automatic multi-SKU Spot diversification + fallback to On-Demand | Rigid mixed-instance ASG policies |
| **Cost Consolidation** | Actively replaces underutilized nodes with smaller right-sized ones | Only deletes completely empty/low-util nodes |
| **Drift Detection** | Auto-replaces nodes when AMI, K8s version, or subnet changes | Manual node group rolling upgrades |

---

## **3. Karpenter v1 (`NodePool` & `EC2NodeClass`)**

### Production `NodePool` (Spot + On-Demand Fallback + Consolidation + Disruption Budgets)

```yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: general-compute
spec:
  template:
    metadata:
      labels:
        workload-tier: general
    spec:
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default-al2023
      expireAfter: 720h                    # Force fresh patched AMI every 30 days!
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64", "arm64"]       # Enables Graviton cost savings automatically
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]    # Prefers Spot; falls back to On-Demand seamlessly
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["c", "m", "r"]
        - key: karpenter.k8s.aws/instance-generation
          operator: Gt
          values: ["5"]                    # Only modern Gen 6/7/8 instances
        - key: karpenter.k8s.aws/instance-size
          operator: NotIn
          values: ["nano", "micro", "small"]
  limits:
    cpu: "400"                             # Hard safety cap against runaway scaling bills!
    memory: 1600Gi
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 1m
    budgets:
      - nodes: "10%"                       # Never disrupt >10% of fleet at once
      - schedule: "0 9 * * 1-5"            # Freeze non-empty consolidation during business hours
        duration: 8h
        nodes: "0"
        reasons: ["Underutilized"]
```

### Production `EC2NodeClass` (Bottlerocket / AL2023 + IMDSv2 + Encrypted EBS)

```yaml
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: default-al2023
spec:
  amiSelectorTerms:
    - alias: al2023@latest                 # Auto-tracks latest EKS-optimized AMI (triggers drift!)
  role: KarpenterNodeRole-prod-eks
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: prod-eks
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: prod-eks
  metadataOptions:
    httpEndpoint: enabled
    httpProtocolIPv6: disabled
    httpPutResponseHopLimit: 1             # Enforces IMDSv2 hop limit = 1 (blocks pod SSRF!)
    httpTokens: required
  blockDeviceMappings:
    - deviceName: /dev/xvda
      ebs:
        volumeSize: 80Gi
        volumeType: gp3
        iops: 3000
        throughput: 125
        encrypted: true
        deleteOnTermination: true
```

### Protecting Critical Pods from Consolidation Eviction

```yaml
metadata:
  annotations:
    karpenter.sh/do-not-disrupt: "true"    # Use ONLY on batch jobs or non-idempotent workers
```

---

## **4. KEDA (Kubernetes Event-Driven Autoscaling)**

**KEDA** (CNCF Graduated) extends HPA to scale on **65+ external event sources** (Kafka lag, AWS SQS, RabbitMQ, Prometheus PromQL, Cron schedules, PostgreSQL queries) — including **scale-to-zero** (`0` pods when idle!).

### `ScaledObject` — Scale Workers on AWS SQS Queue + Scale-to-Zero

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: invoice-worker-scaler
  namespace: billing
spec:
  scaleTargetRef:
    name: invoice-worker
  minReplicaCount: 0                       # Scales to 0 pods when queue is empty!
  maxReplicaCount: 60
  pollingInterval: 15
  cooldownPeriod: 300                      # Wait 5m before scaling back to 0
  advanced:
    horizontalPodAutoscalerConfig:
      behavior:
        scaleUp:
          stabilizationWindowSeconds: 0    # Scale up immediately on burst
          policies:
            - type: Percent
              value: 100
              periodSeconds: 30
        scaleDown:
          stabilizationWindowSeconds: 300  # Avoid flapping on scale down
          policies:
            - type: Percent
              value: 20
              periodSeconds: 60
  triggers:
    - type: aws-sqs-queue
      authenticationRef:
        name: keda-aws-pod-identity
      metadata:
        queueURL: https://sqs.us-east-1.amazonaws.com/123456789012/prod-invoices
        queueLength: "10"                  # Target: 10 messages per pod
        awsRegion: us-east-1
        identityOwner: operator
```

### `ScaledObject` — Scale API on Prometheus RPS / Latency

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: checkout-rps-scaler
  namespace: checkout
spec:
  scaleTargetRef:
    name: checkout-api
  minReplicaCount: 3
  maxReplicaCount: 50
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.monitoring.svc:9090
        query: sum(rate(http_requests_total{service="checkout-api"}[2m]))
        threshold: "250"                   # 1 pod per 250 RPS
```

---

## **5. HPA vs VPA vs KEDA Decision Table**

| Tool | Scales What | Best Use Case | Conflict Warning |
| --- | --- | --- | --- |
| **HPA v2** | Pod replicas (min 1) | CPU/memory-bound stateless HTTP APIs | Don't pair with KEDA on the same Deployment (KEDA manages its own HPA!) |
| **KEDA** | Pod replicas (`0 → N`) | Queue consumers (SQS/Kafka), cron bursts, custom PromQL | Never manually edit the HPA created by KEDA |
| **VPA** | Pod CPU/RAM requests | Right-sizing stateful/singleton apps & recommendations (`Off` mode) | Never run VPA `Auto` on CPU/RAM alongside HPA scaling on CPU/RAM! |
| **Karpenter** | Cluster Nodes (EC2/VMs) | Just-in-time node sizing, Spot savings, GPU nodes | Always set `limits:` on every `NodePool` |

---

## **6. Essential Troubleshooting Commands**

```bash
# Karpenter: inspect NodePools, live NodeClaims, and real-time decisions:
kubectl get nodepools,ec2nodeclasses,nodeclaims -o wide
kubectl logs -n kube-system -l app.kubernetes.io/name=karpenter -f

# Find why a Pod is Pending (Karpenter emits scheduling events directly on the Pod!):
kubectl describe pod <pending-pod> -n checkout | grep -A 15 Events

# KEDA: inspect ScaledObjects, auto-generated HPAs, and trigger errors:
kubectl get scaledobject,hpa -A
kubectl describe scaledobject invoice-worker-scaler -n billing
kubectl logs -n keda -l app=keda-operator --tail=100
```
