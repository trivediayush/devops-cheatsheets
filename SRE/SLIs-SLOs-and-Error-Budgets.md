# 🎯 SLIs, SLOs & Error Budgets (SRE Math) Cheatsheet

**Site Reliability Engineering (SRE)** replaces gut feelings ("is prod healthy?") with quantitative reliability engineering. **SLIs** measure user happiness, **SLOs** set the target reliability bar, and **Error Budgets** govern the exact balance between shipping features fast and investing in stability.

---

## **1. SLI vs SLO vs SLA vs Error Budget**

| Term | Definition | Example | Audience |
| --- | --- | --- | --- |
| **SLI** (Indicator) | Quantitative ratio of *good events* to *valid events* | `%` of HTTP requests returning `< 500` in `< 250ms` | Engineering |
| **SLO** (Objective) | Target percentage for an SLI over a rolling window | `99.9%` of checkout requests succeed over rolling 30d | Engineering & Product |
| **Error Budget** | Allowed unreliability (`100% - SLO`) | `0.1%` bad requests (or `43.8 min` downtime / 30d) | Product vs SRE trade-off |
| **SLA** (Agreement) | External legal contract with financial penalty (stricter buffer!) | `99.5%` monthly uptime or 10% service credit | Customers & Legal |

```text
Rule of Thumb:  SLI (actual) >= SLO (internal target) > SLA (contractual promise)
                Never set SLO = 100% — 100% leaves ZERO budget for deploys, upgrades, or experiments.
```

---

## **2. Availability "Nines" & Error Budget Reference Table**

| SLO Target | Error Budget % | Downtime / Year | Downtime / 30d Month | Downtime / 7d Week | Bad Requests / 1M |
| --- | --- | --- | --- | --- | --- |
| **99% (2 nines)** | `1.0%` | `3.65 days` | `7.30 hours` | `1.68 hours` | `10,000` |
| **99.5%** | `0.5%` | `1.83 days` | `3.65 hours` | `50.4 min` | `5,000` |
| **99.9% (3 nines)** | `0.1%` | `8.76 hours` | `43.8 min` | `10.1 min` | `1,000` |
| **99.95%** | `0.05%` | `4.38 hours` | `21.9 min` | `5.04 min` | `500` |
| **99.99% (4 nines)** | `0.01%` | `52.6 min` | `4.38 min` | `1.01 min` | `100` |
| **99.999% (5 nines)** | `0.001%` | `5.26 min` | `26.3 sec` | `6.05 sec` | `10` |

### Composite Dependency Math (Why Adding Dependencies Hurts)
- **Serial dependencies** (Service A calls B and C synchronously):
  `Availability_total = A × B × C` → Three `99.9%` services in series = `0.999³ = 99.7%`!
- **Parallel redundant replicas** (Active-Active across 2 independent regions):
  `Availability_total = 1 - (1 - A)(1 - B)` → Two `99.9%` regions in parallel = `1 - (0.001 × 0.001) = 99.9999%` (theoretical upper bound, assuming independent failure domains).

---

## **3. Choosing the Right SLIs by Workload Type**

| Workload Type | Primary SLIs | Avoid Measuring |
| --- | --- | --- |
| **Request / API Service** | Availability (non-5xx), Latency (`<= 250ms` at p99), Quality (graceful fallback rate) | CPU %, Pod count (causes, not user impact) |
| **Data Pipeline / Queue** | Freshness (`%` records processed `< 5m`), Completeness, Correctness | Queue depth alone |
| **Storage / Database** | Durability (zero data loss), Read/Write latency, Availability | Disk IOPS utilization alone |
| **AI / LLM Inference** | Time-to-First-Token (TTFT `< 600ms`), Inter-Token Latency (ITL), Completion Success | GPU % utilization alone |

### Event-Based vs Time-Based SLIs
- **Prefer Event-Based** (`good_requests / total_requests`) over time-based (`good_minutes / total_minutes`): a 2-minute outage at 3 AM with 10 requests is far less painful than a 2-minute outage during Black Friday checkout.
- **Exclude client errors (`4xx`)** from availability SLIs unless a `401/403` spike indicates broken auth infrastructure.

---

## **4. Multi-Window, Multi-Burn-Rate (MWMBR) Alerting (Google SRE Workbook)**

Never page on-call on raw error spikes (too noisy) or slow 30-day averages (too late). **Burn Rate** measures how fast you are consuming your 30-day error budget:

```text
Burn Rate = Current Error Ratio / (1 - SLO)

For a 99.9% SLO (error budget = 0.001):
  Burn Rate  1x  -> consumes 100% of 30d budget in 30 days
  Burn Rate 14.4x -> consumes 2% of 30d budget in 1 hour  (100% exhausted in 2 days -> PAGE NOW!)
  Burn Rate  6x  -> consumes 5% of 30d budget in 6 hours (100% exhausted in 5 days -> PAGE NOW!)
  Burn Rate  1x  -> consumes 10% of 30d budget in 3 days (TICKET, do not wake human at 3 AM!)
```

