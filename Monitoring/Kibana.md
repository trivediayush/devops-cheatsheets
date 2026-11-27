---
title: Kibana
description: Kibana cheatsheet covering data views, Discover, KQL, Lens dashboards, alerting, Dev Tools and deployment.
---

# Kibana

Kibana is the web interface for Elasticsearch. It is used to explore data, build dashboards, configure alerts, manage the cluster and view Observability and Security data.

## 1. Key areas

| Area | Use it for |
|---|---|
| Discover | Search and inspect raw documents |
| Dashboards / Lens | Build visualisations with drag and drop |
| Dev Tools | Run Elasticsearch REST calls from the browser |
| Alerts and rules | Notify on thresholds, log patterns and anomalies |
| Stack Management | Data views, index templates, ILM, roles, users, API keys |
| Observability / Security | Logs, metrics, APM, uptime and SIEM |

## 2. Data views

A data view maps a pattern such as `app-logs-*` to Discover and Lens. Pick `@timestamp` as the time field. Create one in **Stack Management → Data Views**.

## 3. KQL (Kibana Query Language)

```text
level: error
level: error and service: api
not level: debug
message: "connection refused"
status >= 500 and status < 600
service: (api or worker)
user.name: adm*
@timestamp >= "2026-01-01" and @timestamp < "2026-01-02"
```

Use field filters (the pills under the search bar) for exact, reusable conditions, and KQL for ad hoc searches.

## 4. Dev Tools console

```text
GET _cluster/health
GET app-logs/_search
{
  "query": { "term": { "level": "error" } },
  "size": 5
}
```

## 5. Dashboards with Lens

1. Create a dashboard and choose **Create visualization**.
2. Select a data view, then drag fields to the canvas.
3. Common charts: line over time, bar by `service`, metric for error count, table for top URLs.
4. Add dashboard controls and filters, then save and set the time range.
5. Share through a link, a PDF/PNG report or an embedded iframe where permitted.

## 6. Alerting

Create rules in **Stack Management → Rules**. Examples: more than 50 errors in 5 minutes, no logs from a service for 10 minutes, or an anomaly in request latency. Connect actions to Slack, email, PagerDuty or a webhook, and use recovery actions to close incidents.

## 7. Run Kibana

```yaml
# kibana.yml
server.host: "0.0.0.0"
server.publicBaseUrl: "https://kibana.example.com"
elasticsearch.hosts: ["https://es01:9200"]
elasticsearch.serviceAccountToken: "<token>"
elasticsearch.ssl.certificateAuthorities: ["/etc/kibana/certs/ca.crt"]
xpack.security.encryptionKey: "<32+ char random string>"
xpack.encryptedSavedObjects.encryptionKey: "<32+ char random string>"
```

```bash
docker run -d --name kibana -p 5601:5601 \
  -e ELASTICSEARCH_HOSTS=http://es01:9200 \
  docker.elastic.co/kibana/kibana:8.15.0
curl -s localhost:5601/api/status
```

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| "Kibana server is not ready yet" | Elasticsearch reachable, version match, service token valid |
| No data in Discover | Time range, data view pattern, `@timestamp` mapping |
| Slow dashboards | Narrow the time range, reduce panels, use `keyword` fields, use rollups or downsampling |
| Logged out or reports fail | Set `server.publicBaseUrl` and fixed encryption keys |
| Cannot see an index | Role privileges on the index and Kibana space |
