# 🔮 AIOps & MLOps — AI in Operations, Ops for AI

**Two different things people confuse:** *AIOps* = using AI to run IT operations better. *MLOps* = DevOps practices applied to ML model lifecycle. Both are real jobs now — here's the vocabulary.

---

## **1. AIOps — AI Applied to IT Operations**

| Capability | What it does | How it works |
| --- | --- | --- |
| **Anomaly detection** | Flags abnormal metrics/logs without static thresholds | Learned baselines, seasonality-aware models (vs fixed CPU>90% alerts) |
| **Alert correlation** | Groups related alerts into one incident | Clustering by topology, time, text similarity — cuts alert storms |
| **Event prediction** | Predicts failures before they happen | Trends + historical patterns (disk fill ETA, capacity forecasting) |
| **RCA assistance** | Points at likely root cause | Correlates deploys/changes with symptoms, log/trace analysis, LLM summarization |
| **Auto-remediation** | Fixes known issues without a human | Runbook automation triggered by classified events (with guardrails) |
| **Noise reduction** | Dedupes/suppresses non-actionable alerts | Classification: "this alert never needs action" |

| Tool | Category |
| --- | --- |
| **Dynatrace Davis**, **Datadog Watchdog**, **Moogsoft/BigPanda** | Commercial AIOps platforms |
| **Grafana ML**, **Elastic ML**, **Prometheus anomaly exporters** | Built-in capabilities |
| **Incident.io / PagerDuty AIOps** | Incident management with AI triage |
| **LLM-based runbooks** | Custom: feed alerts+logs+context to an LLM for summarization/RCA hints |

**The honest take:** AIOps shines at alert correlation + noise reduction (real ROI). "Predict the outage" is marketing more often than reality. Start with deduplication and RCA assist; be skeptical of auto-remediation until confidence is high.

```python
# The DIY version of AIOps triage — alert + context → LLM summary
prompt = f"""
Alert: {alert.name} fired on {alert.service}
Recent deploys: {recent_deploys}
Error logs: {sampled_logs}
Metrics trend: {metric_summary}
Summarize likely cause and suggest first checks. Be concise."""
triage_hint = llm.complete(prompt)   # lands in the incident channel, not as an action
```

---

## **2. MLOps — DevOps for Machine Learning**

```text
Data → Train → Evaluate → Register → Deploy → Monitor
  ↑___________________ retrain loop ___________________↓
```

| Stage | DevOps equivalent | ML-specific concerns |
| --- | --- | --- |
| **Data** | Source code | Versioned datasets (DVC), feature store, data quality checks, PII handling |
| **Train** | Build | Reproducible training (code+data+hyperparams versioned), GPU jobs, experiment tracking (MLflow, W&B) |
| **Evaluate** | Test | Model metrics vs baseline (accuracy, latency, bias) — quality gates like unit tests |
| **Register** | Artifact registry | Model registry: versioned model artifacts + metadata + stage (dev/staging/prod) |
| **Deploy** | Release | Model servers, canary/shadow deploys, rollback — same patterns, different artifact |
| **Monitor** | Observability | Model-specific: **drift**, prediction quality, latency, data quality in production |

### 🔹 The ML-Only Problems

* **Data drift** — input distribution changes (user behavior, upstream schema) → model silently degrades. Monitor input statistics vs training baseline.
* **Model drift** — the world changes (fraud patterns, language) → predictions get worse over time even with clean data. Scheduled retraining.
* **Feedback loops** — model affects the data it learns from (recommendation engines). Monitor for self-reinforcing bias.
* **Reproducibility** — "the model that scored 0.94" needs code + data + hyperparams + random seed all versioned. That's why experiment tracking exists.

```python
# MLflow — the industry-standard experiment tracker + registry shape
import mlflow
mlflow.set_experiment("fraud-detector")
with mlflow.start_run():
    mlflow.log_params({"lr": 0.01, "depth": 6})
    model = train(X, y)
    mlflow.log_metrics({"auc": 0.94, "latency_ms": 12})
    mlflow.sklearn.log_model(model, "model")       # → registered version artifact
# Promote to prod: mlflow.register_model() → stage transition → deploy
```

---

## **3. LLMOps — MLOps for GenAI**

| MLOps concept | LLM-era equivalent |
| --- | --- |
| Model registry | Model version + prompt version + chain/agent config version |
| Evaluation | **Evals** — automated quality tests (exact match, LLM-as-judge, human review) |
| Drift | Prompt/output quality decay, provider model updates changing behavior |
| A/B testing | Prompt A vs B, model X vs Y on live traffic |
| Observability | Trace per request: prompt→retrieval→calls→output→tokens→cost (Langfuse, LangSmith) |
| Deployment | Prompt deploys = code deploys (they change behavior!). Model swap = canary |

---

## **4. The Overlap — Where DevOps Skills Apply**

```text
Your existing muscles map almost 1:1:
CI/CD for ML         → pipelines: data validation → train → eval → gate → deploy
IaC for ML           → same Terraform/K8s, plus GPU node pools + device plugins
Observability for ML → model metrics + drift + latency alongside infra metrics
GitOps for models    → model version + config as code, Argo/Flux deploys
Security for ML      → model supply chain (pickle scanning!), prompt injection, data privacy
```

**GPU infra specifics** (the part that's actually new):

* K8s: NVIDIA device plugin → pods request `nvidia.com/gpu: 1`; MIG/time-slicing for sharing.
* Scheduling: gang scheduling for distributed training (all-or-nothing).
* Inference servers: vLLM/Triton/Ollama behind the same load balancers/autoscaling as anything else.
* Storage: model artifacts are big (GBs) — object store + caching, not git.

---

## 📚 **Learning Resources**

* 🔗 [MLOps Zoomcamp (free)](https://github.com/DataTalksClub/mlops-zoomcamp)
* 📦 [MLflow](https://mlflow.org/) / [DVC](https://dvc.org/)
* 🛡️ [Gartner on AIOps](https://www.gartner.com/en/information-technology/glossary/aiops-artificial-intelligence-operations)
* 🧪 [Langfuse LLMOps](https://langfuse.com/)
