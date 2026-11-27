# 🔭 OpenTelemetry (OTel) Cheatsheet

**OpenTelemetry** is the CNCF standard for generating and shipping telemetry — traces, metrics, logs — in a **vendor-neutral** way. Instrument once with OTel SDKs/Collectors, send data anywhere (Jaeger, Tempo, Datadog, New Relic, Honeycomb) without re-instrumenting.

---

## **1. The Architecture — Where Each Piece Lives**

```text
App code ──(OTel SDK / auto-instrumentation)──► OTLP ──► Collector ──► Backend(s)
   │                                                    │
   │  • traces, metrics, logs                    • receivers: accept OTLP/Jaeger/Prometheus
   │  • context propagation                       • processors: batch, filter, sample, redact
   │                                             • exporters: send to 1..N backends
```

| Component | Job | Where it runs |
| --- | --- | --- |
| **OTel API/SDK** | Produces telemetry inside your app | In-process (your code) |
| **Auto-instrumentation** | Zero-code instrumentation via agents | Java agent, Python instrumentation, .NET, Node, eBPF |
| **Collector** | Vendor-agnostic pipeline: receive → process → export | Sidecar / DaemonSet / gateway service |
| **OTLP** | The wire protocol (gRPC :4317, HTTP :4318) | SDK → Collector → backend |
| **Semantic conventions** | Standard attribute names (`http.method`, `db.system`) | Across all telemetry |

---

## **2. Traces — The Core Model**

| Concept | What it is |
| --- | --- |
| **Span** | One timed operation (name, start/end, attributes, events, status, links) |
| **Trace** | Tree of spans sharing one `trace_id` |
| **Context** | `trace_id` + `span_id` + flags propagated between services |
| **Propagation** | HTTP header `traceparent: 00-<trace_id>-<span_id>-01` (W3C Trace Context); `baggage` for key-values |
| **Sampler** | Decides which traces to keep — `always_on`, `traceidratio`, `parentbased`, `tail` (in Collector) |

### 🔹 Manual instrumentation (Python example)

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint="http://collector:4317")))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)

with tracer.start_as_current_span("process-order") as span:
    span.set_attribute("order.id", order_id)
    span.set_attribute("order.value", total)
    # nested spans auto-link to this parent via context
```

### 🔹 Zero-code auto-instrumentation

```bash
# Java agent — no code changes
java -javaagent:opentelemetry-javaagent.jar \
     -Dotel.service.name=payments \
     -Dotel.exporter.otlp.endpoint=http://collector:4317 \
     -jar app.jar

# Python
pip install opentelemetry-distro opentelemetry-exporter-otlp
opentelemetry-bootstrap -a install
OTEL_SERVICE_NAME=orders OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4317 \
  opentelemetry-instrument python app.py
```

```yaml
# Kubernetes — auto-instrument via the OTel Operator
apiVersion: opentelemetry.io/v1alpha1
kind: Instrumentation
metadata: { name: otel-instrumentation }
spec:
  exporter:
    endpoint: http://otel-collector:4317
  propagators: [tracecontext, baggage]
# Then annotate pods:
#   instrumentation.opentelemetry.io/inject-java: "true"
```

---

## **3. The Collector — The Heart of It**

`otel-collector-config.yaml` — a pipeline of receivers → processors → exporters:

```yaml
receivers:
  otlp:
    protocols:
      grpc: {}          # :4317
      http: {}          # :4318
  prometheus:
    config:
      scrape_configs:
        - job_name: apps
          scrape_interval: 15s
          static_configs: [{ targets: ['localhost:8888'] }]

processors:
  batch: { timeout: 5s }
  memory_limiter: { check_interval: 1s, limit_mib: 512 }
  attributes:
    actions:
      - key: environment
        value: production
        action: upsert
  tail_sampling:                        # keep errors & slow traces, drop noise
    decision_wait: 10s
    policies:
      - name: keep-errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: keep-slow
        type: latency
        latency: { threshold_ms: 500 }
      - name: sample-rest
        type: probabilistic
        probabilistic: { sampling_percentage: 10 }

