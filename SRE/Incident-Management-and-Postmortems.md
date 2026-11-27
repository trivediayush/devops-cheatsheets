# 🚨 Incident Management, On-Call & Blameless Postmortems Cheatsheet

When production breaks at 2:14 AM, heroics fail — **process saves you**. Modern 2026 SRE teams use structured **Incident Command System (ICS)** roles, tight severity definitions, automated chatops tooling (incident.io / Rootly / PagerDuty), and **blameless postmortems** that turn every outage into systemic resilience.

---

## **1. Severity Matrix (SEV0 – SEV4)**

| Level | User / Business Impact | Response SLA | Comms Cadence | Postmortem Required? |
| --- | --- | --- | --- | --- |
| **SEV0** | Total outage, data loss, or active security breach | Immediate (`< 5m`) | Every 15m (Status page + Execs) | Mandatory + Exec review |
| **SEV1** | Critical user journey broken (login, checkout, API down) | Immediate (`< 10m`) | Every 30m (Status page + Slack) | Mandatory within 48h |
| **SEV2** | Partial degradation, elevated latency/errors, workaround exists | `< 30m` | Every 1h (Internal Slack) | Mandatory within 5d |
| **SEV3** | Minor feature broken, single non-critical customer impacted | Next business day | On state change | Optional / Mini-review |
| **SEV4** | Cosmetic bug or low-priority internal tooling issue | Normal backlog | Jira ticket | No |

> **Golden Rule:** Anyone can **declare** or **upgrade** an incident severity at any time without permission. Only the Incident Commander may downgrade or close it.

---

## **2. Incident Command System (ICS) Roles**

Separate **coordinating** from **debugging** — an engineer deep inside `kubectl logs` cannot also update customers and manage stakeholders.

```text
                    ┌─────────────────────────┐
                    │ Incident Commander (IC) │  Owns decisions, delegates, NEVER hands-on-keyboard
                    └───────┬─────────┬───────┘
                            │         │
         ┌──────────────────┘         └──────────────────┐
         ▼                                               ▼
┌─────────────────────┐                         ┌─────────────────────┐
│ Operations Lead     │                         │ Communications Lead │
│ Runs hands-on       │                         │ Updates status page,│
│ triage, rollback &  │                         │ support, execs on   │
│ mitigation with SMEs│                         │ fixed cadence       │
└─────────────────────┘                         └─────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ Scribe        │  Logs timeline, hypotheses, decisions & action items
                    └───────────────┘
```

### IC First-5-Minutes Checklist
1. **Acknowledge & announce**: `"I am taking Incident Commander for INC-412. Ops Lead is @priya, Comms is @alex."`
2. **Stabilize BEFORE investigating root cause**: Roll back the last deploy, fail over traffic, or flip a feature flag FIRST. Preserve forensic snapshots (heap dump, pod logs, metrics) before deleting failing pods if possible.
3. **Timebox hypotheses**: Run 10-minute check-ins (`"What did we test? What is our next hypothesis? Do we need a DB SME?"`).
4. **Watch fatigue**: Hand off IC/Ops roles every 4 hours during extended outages using a structured **CAN report** (Conditions, Actions, Needs).

---

## **3. Incident Lifecycle & Key SRE Metrics**

```text
Failure Occurs ──► Alert Fires ──► Human Acks ──► Mitigated ──► Root Cause Fixed
      │                 │              │              │
      ├───── MTTD ──────┤              │              │
      │                 ├──── MTTA ────┤              │
      │                 ├──────────── MTTR ───────────┤
      │                                               │
      └────────────────── Total Customer Impact ──────┘
```

| Metric | Meaning | How to Improve |
| --- | --- | --- |
| **MTTD** (Mean Time to Detect) | Failure start → alert fires | Synthetic probes, MWMBR SLO alerts |
| **MTTA** (Mean Time to Acknowledge) | Alert fires → engineer engages | Low alert noise, clear escalation policies |
| **MTTM** (Mean Time to Mitigate) | Alert → customer impact stopped | Feature flags, automated canary rollback, runbooks |
| **MTTR** (Mean Time to Resolve) | Alert → service fully healthy | Practice DR drills, clear observability correlation |
| **MTBF** (Mean Time Between Failures) | Average healthy uptime between incidents | Fix systemic postmortem actions, chaos testing |

---

## **4. First-10-Minutes Production Triage Playbook**

When paged for an API outage or latency spike, check these 5 signals in exact order:

