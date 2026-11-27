# 📈 Observability — Concepts & Vocabulary

**Monitoring ≠ observability.** Monitoring answers questions you predicted ("is CPU high?"). Observability lets you debug problems you *didn't* predict — arbitrary questions about arbitrary failures. This sheet is the vocabulary and mental models the industry actually uses.

---

## **1. The Core Vocabulary**

| Term | Definition — say it in an interview |
| --- | --- |
| **Monitoring** | Collecting predefined signals and alerting on known failure modes. "Known unknowns." |
| **Observability** | Property of a system that lets you infer internal state from outputs — debug *novel* failures. "Unknown unknowns." |
| **Telemetry** | The data your system emits: metrics, logs, traces, (and increasingly) profiles & events. |
| **Instrumentation** | Code that emits telemetry — manual (spans, counters) or auto (agents, eBPF). |
| **MELT** | The four telemetry types: **M**etrics, **E**vents, **L**ogs, **T**races. |
| **White-box** | Instrumented from inside (app emits metrics) — rich but needs code. |
| **Black-box** | Observed from outside (synthetic probes, LB logs) — sees what users see. |

---

## **2. The Three Pillars — With Their Failure Modes**

### 🔹 Metrics — "Is something wrong, at scale?"

Numbers aggregated over time. Cheap, fast, alertable.

| Type | Meaning | PromQL example |
| --- | --- | --- |
| **Counter** | Only goes up (requests_total) | `rate(http_requests_total[5m])` |
| **Gauge** | Goes up & down (memory, queue depth) | `node_memory_MemAvailable_bytes` |
| **Histogram** | Distribution into buckets (latency) | `histogram_quantile(0.99, rate(latency_bucket[5m]))` |
| **Summary** | Client-side quantiles | `http_duration_seconds{quantile="0.95"}` |

**Why histograms > summaries for aggregation:** histogram buckets are counters you can `rate()` and `sum()` across instances → accurate fleet-wide p99. Summary quantiles are per-instance and can't be merged.

**Cardinality — the #1 production metric failure:** every unique label-set = a new time series. `user_id` as a label on a 10M-user system = 10M series = Prometheus OOM. Rule: labels must be **bounded** (endpoint, status, region — never IDs/emails/UUIDs).

### 🔹 Logs — "What exactly happened?"

Discrete events. Richest detail, most expensive at scale.

* **Structured > unstructured**: JSON logs (`{"ts","level","msg","trace_id",...}`) are queryable; grep-able strings are not.
* **Levels**: `DEBUG < INFO < WARN < ERROR` — sample/drop DEBUG in prod, keep ERROR always.
* **Cost model**: ingestion $$ scales with volume — high-cardinality debug logs at scale is the classic bill shock. Sample, don't just ship everything.
* Tools: Loki (label-indexed, cheap), ELK/OpenSearch (full-text, expensive), Datadog/Splunk (SaaS).

### 🔹 Traces — "Where did this request spend its time?"

A **trace** = one request's journey; **spans** = timed operations within it (DB query, HTTP call), linked by parent-child IDs.

```text
trace_id: 4bf92f3577b34da6a3ce929d0e0e4736
├─ span: GET /checkout           800ms   (service: gateway)
│  ├─ span: POST /charge         620ms   (service: payments)
│  │  └─ span: SELECT ...        590ms   (db: postgres)  ← the actual bottleneck
│  └─ span: GET /inventory        90ms   (service: inventory)
```

* **Context propagation**: `traceparent` HTTP header (W3C Trace Context) carries trace/span IDs between services — without it, traces break at service boundaries.
* **Sampling**: you can't keep 100% of traces at scale → head-based (decide at request start) vs tail-based (decide after seeing the full trace — keep errors/slow ones, drop boring ones). Tail sampling needs a collector.
* See `OpenTelemetry.md` for the instrumentation side.

---

## **3. How You Ask the Question — Frameworks**

| Framework | For | Signals |
| --- | --- | --- |
| **Four Golden Signals** (Google SRE) | Request-driven services | **Latency, Traffic, Errors, Saturation** |
| **RED** (Tom Wilkie) | Microservices, per-endpoint | **Rate, Errors, Duration** |
| **USE** (Brendan Gregg) | Resources/infra | **Utilization, Saturation, Errors** |

Apply: Golden signals/RED at the service level, USE at the resource level (CPU, disk, NIC, pool). Alert on user-facing symptoms (RED), not raw resources (USE).

---

## **4. SLIs, SLOs, Error Budgets — Reliability as a Number**

* **SLI** = a measurable proxy for user happiness: `availability = good_events / total_events`, or `latency = % requests < 300ms`.
* **SLO** = internal target: 99.9% availability over 30 days.
* **SLA** = contractual (looser than SLO — buffer for the team).
* **Error budget** = `1 − SLO` → 0.1% of requests may fail/month. Spend it on velocity; exhausted → freeze risky changes.

```promql
# Availability SLI (30d rolling)
sum(increase(http_requests_total{status!~"5.."}[30d]))
  / sum(increase(http_requests_total[30d]))

# Burn-rate alert: consuming budget 14.4× too fast in 1h (≈ 2% in 1h for 99.9% SLO)
(sum(rate(http_errors_total[1h])) / sum(rate(http_requests_total[1h])))
  > 14.4 * (1 - 0.999)
```

> [!TIP]
> **Multi-window, multi-burn-rate** alerting (fast window + slow window) is the SRE standard — pages when burning fast, tickets when burning slow. See Google SRE Workbook ch. 5.

---

## **5. Correlation — The Whole Point**

Pillars are useless in isolation. The connective tissue:

```text
Metric alert fires (error rate ↑)
  → exemplar links to a sample trace_id
  → trace shows the slow/failed span + service
  → logs filtered by trace_id show the exact error
  → all linked by the same trace_id / request_id
```

* **Exemplars**: metric datapoints annotated with a trace_id — jump from "error rate spike" straight into a real failing trace.
* **Request/correlation ID**: even without full tracing, propagate `X-Request-ID` and log it everywhere — 80% of the value, 20% of the work.

---

## **6. Practical Anti-Patterns**

| Anti-pattern | Why it hurts |
| --- | --- |
| "Alert on everything" | Alert fatigue → real pages ignored. Every alert needs a runbook + an action, else delete it. |
| Unbounded label cardinality | Prometheus OOM, Loki index explosion |
| Logging at DEBUG in prod | Cost + noise; sample |
| 100% trace retention | Unaffordable at scale → tail-sample for the interesting ones |
| Vanity dashboards | 40 panels nobody reads — one golden-signals dashboard per service beats it |
| Measuring only infra | Node CPU fine while users see 500s — measure the user path |

---

## 📚 **Learning Resources**

* 🔗 [Google SRE Book — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
* 📦 [SRE Workbook — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
* 🛡️ [OpenTelemetry Docs](https://opentelemetry.io/docs/) → see `OpenTelemetry.md`
* 🧠 [Observability Engineering (Charity Majors)](https://www.oreilly.com/library/view/observability-engineering/9781492076438/)
