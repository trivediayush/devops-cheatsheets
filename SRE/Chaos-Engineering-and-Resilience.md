# 🌪️ Chaos Engineering & Resilience Patterns Cheatsheet

**Chaos Engineering** is the discipline of injecting controlled, real-world faults into distributed systems to uncover hidden weaknesses *before* they trigger a 3 AM SEV1 outage. Rather than hoping your retries, failovers, and circuit breakers work, you prove it continuously.

---

## **1. The 5-Step Scientific Chaos Method**

```text
1. Define Steady State     ──► Quantify normal via SLIs (e.g., 99.95% success, p99 < 200ms)
2. Form a Hypothesis       ──► "Killing 1 AZ of checkout pods keeps error rate < 0.2%"
3. Minimize Blast Radius   ──► Start in staging -> 1 pod -> 1% traffic -> 1 AZ in prod
4. Inject Controlled Fault ──► Abort immediately if abort-condition / SLO breaches!
5. Learn & Harden          ──► Fix uncovered bug (missing timeout, bad PDB, thundering herd)
```

> **Prerequisite Check:** Never run chaos experiments on a system that lacks **monitoring/SLOs**, **clear steady state**, and an **instant kill switch**. Chaos without observability is just breaking production.

---

## **2. Chaos Mesh (CNCF) — Kubernetes Fault Injection CRDs**

### Pod Failure & Kill (`PodChaos`)

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: kill-one-checkout-pod
  namespace: chaos-testing
spec:
  action: pod-kill              # pod-kill | pod-failure | container-kill
  mode: one                     # one | fixed | fixed-percent | all
  selector:
    namespaces: ["checkout"]
    labelSelectors:
      app: checkout-api
  duration: "30s"
```

### Network Latency, Packet Loss & Partition (`NetworkChaos`)

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: payments-upstream-latency
  namespace: chaos-testing
spec:
  action: delay                 # delay | loss | corrupt | duplicate | partition
  mode: fixed-percent
  value: "50"                   # Affect 50% of matching pods
  selector:
    namespaces: ["checkout"]
    labelSelectors: { app: checkout-api }
  direction: to
  target:
    mode: all
    selector:
      namespaces: ["payments"]
      labelSelectors: { app: payments-api }
  delay:
    latency: "450ms"
    jitter: "100ms"
    correlation: "50"
  duration: "5m"
```

### CPU & Memory Saturation (`StressChaos`)

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: StressChaos
metadata:
  name: api-cpu-pressure
  namespace: chaos-testing
spec:
  mode: one
  selector:
    namespaces: ["checkout"]
    labelSelectors: { app: checkout-api }
  stressors:
    cpu:
      workers: 2
      load: 85                  # Tests HPA responsiveness & CPU throttling behavior
  duration: "3m"
```

### HTTP 503 / Abort Fault (`HTTPChaos`)

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: HTTPChaos
metadata:
  name: inject-payment-503
  namespace: chaos-testing
spec:
  mode: all
  selector:
    namespaces: ["payments"]
    labelSelectors: { app: payments-api }
  target: Response
  port: 8080
  path: "/v1/charge*"
  abort: true                   # Or replace.code: 503 to verify client circuit breaker!
  duration: "2m"
```

---

## **3. AWS Fault Injection Service (AWS FIS) — Cloud-Layer Chaos**

Test AZ blackholes, Spot interruptions, and RDS failovers safely with built-in **CloudWatch Stop Conditions**:

```bash
# Start a pre-configured FIS experiment (e.g., AZ Power Interruption or RDS Failover):
aws fis start-experiment --experiment-template-id EXT1234567890abcd

# Watch experiment status & verify stop-condition safety:
aws fis get-experiment --id EXP0987654321dcba \
  --query 'experiment.{state:state,stopConditions:stopConditions}'

# Emergency stop button:
aws fis stop-experiment --id EXP0987654321dcba
```

---

