---
title: PagerDuty
description: PagerDuty cheatsheet covering services, escalation policies, on-call schedules, integrations, event API, incident response and best practices.
---

# PagerDuty

PagerDuty is an incident response platform. It receives alerts from monitoring tools, decides who is on call, notifies them and tracks the incident to resolution.

## 1. Core objects

| Object | Meaning |
|---|---|
| Service | A component that can have incidents; receives events through an integration |
| Integration | The connection and routing key from a monitoring tool |
| Escalation policy | Who is notified, in what order and after how long |
| Schedule | Rotation that defines who is on call |
| Incident | A triggered issue with a lifecycle and timeline |
| Event orchestration | Rules that route, suppress and enrich events |
| Response play / runbook | Automated actions and links for responders |

## 2. Incident lifecycle

```text
Triggered → Acknowledged → (Escalated) → Resolved → Post-incident review
```

Acknowledge quickly to stop escalation, assign an incident commander for major incidents, and keep updates in the incident timeline.

## 3. Send an event (Events API v2)

```bash
curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H 'Content-Type: application/json' -d '{
    "routing_key": "<integration-key>",
    "event_action": "trigger",
    "dedup_key": "api-high-error-rate",
    "payload": {
      "summary": "API error rate above 5%",
      "source": "prod-api-1",
      "severity": "critical",
      "custom_details": { "runbook": "https://wiki.example.com/runbooks/api-errors" }
    }
  }'

# Resolve with the same dedup_key
curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H 'Content-Type: application/json' \
  -d '{"routing_key":"<integration-key>","event_action":"resolve","dedup_key":"api-high-error-rate"}'
```

`severity` is one of `critical`, `error`, `warning`, `info`. A repeated `dedup_key` updates the same incident instead of creating a new one.

## 4. REST API and CLI examples

```bash
curl -H "Authorization: Token token=$PD_API_KEY" \
     -H "Accept: application/vnd.pagerduty+json;version=2" \
     "https://api.pagerduty.com/incidents?statuses[]=triggered&statuses[]=acknowledged"

curl -H "Authorization: Token token=$PD_API_KEY" \
     -H "Accept: application/vnd.pagerduty+json;version=2" \
     "https://api.pagerduty.com/oncalls?schedule_ids[]=<schedule-id>"
```

## 5. Terraform

```hcl
resource "pagerduty_service" "api" {
  name                    = "Production API"
  escalation_policy       = pagerduty_escalation_policy.primary.id
  alert_creation          = "create_alerts_and_incidents"
  auto_resolve_timeout    = 14400
  acknowledgement_timeout = 600
}
```

## 6. Common integrations

Datadog, Prometheus Alertmanager, Grafana, CloudWatch, Elastic and Kibana, Splunk, Jira, Slack and Microsoft Teams, GitHub and CI/CD tools.

```yaml
# Alertmanager receiver
receivers:
  - name: pagerduty
    pagerduty_configs:
      - routing_key: <integration-key>
        severity: '{{ .CommonLabels.severity }}'
```

## 7. On-call best practices

- Page only on symptoms that need a human now; route the rest to tickets or chat.
- Use at least two escalation levels and keep rotations fair and short.
- Every page links to a runbook and a dashboard.
- Group related alerts and use event orchestration to reduce noise.
- Run blameless post-incident reviews and track MTTA, MTTR and pages per engineer.
- Test the full path regularly with a test incident.

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| No incident created | Routing key, event JSON, service integration status, event orchestration rules |
| Duplicate incidents | Missing or changing `dedup_key` |
| Nobody notified | Contact methods, notification rules, schedule layers and overrides |
| Alerts not auto-resolving | Resolve event with matching `dedup_key`, or auto-resolve timeout |
