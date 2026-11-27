# 🚦 Deployment Strategies Cheatsheet

**How you roll out a new version** — every strategy from "just replace it" to shadow traffic. Which to use, the trade-offs, and how to implement each on Kubernetes.

---

## **1. The Landscape**

| Strategy | Downtime | Rollback | Infra cost | Traffic control | Use when |
| --- | --- | --- | --- | --- | --- |
| **Recreate** | full | slow | 1× | none | dev, stateful, resource-poor |
| **Rolling** | none | moderate | 1× | none | default stateless apps |
| **Blue-Green** | none | instant | **2×** | all-at-once cutover | instant-rollback, DB-compatible versions |
| **Canary** | none | instant | ~1.1× | gradual % | risky changes, need real-traffic signal |
| **A/B testing** | none | instant | ~1.1× | per-user/header | product experiments |
| **Shadow/Dark** | none | n/a (no live impact) | **2×** | mirrored, not served | perf-test with real traffic, zero user risk |
| **Feature flags** | none | toggle | 1× | per-user toggle | decouple deploy from release |

---

## **2. Recreate — The Simplest**

```text
v1 running → kill ALL v1 → start ALL v2 → done
downtime = v2 startup time
```

```yaml
# K8s:
spec:
  strategy: { type: Recreate }
```

Use only for dev/single-pod/stateful-where-two-can't-run (some DBs, license-locked apps).

---

## **3. Rolling — The Default**

```text
v1: [p1][p2][p3]  →  update: one at a time (or by surge)
[p1-v2][p2][p3] → [p1][p2-v2][p3] → ... → all v2
```

```yaml
# K8s Deployment — the default strategy:
spec:
  strategy:
    rollingUpdate:
      maxSurge: 1            # extra pods above desired during rollout
      maxUnavailable: 0      # 0 = never drop below capacity (zero-downtime)
  minReadySeconds: 10        # pod must be healthy this long before counting
  progressDeadlineSeconds: 300  # stuck this long → rollout marked failed
```

**The gotchas:**
- `maxUnavailable: 0` + `maxSurge: 1` = true zero-downtime (adds before removes)
- Readiness probe REQUIRED or it rolls broken pods to "ready"
- Rollback = `kubectl rollout undo` — but a bad rollout *during* rollout keeps going unless you `rollout pause`
- DB schema must be **backward compatible** (v1 and v2 run simultaneously — expand/migrate/contract pattern)

---

## **4. Blue-Green — Two Identical Environments**

```text
Blue (v1, live) ──┐
                  ├──► load balancer / service ──► users
Green (v2, idle) ─┘
   deploy v2 to Green → test → flip LB → Green=live, Blue=standby
   rollback = flip back (instant — v1 still running)
```

```yaml
# K8s blue-green with two deployments + a service label flip:
# blue:  app=v1  |  green: app=v2  |  svc selects app=live-tag
kubectl patch svc api -p '{"spec":{"selector":{"version":"v2"}}}'   # the flip
```

**Pros:** instant rollback, test v2 on prod infra before cutover.
**Cons:** **2× infra cost** during deploy; DB migrations must be compatible; long-lived connections drop on flip (use draining).
**The pattern:** keep blue as warm standby for a while (rollback window), then scale to 0.

---

## **5. Canary — Gradual Percentage**

```text
v1 (stable): 90% traffic ┐
v2 (canary): 10% traffic ┘ → watch metrics → 25% → 50% → 100%
     ↑ if error rate/latency spikes → route 0% to canary, done
```

**The three layers of canary:**
1. **Manual** — two Deployments, scale the canary small, watch dashboards
2. **Argo Rollouts** — the CRD: `steps: [{setWeight: 10},{pause: {duration: 5m}},{setWeight: 50},{pause:{duration:10m}}]` + `analysis` (auto-promote/rollback on metrics)
3. **Flagger + service mesh** — progressive delivery via Istio/Linkerd/App Mesh with Prometheus-based automated analysis