```bash
# 1. WHAT CHANGED RECENTLY? (80% of incidents are caused by a change!)
#    Check recent Argo CD syncs, GitHub deploys, Terraform applies, feature flag flips.
kubectl rollout history deployment/checkout-api -n checkout
kubectl get events -n checkout --sort-by='.lastTimestamp' | tail -n 25

# 2. ARE PODS HEALTHY OR CRASHING / OOMKILLED / PENDING?
kubectl get pods -n checkout -o wide
kubectl describe pod <crashing-pod> -n checkout | grep -A 8 "Last State"

# 3. CHECK RECENT ERROR LOGS & TRACE CORRELATION:
kubectl logs -n checkout -l app=checkout-api --since=15m --tail=100 | grep -iE "error|panic|timeout|refused"

# 4. CHECK SATURATION (CPU throttling, memory pressure, DB pool exhaustion, node pressure):
kubectl top pods -n checkout --sort-by=memory
kubectl top nodes

# 5. IMMEDIATE MITIGATION (ROLLBACK FIRST, DEBUG SECOND):
kubectl rollout undo deployment/checkout-api -n checkout
# Or via Argo Rollouts:
kubectl argo rollouts abort checkout-api -n checkout
```

---

## **5. Blameless Postmortem Template (Production Standard)**

Blaming humans ("Alice ran the wrong command") hides the systemic failure ("Production allowed an unreviewed destructive command without guardrails"). Assume everyone acted with the best intent given the information they had at the time.

```markdown
# Postmortem: INC-412 — Checkout API 503 Outage (2026-09-14)
- **Severity:** SEV1 | **Duration:** 23 minutes (14:02–14:25 UTC)
- **Authors:** @priya, @alex | **Status:** Reviewed

## 1. Executive Summary
Between 14:02 and 14:25 UTC, 42% of checkout requests returned HTTP 503 due to
PostgreSQL connection pool exhaustion triggered by an unindexed migration query.

## 2. Customer & SLO Impact
- Failed requests: 18,420 (consumed 38% of 30-day 99.9% error budget).
- Affected regions: us-east-1 only.

## 3. Root Cause & Contributing Factors
- **Trigger:** Release v2.18.0 introduced a full table scan holding connections > 8s.
- **Contributing Factors:**
  1. Canary analysis only checked 5xx rate, not DB connection pool saturation.
  2. Staging database had 10k rows vs 40M in production, masking query plan regression.
  3. Missing `statement_timeout` on the application DB role.

## 4. Timeline (UTC)
- `14:00` — Release v2.18.0 deployed via Argo CD.
- `14:02` — CheckoutErrorBudgetFastBurn alert fired (MTTD: 2m).
- `14:04` — @priya acknowledged and declared SEV1 (MTTA: 2m).
- `14:11` — Identified `pg_stat_activity` pool saturation; initiated rollback.
- `14:18` — Rollback completed; error rate dropped below 0.1%.
- `14:25` — Backlog drained; incident resolved (MTTR: 23m).

## 5. What Went Well / Where We Got Lucky
- Fast burn-rate alert fired within 2 minutes.
- Read-replica traffic was unaffected.

## 6. Action Items (SMART: Specific, Owned, Priority, Due Date)
| ID | Action | Type | Owner | Due |
| --- | --- | --- | --- | --- |
| AI-1 | Set `statement_timeout = '3s'` on checkout app DB role | Mitigate | @priya | 2026-09-18 |
| AI-2 | Add DB pool saturation metric to Argo Rollouts AnalysisTemplate | Detect | @sam | 2026-09-22 |
| AI-3 | Enforce `EXPLAIN ANALYZE` check in CI against anonymized prod-scale stats | Prevent | @dev | 2026-09-28 |
```

---

## **6. On-Call Health & Alert Hygiene Benchmarks**

| Metric | Healthy Target | Danger Sign |
| --- | --- | --- |
| **Pages per 12h shift** | `<= 2` actionable pages | `> 5` pages/shift (guaranteed burnout) |
| **Actionable Alert Ratio** | `> 90%` require human action | Noisy alerts that auto-resolve before login |
| **Runbook Coverage** | `100%` of paging alerts link to a runbook | Engineers guessing fixes at 3 AM |
| **Rotation Size** | `>= 6–8` engineers (or follow-the-sun) | 2–3 people carrying permanent pager duty |
| **Postmortem Action Completion** | `> 85%` P0/P1 actions closed within 30d | Repeat incidents from ignored action items |
