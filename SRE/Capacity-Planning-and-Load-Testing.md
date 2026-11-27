# 📈 Capacity Planning & Load Testing (k6 & SRE Performance) Cheatsheet

**Capacity Planning** ensures your infrastructure survives a 10x product launch or Black Friday spike without melting down *and* without wasting 60% of your cloud bill on idle headroom. Combine **queueing math** (Little's Law, Saturation, Tail Latency) with automated **k6** load testing in CI and staging.

---

## **1. Types of Performance & Load Tests**

| Test Type | Load Profile | What It Proves |
| --- | --- | --- |
| **Smoke Test** | 1–5 VUs for 1–2 min | Script works, zero errors under minimal load (runs on every PR) |
| **Load Test** | Ramp to expected peak RPS, hold 15–30 min | Meets latency/error SLOs under normal + peak business traffic |
| **Stress Test** | Ramp past peak (`1.5x → 3x → 5x`) until failure | Finds exact **breaking point** and verifies graceful degradation / load shedding |
| **Spike Test** | Instant jump (`100 → 5,000 RPS` in 10s) | Tests autoscaling speed (Karpenter/KEDA/HPA), cold starts, connection pools |
| **Soak (Endurance) Test** | 70–80% peak load for 4–24 hours | Catches **memory leaks**, FD/socket leaks, GC degradation, log disk fill |

---

## **2. Grafana k6 — Production Load Testing (2026 Standard)**

**k6** (Go engine + JavaScript/TypeScript scripts) generates high concurrency with tiny CPU/RAM footprint, exports metrics natively to Prometheus/OTel, and enforces pass/fail **Thresholds** in CI.

### Production `checkout-load.js` (Open Model — Avoids Coordinated Omission!)

> **Critical Concept — Coordinated Omission:** In a *closed model* (`vus` loop), if your server slows down, virtual users wait before sending the next request — artificially hiding tail latency! Always use **`ramping-arrival-rate`** (open model) for realistic web/API load tests so requests keep arriving at fixed RPS even when the server slows down.

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const checkoutDuration = new Trend('checkout_duration', true);
const checkoutErrors = new Rate('checkout_errors');

export const options = {
  scenarios: {
    peak_checkout_traffic: {
      executor: 'ramping-arrival-rate',
      startRate: 50,            // 50 requests/sec
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 1000,
      stages: [
        { target: 200, duration: '2m' },   // Warm up caches & autoscaler
        { target: 500, duration: '5m' },   // Ramp to peak
        { target: 500, duration: '10m' },  // Sustain peak
        { target: 0,   duration: '1m' },   // Cool down
      ],
    },
  },
  // CI gate: k6 exits non-zero if ANY SLO threshold is violated!
  thresholds: {
    http_req_failed: ['rate<0.005'],       // < 0.5% error rate
    http_req_duration: ['p(95)<200', 'p(99)<450'],
    checkout_errors: ['rate<0.005'],
  },
};

export default function () {
  const payload = JSON.stringify({
    cartId: `cart-${__VU}-${__ITER}`,
    currency: 'USD',
    amountCents: 4999,
  });

  const res = http.post(`${__ENV.BASE_URL}/api/v1/checkout`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${__ENV.API_TOKEN}`,
    },
    tags: { endpoint: 'checkout_create' },
  });

  checkoutDuration.add(res.timings.duration);
  checkoutErrors.add(res.status >= 500);

  check(res, {
    'status is 200/201': (r) => r.status === 200 || r.status === 201,
    'has order id': (r) => r.json('orderId') !== undefined,
  });
}
```

### Running k6 Locally, in CI, and Distributed on Kubernetes (`k6-operator`)

```bash
# Run locally with live Prometheus Remote Write streaming to Grafana:
K6_PROMETHEUS_RW_SERVER_URL=http://prometheus.internal:9090/api/v1/write \
k6 run -o experimental-prometheus-rw \
  -e BASE_URL=https://staging.acme.internal \
  -e API_TOKEN=$STAGING_TOKEN \
  checkout-load.js

# Export summary JSON for CI PR comment diffing:
k6 run --summary-export=k6-summary.json checkout-load.js
```

```yaml
# Distributed load generation across 10 K8s pods with k6-operator:
apiVersion: k6.io/v1alpha1
kind: TestRun
metadata:
  name: checkout-peak-test
  namespace: load-testing
spec:
  parallelism: 10                 # 10 parallel k6 runners splitting the load
  script:
    configMap:
      name: checkout-load-script
      file: checkout-load.js
  arguments: "-o experimental-prometheus-rw --tag testid=peak-2026-09"
```

---

## **3. Essential Capacity & Queueing Math for SREs**

### Little's Law
```text
L = λ × W
  L = Average concurrency (in-flight requests / connections needed)
  λ = Arrival rate (requests per second)
  W = Average service time (seconds)

Example: 2,000 RPS with 150ms (0.15s) latency -> L = 2,000 × 0.15 = 300 concurrent connections!
If your Postgres pgbouncer pool only allows 100 connections, you WILL queue and time out!
```

### Tail Latency Amplification (Why p99 Matters in Microservices)
If a single frontend page makes **20 parallel backend fan-out calls**, and each call has a `99%` chance of being fast (`p99 = 100ms`):
- Probability ALL 20 calls finish under 100ms = `0.99²⁰ = 81.8%`
- Meaning **18.2% of your users** experience the `p99+` tail latency!

### The Saturation "Knee of the Curve" (M/M/1 Queueing)
```text
Latency
  ▲                                   │
  │                                  ╱   <- >80% utilization: latency shoots to infinity!
  │                                ╱
  │                             ╱
  │                       ── ╱  <- "Knee" (~70% CPU / DB pool)
  │───────────────────────
  └──────────────────────────────────────► Utilization (%)
  0%             50%     70%  80%   100%
```
- **Target Steady-State Utilization:** Size services for `50–65%` utilization at peak so you retain **N+1 / AZ-loss headroom** (losing 1 of 3 AZs instantly shifts `50%` load → `75%` load on the remaining 2 AZs!).

---

## **4. Autoscaling Headroom & Pod Sizing Formula**

```text
Required Replicas = ceil( (Peak_RPS / Sustainable_RPS_per_Pod) × AZ_Failure_Factor × Safety_Buffer )

Example:
  Peak_RPS = 3,000
  Sustainable_RPS_per_Pod (at 60% CPU, p99 < 150ms) = 250 RPS
  AZ_Failure_Factor (3 AZs -> survive losing 1 AZ) = 3 / 2 = 1.5
  Safety_Buffer (burst before HPA/Karpenter reacts) = 1.2

  Min Replicas (Peak) = ceil((3000 / 250) × 1.5 × 1.2) = ceil(21.6) = 22 pods
```

### Always Verify Both Compute AND Hidden Bottlenecks!
When scaling pods from 10 → 100 during a load test, what actually breaks first?
1. **Database connections** (`max_connections` exhausted → add PgBouncer / RDS Proxy).
2. **NAT Gateway SNAT ports** (55,000 ports per IP → add secondary IP / NAT per AZ / VPC Endpoints).
3. **CoreDNS / conntrack table** (`nf_conntrack: table full` → tune `ndots:2`, NodeLocal DNSCache).
4. **Upstream rate limits** (Stripe, Twilio, Auth0, AWS STS throttling).
5. **EBS volume IOPS / burst credits** (`gp2` credit exhaustion → migrate to `gp3` with explicit IOPS/throughput).

---

## **5. Capacity Planning Cadence (Production Checklist)**

- **Weekly:** Review saturation dashboards (CPU, RAM, DB connections, disk growth, Kafka consumer lag, IP exhaustion in VPC subnets).
- **Monthly:** Run automated peak-scale k6 test in staging; compare p95/p99 latency and cost-per-million-requests against last month's baseline.
- **Before Major Events (Launches / Black Friday):** Run a `2x` projected peak load test 3 weeks early, verify cloud account quotas (EC2 vCPU, EIPs, ALB targets, EKS IPs), and pre-warm ALBs/autoscalers.