exporters:
  otlp:                                 # to Tempo/Jaeger/any OTLP backend
    endpoint: tempo:4317
    tls: { insecure: true }
  prometheusremotewrite:
    endpoint: https://mimir/api/v1/push
  debug: {}                             # print to stdout (was 'logging')

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, tail_sampling]
      exporters: [otlp]
    metrics:
      receivers: [otlp, prometheus]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp]
```

**Processor order matters** — `memory_limiter` first, `batch` before exporters, `tail_sampling` last (it must see full traces).

---

## **4. Deployment Patterns — Agent vs Gateway**

| Pattern | Shape | When |
| --- | --- | --- |
| **Agent / DaemonSet** | Collector on every node/pod (sidecar or DaemonSet) | Local processing, tagging with host metadata, offloading the app |
| **Gateway** | Central collector service apps send to | Centralized tail sampling, filtering, cost control — the common prod pattern |
| **Both** | Agent → Gateway | Standard at scale: node-level enrichment, then central sampling/routing |

```yaml
# K8s: agent as DaemonSet via Helm
mode: daemonset
config:
  service:
    pipelines:
      traces:
        receivers: [otlp]
        processors: [batch, k8sattributes]   # adds pod/namespace/node labels
        exporters: [otlp/gateway]
```

---

## **5. Metrics & Logs via OTel**

* **Metrics SDK**: `Meter` → instruments (Counter, UpDownCounter, Histogram, ObservableGauge) → OTLP → Prometheus/remote-write.
* **Logs**: OTel log pipeline bridges existing loggers (log4j, winston, python logging) — adds `trace_id`/`span_id` to every record so logs ↔ traces correlate automatically. This is the hidden superpower.

```python
meter = metrics.get_meter(__name__)
request_counter = meter.create_counter("requests", unit="1")
latency = meter.create_histogram("request.duration", unit="ms")

request_counter.add(1, {"route": "/checkout", "status": "200"})
latency.record(142, {"route": "/checkout"})
```

---

## **6. Context Propagation — Don't Break the Trace**

```bash
# Manual propagation in a service-to-service HTTP call
curl -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
     -H "baggage: userId=123,tenant=acme" \
     https://api.internal/orders
```

* Auto-instrumentation injects `traceparent` on outbound calls and extracts on inbound — you only handle it manually for custom transports (queues, gRPC metadata, Kafka headers).
* **Async/messaging**: propagate via message headers — the trace spans the queue hop.
* `propagators: [tracecontext, baggage]` in SDK/Collector config — B3 (Zipkin) for legacy interop.

---

## **7. Gotchas & Production Notes**

* **Resource attributes**: `service.name` is your primary identity — set `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES=deployment.environment=prod`. Everything tags from here.
* **Sampling at SDK vs Collector**: SDK head sampling drops before export (cheap, may lose errors); Collector tail sampling sees whole traces (smart, costs CPU/memory).
* **Baggage is per-request metadata** — it propagates; don't put PII or large values in it (every downstream span inherits it).
* **Span vs metric for "count X"**: high-rate counting → metric. Per-request detail → span. Don't emit a span attribute you'd rather aggregate.
* **Collector memory**: tail sampling + big traces = memory — always `memory_limiter` first in pipelines.
* **Auto-instrumentation ≠ free**: it adds latency & a big agent jar; still the 80/20 answer for most services.

---

## 📚 **Learning Resources**

* 🔗 [OpenTelemetry Docs](https://opentelemetry.io/docs/)
* 📦 [Collector Configuration](https://opentelemetry.io/docs/collector/configuration/)
* 🛡️ [Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
* 🧪 [OTel Demo (Astronomy Shop)](https://github.com/open-telemetry/opentelemetry-demo)