```yaml
# Argo Rollouts — the production canary shape:
spec:
  strategy:
    canary:
      steps:
        - setWeight: 10
        - pause: { duration: 5m }
        - analysis:
            templates: [{ templateName: success-rate }]
            args: [{ name: service-name, value: api }]
        - setWeight: 50
        - pause: { duration: 10m }
      analysis:
        templates:
          - templateName: error-rate    # PromQL: 5xx rate < 1% or rollback
```

**What you measure:** error rate, p99 latency, saturation, business KPIs — against a stable baseline. Analysis templates (Prometheus/Datadog/CloudWatch) decide promote vs abort **automatically**.

---

## **6. A/B Testing — Split by Who, Not How Much**

```text
Canary = split by traffic %.  A/B = split by identity/attribute.
  users with cookie X / in region Y / on plan Z → version B
  everyone else → version A
```

**Implementation:** header/cookie routing at the mesh/gateway layer:

```yaml
# Istio — route beta users to v2:
- match:
  - headers: { x-user-group: { exact: beta } }
  route: [{ destination: { host: api, subset: v2 } }]
- route: [{ destination: { host: api, subset: v1 } }]
```

A/B ≠ canary: canary is for *technical* validation (does it break?), A/B is for *product* validation (do users prefer it?). Usually: canary first, then A/B.

---

## **7. Shadow / Dark Launch — Zero User Risk**

```text
real traffic ──► v1 (serves user, only v1 responds)
       └─copy──► v2 (gets the same requests, responses DISCARDED)
```

v2 sees production load, production shape — but nothing it does affects users. Perfect for: perf validation, new dependency testing, "will it handle real traffic" before you commit. Mirroring via Istio `mirror:` or Envoy, or a tap at the LB. **2× cost** + beware side-effects (v2 must not write to shared DBs — mirror to a replica or stub writes).

---

## **8. Feature Flags — Deploy ≠ Release**

```text
deploy v2 with new code OFF by default (flagged)
→ toggle the flag per-user/per-percentage → no redeploy to "release"
→ kill-switch = flip the flag back, no rollback needed
```

```python
# the shape:
if feature_flags.is_on("new-checkout", user):
    return new_checkout()
return old_checkout()
```

Tools: LaunchDarkly, Flagsmith, Unleash, Split, OpenFeature (standard). **The discipline:** flags are tech debt — expire them, or the codebase becomes flag-spaghetti. Best for: kill-switches, gradual rollouts, A/B, per-tenant features.

---

## **9. The Combos You Actually Ship**

```text
Startup:         Rolling (default, it's fine)
Prod, regulated: Rolling + smoke tests + readiness probes
High-risk:       Blue-green (fast flip) OR Argo Rollouts canary + auto-analysis
Scale/API:       Canary via mesh (Flagger) + metrics-driven auto-rollback
Product:         Feature flags over everything, canary under it
DB changes:      expand-migrate-contract + backward-compatible rolling
```

**The non-negotiable layer (regardless of strategy):** readiness probes, PodDisruptionBudgets (only 1 pod down at a time during rollout/upgrade), `terminationGracePeriod` + `preStop` (drain connections), and a tested rollback path.

---

## **10. DB Migrations — The Hidden Half**

Every strategy breaks on an incompatible schema change:

```text
expand-migrate-contract (backward-compatible):
1. ADD column (nullable)      → v1 and v2 both work
2. deploy v2 (writes both / reads new)
3. backfill
4. drop old column            → separate release, v2 only
```

Never do a breaking schema change and an app deploy in one step — that forces downtime no matter the strategy.

---

## 📚 **Learning Resources**

* 🔗 [K8s Deployment Strategies — official](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy)
* 📦 [Argo Rollouts](https://argoproj.github.io/rollouts/)
* 🛠️ [Flagger (progressive delivery)](https://flagger.app/)
* 📚 [Feature Flags Best Practices (OpenFeature)](https://openfeature.dev/)