### Production MWMBR Burn-Rate Table (30-Day Window)

| Severity | Burn Rate | Long Window | Short Window (Reset Guard) | Budget Consumed | Action |
| --- | --- | --- | --- | --- | --- |
| **Critical (Page)** | `14.4x` | `1h` | `5m` | `2%` | Wake on-call immediately |
| **Critical (Page)** | `6.0x` | `6h` | `30m` | `5%` | Wake on-call immediately |
| **Warning (Ticket)** | `3.0x` | `24h` | `2h` | `10%` | Create Jira/Slack ticket |
| **Warning (Ticket)** | `1.0x` | `72h` | `6h` | `10%` | Review in sprint planning |

> **Why the Short Window?** Requiring *both* the long window (`1h`) AND short window (`5m`) to exceed the burn rate guarantees the alert auto-resolves within 5 minutes once you roll back — eliminating zombie pages!

### Copy-Ready Prometheus Recording & Alerting Rules (99.9% SLO)

```yaml
groups:
  - name: checkout-slo-rules
    rules:
      # Recording rules for fast PromQL evaluation across windows:
      - record: slo:http_errors:ratio_rate5m
        expr: |
          sum(rate(http_requests_total{service="checkout",status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total{service="checkout"}[5m]))

      - record: slo:http_errors:ratio_rate30m
        expr: |
          sum(rate(http_requests_total{service="checkout",status=~"5.."}[30m]))
          /
          sum(rate(http_requests_total{service="checkout"}[30m]))

      - record: slo:http_errors:ratio_rate1h
        expr: |
          sum(rate(http_requests_total{service="checkout",status=~"5.."}[1h]))
          /
          sum(rate(http_requests_total{service="checkout"}[1h]))

      - record: slo:http_errors:ratio_rate6h
        expr: |
          sum(rate(http_requests_total{service="checkout",status=~"5.."}[6h]))
          /
          sum(rate(http_requests_total{service="checkout"}[6h]))

      # Fast-burn Page Alert (14.4x on 1h AND 5m -> 2% budget gone in 1h):
      - alert: CheckoutErrorBudgetFastBurn
        expr: |
          (
            slo:http_errors:ratio_rate1h > (14.4 * (1 - 0.999))
            and
            slo:http_errors:ratio_rate5m > (14.4 * (1 - 0.999))
          )
          or
          (
            slo:http_errors:ratio_rate6h > (6 * (1 - 0.999))
            and
            slo:http_errors:ratio_rate30m > (6 * (1 - 0.999))
          )
        labels:
          severity: critical
          service: checkout
        annotations:
          summary: "Checkout API burning 30d error budget rapidly"
          runbook_url: "https://runbooks.acme.internal/checkout/slo-burn"
```

---

## **5. SLOs-as-Code with Sloth / OpenSLO (2026 Standard)**

Stop hand-writing 150 lines of PromQL per service. Define a 20-line **Sloth** spec and generate all recording + MWMBR alerting rules automatically in CI:

```yaml
# sloth-checkout.yaml
version: "prometheus/v1"
service: "checkout-api"
labels:
  owner: "team-checkout"
  tier: "1"
slos:
  - name: "requests-availability"
    objective: 99.9
    description: "99.9% of checkout HTTP requests return non-5xx"
    sli:
      events:
        error_query: sum(rate(http_requests_total{service="checkout",status=~"5.."}[{{.window}}]))
        total_query: sum(rate(http_requests_total{service="checkout"}[{{.window}}]))
    alerting:
      name: CheckoutHighErrorRate
      page_alert:
        labels: { severity: critical }
      ticket_alert:
        labels: { severity: warning }
```

```bash
# Generate PrometheusRule YAML automatically in CI:
sloth generate -i sloth-checkout.yaml -o k8s/checkout-slo-rules.yaml
```

---

## **6. Error Budget Policy & Toil Management**

An SLO without a pre-agreed **Error Budget Policy** (signed by Engineering + Product) is just a dashboard nobody looks at:

| Remaining 30d Budget | Policy Trigger |
| --- | --- |
| **> 50% remaining** | Full velocity — ship features, run Chaos GameDays, test upgrades |
| **20% – 50% remaining** | Heightened review — require canary rollouts and extra soak time |
| **0% (Exhausted)** | **Feature freeze** for that service — prioritize reliability fixes, P0 postmortem actions, and rollback safety until budget recovers |

### Toil Definition (Eliminate What Doesn't Scale)
**Toil** is work that is: **Manual**, **Repetitive**, **Automatable**, **Tactical** (interrupt-driven), **Devoid of enduring value**, and **Scales linearly `O(N)`** with service growth.
- **SRE Ceiling:** Keep toil `< 50%` of SRE engineering time (target `< 25%` in 2026); spend the rest on engineering automation and reliability improvements.
