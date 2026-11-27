---
title: Datadog
description: Datadog cheatsheet covering the agent, integrations, metrics, logs, APM, monitors, dashboards, tagging and Kubernetes deployment.
---

# Datadog

Datadog is a SaaS observability platform that combines infrastructure metrics, logs, APM traces, synthetics, security and incident tooling around a single agent and tagging model.

## 1. Agent basics

```bash
# Install on Linux
DD_API_KEY=<key> DD_SITE="datadoghq.com" bash -c "$(curl -L https://install.datadoghq.com/scripts/install_script_agent7.sh)"

sudo datadog-agent status
sudo datadog-agent health
sudo datadog-agent configcheck
sudo datadog-agent check <integration>
sudo datadog-agent flare
sudo systemctl restart datadog-agent
```

Main config: `/etc/datadog-agent/datadog.yaml`. Integration configs: `/etc/datadog-agent/conf.d/<name>.d/conf.yaml`.

## 2. datadog.yaml essentials

```yaml
api_key: ${DD_API_KEY}
site: datadoghq.com
tags:
  - env:prod
  - team:platform
logs_enabled: true
apm_config:
  enabled: true
process_config:
  process_collection:
    enabled: true
```

## 3. Unified service tagging

| Tag | Purpose |
|---|---|
| `env` | Environment such as prod or staging |
| `service` | Logical service name |
| `version` | Release version, for deployment tracking |

Set them as `DD_ENV`, `DD_SERVICE` and `DD_VERSION` so metrics, logs and traces correlate. Avoid high-cardinality tags such as user IDs or request IDs on metrics.

## 4. Logs

```yaml
# /etc/datadog-agent/conf.d/myapp.d/conf.yaml
logs:
  - type: file
    path: /var/log/myapp/*.log
    service: myapp
    source: python
    log_processing_rules:
      - type: exclude_at_match
        name: drop_health
        pattern: GET /health
```

Use pipelines and processors (grok parser, date remapper, status remapper) to structure logs, and exclusion filters to control cost.

## 5. APM

```bash
pip install ddtrace && ddtrace-run python app.py
export DD_AGENT_HOST=localhost DD_TRACE_ENABLED=true
```

Libraries exist for Python, Java, Go, Node.js, .NET and Ruby. Add `DD_LOGS_INJECTION=true` to connect logs to traces.

## 6. Monitors

| Type | Example |
|---|---|
| Metric | `avg(last_5m):avg:system.cpu.user{env:prod} by {host} > 85` |
| Log | More than 100 error logs in 5 minutes |
| APM | p95 latency or error rate above threshold |
| Synthetic | Failed HTTP or browser test |
| Composite | Combine several monitors to reduce noise |
| Anomaly / Forecast | Detect deviation from normal or projected disk fill |

Route alerts with `@slack-channel`, `@pagerduty-service` or `@email`, and use downtimes for maintenance.

## 7. Kubernetes with Helm

```bash
helm repo add datadog https://helm.datadoghq.com
helm upgrade --install datadog datadog/datadog -n datadog --create-namespace \
  --set datadog.apiKeyExistingSecret=datadog-secret \
  --set datadog.site=datadoghq.com \
  --set datadog.logs.enabled=true \
  --set datadog.logs.containerCollectAll=true \
  --set datadog.apm.portEnabled=true \
  --set clusterAgent.enabled=true
```

The Agent runs as a DaemonSet, and the Cluster Agent handles cluster-level checks, metadata and autoscaling on custom metrics.

## 8. Cost and hygiene

- Watch custom metric counts and tag cardinality.
- Filter noisy logs before indexing, and archive the rest to object storage.
- Use sampling for traces and retention filters for important ones.
- Manage dashboards and monitors as code with Terraform (`datadog_monitor`, `datadog_dashboard`).

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| Host missing | `datadog-agent status`, API key, site, outbound HTTPS |
| No logs | `logs_enabled`, file permissions for `dd-agent`, `status` logs section |
| No traces | `DD_AGENT_HOST`, port 8126, tracer version, sampling |
| Wrong tags | Check `DD_TAGS`, `env/service/version` and Kubernetes labels mapping |
| Integration failing | `datadog-agent check <name>` and the log in `/var/log/datadog` |