## **4. Core Distributed Systems Resilience Patterns**

Every chaos test validates one or more of these 7 production patterns:

| Pattern | What It Prevents | Concrete Configuration |
| --- | --- | --- |
| **Timeouts (Every Hop!)** | Thread/goroutine exhaustion waiting forever on hung downstreams | Connect timeout `1s`, request timeout `3s`, propagate context deadlines |
| **Exponential Backoff + Full Jitter** | **Thundering herd** retry storms crushing a recovering DB | `sleep = random(0, min(cap, base * 2^attempt))`, cap retries at `<= 3` |
| **Retry Budgets** | Retry amplification across 4 microservices (`3^4 = 81x` load!) | Cap retries to `<= 10–20%` of total active requests (Envoy/Linkerd native) |
| **Circuit Breakers** | Cascading failures from repeatedly calling a dead dependency | Trip Open after 5 consecutive 5xx; Half-Open probe after `30s` |
| **Bulkheads** | One slow tenant or endpoint starving the entire app's thread/DB pool | Separate connection pools, worker queues, or pod pools per tier |
| **Load Shedding & Backpressure** | Total collapse under traffic spike (all requests timing out) | Reject excess load early (`429`/`503`) using concurrency limits (LIFO queue) |
| **Graceful Degradation** | Entire homepage failing because recommendations service is down | Return cached fallback or hide optional widget; keep checkout alive |

### Envoy / Istio Outlier Detection + Circuit Breaker (`DestinationRule`)

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: payments-resilience
  namespace: checkout
spec:
  host: payments-api.payments.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
        connectTimeout: 1s
      http:
        http1MaxPendingRequests: 50
        maxRequestsPerConnection: 10
        maxRetries: 3
    outlierDetection:
      consecutive5xxErrors: 5         # Eject failing pod after 5 consecutive 5xx
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50          # Never eject >50% of fleet (prevents panic cascade)
```

---

## **5. Kubernetes Resilience Essentials (Must-Haves)**

```yaml
# 1. PodDisruptionBudget (protects against voluntary drains/upgrades):
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: checkout-api-pdb
spec:
  minAvailable: "80%"                 # Never set maxUnavailable: 0 (blocks node upgrades!)
  selector:
    matchLabels: { app: checkout-api }
---
# 2. Topology Spread Constraints (survive an entire AZ outage):
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels: { app: checkout-api }
---
# 3. Graceful Shutdown Hook (prevent 502s during pod termination):
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 10"]  # Gives kube-proxy/Envoy time to drain endpoint
terminationGracePeriodSeconds: 45
```

---

## **6. Running a Quarterly GameDay**

1. **Scope (1 week prior):** Pick 1 realistic failure scenario (e.g., *"us-east-1a AZ blackhole"*, *"Redis primary failover"*, or *"Vault seal event"*).
2. **Pre-flight:** Verify alerts, dashboards, rollback commands, and on-call backup are ready. Announce window in `#engineering`.
3. **Execute (60 min):** Run scenario live while the on-call engineer diagnoses using ONLY normal dashboards & runbooks (don't tell them the injected fault beforehand for realistic training!).
4. **Debrief (30 min):** Capture every gap — slow alerts, outdated runbooks, missing PDBs, retry storms — and file prioritized reliability tickets.

---

## **7. Most Common Weaknesses Chaos Uncovers**

- **Missing `preStop` sleep** → `502 Bad Gateway` bursts during every rolling deploy or Spot node eviction.
- **Unbounded retries without jitter** → 10x traffic spike turns a 5-second blip into a 40-minute cascading outage.
- **Single-AZ NAT Gateway or Redis** → App pods span 3 AZs, but traffic routes through 1 AZ's NAT Gateway.
- **Hardcoded DNS cache (JVM / Go / Node)** → Clients keep hitting old RDS primary IP after Aurora failover.
- **Synchronous call to non-critical telemetry/analytics** → Analytics outage takes down checkout.
