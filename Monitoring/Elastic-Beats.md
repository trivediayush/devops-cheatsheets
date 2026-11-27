# 📦 Elastic Beats Cheatsheet

**Beats** — lightweight single-purpose data shippers that send data from hosts to Elasticsearch or Logstash. The edge layer of the Elastic stack: one job per Beat, tiny footprint, no JVM.

```text
┌────────────── DATA SOURCES ──────────────┐
│ filebeat   logs                          │
│ metricbeat system/service metrics        │      ┌──────────┐   ┌───────┐
│ heartbeat  uptime/ICMP/HTTP checks       │ ───► │ Logstash │──►│Elastic│──► Kibana
│ auditbeat  auditd/security events        │      │ (optional│   │search │
│ packetbeat network traffic metadata      │      │ enrich/  │   └───────┘
│ winlogbeat Windows event logs            │      │ filter)  │
│ functionbeat serverless shipper          │      └──────────┘
└──────────────────────────────────────────┘
   Elastic Agent (Fleet) = one agent replacing all Beats — modern default
```

---

## **1. Filebeat — Log Shipping**

```yaml
# filebeat.yml — the config shape
filebeat.inputs:
  - type: filestream
    id: app-logs
    paths: [/var/log/app/*.log]
    parsers:
      - multiline:
          type: pattern
          pattern: '^\d{4}-\d{2}-\d{2}'   # new entry starts with a date
          negate: true
          match: after                    # stack traces join the entry above
      - ndjson:
          target: ""                       # parse JSON logs into fields

  - type: container                        # Docker logs
    paths: [/var/lib/docker/containers/*/*.log]

processors:
  - add_host_metadata: ~                   # host, IP, OS
  - add_docker_metadata: ~
  - drop_fields:
      fields: ["agent.ephemeral_id"]       # trim noise

output.elasticsearch:
  hosts: ["https://es.local:9200"]
  username: "${ES_USER}"
  password: "${ES_PASS}"

# Or ship to Logstash instead (when you need grok/enrichment):
# output.logstash:
#   hosts: ["logstash.local:5044"]
```

```bash
filebeat modules list                    # prebuilt module catalog (nginx, mysql, system...)
filebeat modules enable nginx system     # enable module → auto dashboards
filebeat setup -e                        # load ILM, templates, dashboards
filebeat test output                     # test the connection
filebeat -e -d "*"                       # debug run — see what it ships
systemctl enable --now filebeat
```

**Registry file** (`/var/lib/filebeat/registry`) tracks harvest offsets — Filebeat resumes where it stopped, and it's how "restarted and nothing duplicated" works.

---

## **2. Metricbeat — Host & Service Metrics**

```yaml
metricbeat.modules:
  - module: system
    period: 10s
    metricsets: [cpu, memory, diskio, network, load, filesystem, process]
    processes: ['.*']

  - module: docker
    hosts: ["unix:///var/run/docker.sock"]
    period: 10s

  - module: kubernetes                   # on K8s nodes
    metricsets: [node, pod, container]
    hosts: ["https://kubelet:10250"]

  - module: nginx
    metricsets: [stubstatus]
    hosts: ["http://localhost/status"]   # needs stub_status on;
```

```bash
metricbeat modules enable system docker
metricbeat test modules system cpu       # preview output locally
```

---

## **3. Other Beats — One Job Each**

| Beat | Ships | Quick config |
| --- | --- | --- |
| **heartbeat** | uptime — ICMP/TCP/HTTP monitors | `monitors: - type: http, urls: [https://api/health], schedule: '@every 30s'` |
| **auditbeat** | Linux auditd events, file integrity | `auditbeat.modules: [{module: auditd, audit_rule_files: [...]}]` |
| **packetbeat** | L7 network flows (HTTP, DNS, MySQL protos) | sniffs interfaces — `packetbeat.interfaces.device: any` |
| **winlogbeat** | Windows Event Log channels | `event_logs: [{name: Application}, {name: System}]` |
| **functionbeat** | serverless (AWS Lambda-triggered) shipper | cloudwatch/kinesis inputs |

```yaml
# heartbeat.yml — uptime monitoring in 5 lines
heartbeat.monitors:
  - type: http
    id: api
    urls: ["https://api.example.com/health"]
    schedule: '@every 30s'
    check.response.status: [200]
```

---

## **4. Modules — The Shortcut Everyone Uses**

Beats ship **modules** = prebuilt input+parse+dashboard bundles. `system`, `nginx`, `apache`, `mysql`, `postgresql`, `redis`, `kafka`, `mongodb`, `elasticsearch`, `kibana`, `docker`, `kubernetes`, `aws`, `azure`, `gcp`, `osquery`...

```bash
filebeat modules list
filebeat modules enable nginx mysql system
# module configs live in modules.d/*.yml — edit paths/creds there
filebeat setup --dashboards   # only the Kibana dashboards
```

**Module vs manual input:** modules win for standard services (grok patterns, dashboards, ECS field mapping done for you). Manual inputs for your own app's logs.

---

## **5. Elastic Agent & Fleet — The Modern Path**

```bash
# One agent, centrally managed from Kibana Fleet UI:
elastic-agent install --url=https://fleet.local:8220 \
  --enrollment-token=<token>
# policies defined in Kibana → pushed to agents → no per-host filebeat.yml
```

**Beats vs Elastic Agent:** Beats = per-binary, per-host config files. Elastic Agent = single binary, Fleet-managed integrations, required for Endpoint Security (EDR). New deployments default to Agent; Beats remain for lightweight/custom cases.

---

## **6. Gotchas**

* **Filebeat + logrotate** — rotated files tracked by inode; `close_inactive` frees handles on rotated-away logs. `ignore_older` prevents re-ingesting history on fresh installs.
* **Multiline mismatch** — Java/Go stack traces split into garbage docs → the `multiline` parser above is mandatory.
* **Direct-to-ES vs Logstash** — Beats do light processors only. Grok/mutate/enrich = send to Logstash (or use ingest pipelines on ES).
* **`setup` needs admin** — `filebeat setup` writes templates/ILM; run once with full creds, then ship with a restricted writer role.
* **Beats are forwarders, not buffers** — output down = backpressure (memqueue/limited spool). For guaranteed delivery put Kafka/Logstash in front of ES.

---

## 📚 **Learning Resources**

* 🔗 [Beats Overview](https://www.elastic.co/beats/)
* 📦 [Filebeat Reference](https://www.elastic.co/guide/en/beats/filebeat/current/filebeat-overview.html)
* 🛠️ [Fleet & Elastic Agent](https://www.elastic.co/guide/en/fleet/current/fleet-overview.html)
