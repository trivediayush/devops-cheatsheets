# 🧠 GPU & LLM Infrastructure on Kubernetes (AI Platform Engineering) Cheatsheet

In 2026, running **AI/LLM inference and training on Kubernetes** is one of the highest-impact specialties in DevOps, Platform, and SRE engineering. GPUs cost `$2–$40+/hour` per node — making **GPU scheduling (MIG, Time-Slicing, DRA)**, **high-throughput serving (vLLM, LeaderWorkerSet)**, **LLM-specific SLOs (TTFT/ITL)**, and **DCGM observability** mandatory platform skills.

---

## **1. Production LLM Inference Architecture on Kubernetes**

```text
Clients / Agents
      │
      ▼
AI Gateway (Envoy AI Gateway / LiteLLM / Kong AI)
  ├─ Token rate-limiting, semantic caching, prompt guardrails, fallback routing
  └─ Cost attribution per team / tenant / model
      │
      ▼
Kubernetes GPU Cluster (Karpenter GPU NodePools + NVIDIA GPU Operator)
  ├─ Model Weights Cache (EFS/FSx Lustre / OCI ModelCar / NVMe DaemonSet)
  ├─ Serving Engine: vLLM / SGLang / NVIDIA NIM / Triton (PagedAttention + Continuous Batching)
  └─ Autoscaler: KEDA scaling on vLLM KV-Cache % & Pending Queue (NOT CPU%!)
      │
      ▼
Observability: NVIDIA DCGM Exporter + vLLM /metrics -> Prometheus -> Grafana
```

---

## **2. GPU Sharing & Scheduling Strategies (Stop Wasting 80% of an H100!)**

| Strategy | Hardware Isolation | Memory Isolation | Best Use Case |
| --- | --- | --- | --- |
| **Exclusive Whole GPU** | Full | Full | Large LLMs (70B+ FP8/BF16), distributed training |
| **NVIDIA MIG (Multi-Instance GPU)** | Full hardware partitions (e.g., 7× `1g.10gb` on H100/A100) | Strict isolated VRAM & SMs | Multi-tenant production inference (7B–13B models, embeddings) |
| **GPU Time-Slicing** | None (shared compute) | None (can OOM neighbors!) | Dev notebooks, low-traffic internal tools only |
| **NVIDIA MPS** | Partial concurrency | Optional memory limit | Trusted same-tenant microservices needing concurrent kernels |
| **Kubernetes DRA (Dynamic Resource Allocation)** | First-class K8s 1.32+ `ResourceClaim` API | Full vendor-aware topology | 2026 standard replacing legacy `nvidia.com/gpu` extended resources |

### Requesting a MIG Partition vs Whole GPU in a Pod

```yaml
resources:
  limits:
    # Whole GPU:
    nvidia.com/gpu: "1"
    # OR isolated hardware MIG slice (A100/H100 3g.40gb):
    # nvidia.com/mig-3g.40gb: "1"
```

---

## **3. Production `vLLM` Deployment on Kubernetes**

**vLLM** is the 2026 open-source standard for LLM serving thanks to **PagedAttention** (near-zero KV-cache fragmentation), **Continuous Batching**, and **Prefix Caching**:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llama-3-3-70b-vllm
  namespace: ai-inference
spec:
  replicas: 2
  selector:
    matchLabels: { app: llama-vllm }
  template:
    metadata:
      labels: { app: llama-vllm }
    spec:
      nodeSelector:
        karpenter.sh/nodepool: gpu-h100
      tolerations:
        - key: "nvidia.com/gpu"
          operator: "Exists"
          effect: "NoSchedule"
      containers:
        - name: vllm
          image: vllm/vllm-openai:v0.7.2
          args:
            - "--model=/models/meta-llama/Llama-3.3-70B-Instruct"
            - "--tensor-parallel-size=4"              # Shard across 4 GPUs on the node
            - "--quantization=fp8"                    # Cuts VRAM ~50% with near-zero quality loss
            - "--gpu-memory-utilization=0.90"         # Reserve 90% VRAM for weights + KV cache
            - "--enable-prefix-caching"               # Huge speedup for shared system prompts!
            - "--max-model-len=32768"
            - "--port=8000"
          ports:
            - containerPort: 8000
              name: http
          resources:
            requests:
              cpu: "16"
              memory: 64Gi
              nvidia.com/gpu: "4"
            limits:
              memory: 96Gi
              nvidia.com/gpu: "4"
          volumeMounts:
            - name: model-cache
              mountPath: /models
              readOnly: true
            - name: dshm
              mountPath: /dev/shm                     # CRITICAL for NCCL multi-GPU tensor parallelism!
          startupProbe:
            httpGet: { path: /health, port: 8000 }
            failureThreshold: 60                      # Model weight loading takes 1–4 minutes!
            periodSeconds: 10
          readinessProbe:
            httpGet: { path: /health, port: 8000 }
            periodSeconds: 5
      volumes:
        - name: model-cache
          persistentVolumeClaim:
            claimName: fast-nvme-models-pvc           # Pre-cached weights (avoid 140GB HF downloads on cold start!)
        - name: dshm
          emptyDir:
            medium: Memory
            sizeLimit: 16Gi
