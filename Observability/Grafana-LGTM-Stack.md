# 📊 Grafana LGTM Stack (Loki, Grafana, Tempo, Mimir, Alloy & Pyroscope) Cheatsheet

In 2026, the **Grafana LGTM+P Stack** is the dominant open-source, object-storage-backed observability platform — replacing expensive full-text Elasticsearch clusters and single-node Prometheus servers with horizontally scalable, S3/GCS-backed telemetry unified by **OpenTelemetry** and **Grafana Alloy**.

---

## **1. Architecture — One Unified Collector, Cheap Object Storage**

```text
Workloads (OTLP Metrics, Logs, Traces + eBPF Continuous Profiles)
                         │
                         ▼
               ┌───────────────────┐
               │   Grafana Alloy   │  (OTel-native unified agent — replaces Promtail & Grafana Agent)
               └─┬───┬───────┬───┬─┘
                 │   │       │   │
        ┌────────┘   │       │   └────────┐
        ▼            ▼       ▼            ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐
  │  Loki    │ │  Tempo   │ │  Mimir   │ │ Pyroscope │
  │  (Logs)  │ │ (Traces) │ │(Metrics) │ │(Profiles) │
  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘
       └────────────┴────────────┴─────────────┘
                         │
                         ▼
        S3 / GCS / Azure Blob (Cheap, Infinite Object Storage!)
                         │
                         ▼
               ┌───────────────────┐
               │     Grafana UI    │  Correlates Metrics -> Exemplars -> Traces -> Logs -> CPU Flamegraphs
               └───────────────────┘
```

| Pillar | Component | Query Language | Key 2026 Advantage |
| --- | --- | --- | --- |
| **Logs** | **Loki** | **LogQL** | Indexes *labels + structured metadata*, NOT full text → 5–10x cheaper than ELK! |
| **Traces** | **Tempo** | **TraceQL** | Stores 100% raw spans in S3/GCS + generates RED metrics from spans |
| **Metrics** | **Mimir** (or Thanos) | **PromQL** | Multi-tenant, globally federated Prometheus with 1B+ active series & HA dedup |
| **Profiles** | **Pyroscope** | Flamegraphs | Continuous eBPF CPU/memory profiling (< 1% overhead) linked to slow spans |
| **Collector** | **Grafana Alloy** | River/Alloy HCL | Single DaemonSet/Deployment collecting OTLP, Prometheus scrapes, K8s logs & eBPF |

---

## **2. Grafana Loki — LogQL Mastery & Cardinality Rules**

### Cardinality Rule #1 (How NOT to Crash Loki)
- **Put low-cardinality routing fields in Labels** (`cluster`, `namespace`, `app`, `env`).
- **NEVER put `trace_id`, `user_id`, `request_id`, or `ip` in Labels!** Put them in **Structured Metadata** or JSON log body — Loki filters them fast at query time without exploding index streams.

### Production LogQL Queries

```logql
# 1. Stream selector + line filter + JSON parsing + structured filter:
{namespace="checkout", app="checkout-api"}
  |= "payment"
  != "healthz"
  | json
  | level="error"
  | duration_ms > 500

# 2. Extract metrics directly from logs (error rate per pod over 5m):
sum by (pod) (
  rate({namespace="checkout", app="checkout-api"} | json | level="error" [5m])
)

# 3. Calculate p99 latency from structured JSON access logs:
quantile_over_time(0.99,
  {namespace="gateway", app="envoy"}
    | json
    | unwrap duration_ms [5m]
) by (route)

# 4. Find all logs matching a specific OpenTelemetry Trace ID (Structured Metadata):
{namespace="checkout"} | trace_id="4bf92f3577b34da6a3ce929d0e0e4736"

# 5. Top 10 failing error messages in the last hour:
topk(10,
  sum by (error_code) (
    count_over_time({namespace="checkout"} | json | level="error" [1h])
  )
)
```

---

## **3. Grafana Tempo — TraceQL & Metrics-from-Traces**

### Production TraceQL Queries