```

> **Multi-Node LLMs (405B+ / MoE models):** Use Kubernetes SIG Apps **`LeaderWorkerSet` (LWS)** to schedule gang-scheduled multi-node vLLM/Ray pods with RDMA/EFA networking.

---

## **4. LLM-Specific SLIs, SLOs & Autoscaling Metrics**

Never autoscale an LLM serving deployment on CPU `%` — the CPU is mostly idle while the GPU KV-cache is 99% full!

| Metric | Meaning | Production SLO Target |
| --- | --- | --- |
| **TTFT** (Time to First Token) | Latency until user sees first streamed token | `< 500ms` (interactive chat) |
| **ITL / TPOT** (Inter-Token Latency) | Time between consecutive tokens (`ms/token`) | `< 35ms` (~30+ tokens/sec) |
| **vLLM `num_requests_waiting`** | Requests queued waiting for KV-cache slots | Primary **KEDA autoscaling trigger!** |
| **vLLM `gpu_cache_usage_perc`** | KV-cache VRAM saturation (`0.0 – 1.0`) | Alert/scale out above `0.80` |
| **DCGM `DCGM_FI_DEV_GPU_UTIL`** | Compute saturation (`%`) | Target `65–85%` during peak |
| **DCGM `DCGM_FI_DEV_XID_ERRORS`** | Hardware GPU faults (`Xid 79`, `Xid 48` ECC errors) | Auto-cordon & replace node immediately! |

### KEDA Autoscaler Triggered by vLLM Queue Depth & KV-Cache

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: vllm-queue-scaler
  namespace: ai-inference
spec:
  scaleTargetRef:
    name: llama-3-3-70b-vllm
  minReplicaCount: 1
  maxReplicaCount: 8
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.monitoring.svc:9090
        query: avg(vllm:num_requests_waiting{namespace="ai-inference"})
        threshold: "5"                        # Scale out when >5 requests queue per replica
```

---

## **5. Essential GPU & AI Cluster Operations Commands**

```bash
# Inspect GPU allocation, VRAM, temperature, and ECC errors inside a GPU pod:
kubectl exec -n ai-inference deploy/llama-vllm -- nvidia-smi
kubectl exec -n ai-inference deploy/llama-vllm -- nvidia-smi topo -m    # Verify NVLink vs PCIe!

# Check MIG partitions on a GPU node:
nvidia-smi mig -lgip
nvidia-smi mig -lgi

# Inspect cluster-wide GPU capacity vs allocated GPUs:
kubectl get nodes -l nvidia.com/gpu.present=true \
  -o custom-columns=NAME:.metadata.name,GPU_PRODUCT:.metadata.labels.nvidia\\.com/gpu\\.product,GPUS:.status.allocatable.nvidia\\.com/gpu

# Benchmark live LLM serving throughput, TTFT & ITL (OpenAI-compatible endpoint):
vllm bench serve \
  --backend openai-chat \
  --base-url http://llama-vllm.ai-inference.svc:8000 \
  --model meta-llama/Llama-3.3-70B-Instruct \
  --dataset-name random \
  --num-prompts 200 \
  --request-rate 8
```

---

## **6. AI FinOps & Cold-Start Optimization (2026 Must-Knows)**

1. **Pre-stage weights on fast shared storage or NVMe** (AWS FSx for Lustre, GCS FUSE + local SSD cache, or Run:ai Model Streamer) — cuts cold-start pod boot from `12 min` down to `< 45 sec`!
2. **Quantize smartly (FP8 on H100/L40S, AWQ/INT4 on L4/A10G)** — halves GPU count and doubles throughput for most enterprise RAG/agent workloads.
3. **Model Routing at the AI Gateway** — Route simple classification/summarization to small fast models (8B/Haiku/Flash) and reserve 70B+/frontier reasoning models for complex queries (saves 60–80% token spend).
4. **Auto-remediate unhealthy GPU nodes** using **Kubernetes Node Problem Detector (NPD)** watching for `Xid` GPU errors so broken hardware never silently blackholes inference pods.
5. **Reclaim idle GPU notebooks** — Enforce Kubeflow/Jupyter idle culling (`> 2h` idle) and schedule batch training/fine-tuning on **Spot GPU Karpenter NodePools** with frequent checkpointing to S3/GCS.