```traceql
# 1. Find slow HTTP 500 traces in checkout lasting > 1 second:
{ resource.service.name="checkout-api" && status=error && duration > 1s }

# 2. Find parent spans calling a slow downstream PostgreSQL query:
{ resource.service.name="checkout-api" }
  >> { span.db.system="postgresql" && duration > 250ms }

# 3. Find traces with a specific customer/tenant attribute:
{ span.tenant.id="enterprise-42" && span.http.response.status_code >= 500 }

# 4. Compute p95 latency metrics directly from traces (TraceQL Metrics):
{ resource.service.name="checkout-api" && span.http.route="/api/v1/checkout" }
  | quantile_over_time(duration, 0.95) by (span.http.response.status_code)
```

### Exemplars (1-Click Jump from Prometheus Latency Spike → Exact Trace!)
Enable `--enable-feature=exemplar-storage` on Prometheus/Mimir and instrument OpenTelemetry histograms. Every dot on your Grafana p99 graph becomes a clickable link directly into the slow Tempo trace AND its Pyroscope CPU flamegraph!

---

## **4. Grafana Mimir — Multi-Tenant Long-Term Prometheus**

```yaml
# Prometheus / Alloy remote_write into Mimir with tenant header:
remote_write:
  - url: https://mimir.acme.internal/api/v1/push
    headers:
      X-Scope-OrgID: prod-commerce
    queue_config:
      capacity: 10000
      max_shards: 30
      max_samples_per_send: 2000
    send_exemplars: true                    # Sends Trace IDs with histogram samples!
```

| Feature | Single Prometheus | Mimir / Thanos |
| --- | --- | --- |
| **Retention** | 15–30d local SSD | Multi-year on S3/GCS (`compactor` + `store-gateway`) |
| **Global View** | 1 cluster only | Unified PromQL across 50+ K8s clusters |
| **HA Deduplication** | None (duplicate series) | Automatic HA replica dedup on `replica` label |
| **Multi-Tenancy** | Single tenant | Strict isolation via `X-Scope-OrgID` + per-tenant limits |

---

## **5. Grafana Alloy — Unified Collector Config (`config.alloy`)**

```hcl
// 1. Receive OpenTelemetry (gRPC 4317 / HTTP 4318):
otelcol.receiver.otlp "default" {
  grpc { endpoint = "0.0.0.0:4317" }
  http { endpoint = "0.0.0.0:4318" }

  output {
    metrics = [otelcol.processor.batch.default.input]
    logs    = [otelcol.processor.batch.default.input]
    traces  = [otelcol.processor.tail_sampling.default.input]
  }
}

// 2. Tail-Based Sampling: keep 100% of errors & slow traces (> 1s), 5% of healthy traffic!
otelcol.processor.tail_sampling "default" {
  decision_wait = "10s"
  policy {
    name = "keep-errors"
    type = "status_code"
    status_code { status_codes = ["ERROR"] }
  }
  policy {
    name = "keep-slow"
    type = "latency"
    latency { threshold_ms = 1000 }
  }
  policy {
    name = "sample-healthy"
    type = "probabilistic"
    probabilistic { sampling_percentage = 5 }
  }
  output {
    traces = [otelcol.processor.batch.default.input]
  }
}

otelcol.processor.batch "default" {
  output {
    metrics = [otelcol.exporter.prometheus.mimir.input]
    logs    = [otelcol.exporter.loki.default.input]
    traces  = [otelcol.exporter.otlp.tempo.input]
  }
}

// 3. Continuous eBPF Profiling (zero code changes for Go/Rust/Python/Java/C++):
pyroscope.ebpf "k8s_pods" {
  targets    = discovery.kubernetes.pods.targets
  forward_to = [pyroscope.write.default.receiver]
}
```

---

## **6. Production Sizing & Cost-Control Tips**

- **Tail Sampling saves 80–95% of tracing storage cost** without ever losing a single error or p99 outlier trace!
- **Enforce Loki retention & ingestion limits** per tenant (`retention_period: 30d`, `ingestion_rate_mb: 16`, `max_line_size: 256kb`) so one noisy debug pod cannot DOS logging for the whole company.
- **Drop useless noisy metrics at Alloy** (`relabel` / `metric_relabel_configs`) — dropping unused high-cardinality histogram buckets (`le` on internal debug endpoints) often cuts Mimir series count by 40%+.
- **Use `logcli` for terminal debugging** when Grafana UI is slow or during an incident:

```bash
export LOKI_ADDR=https://loki.acme.internal
logcli query '{namespace="checkout",app="checkout-api"} |= "panic"' --since=30m --limit=50
```
