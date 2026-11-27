---
title: Logstash
description: Logstash cheatsheet covering pipelines, inputs, filters, outputs, Grok, conditionals, persistent queues and troubleshooting.
---

# Logstash

Logstash is a server-side data processing pipeline. It ingests data from many sources, transforms it with filters, and ships it to destinations such as Elasticsearch.

```text
input  →  filter  →  output
beats     grok       elasticsearch
kafka     mutate     kafka / s3 / stdout
file      date
http      json
```

## 1. Minimal pipeline

```ruby
input {
  beats { port => 5044 }
}

filter {
  grok {
    match => { "message" => "%{IP:client} %{WORD:method} %{URIPATHPARAM:request} %{NUMBER:status:int} %{NUMBER:bytes:int}" }
  }
  date {
    match => ["timestamp", "dd/MMM/yyyy:HH:mm:ss Z"]
    target => "@timestamp"
  }
  mutate {
    remove_field => ["timestamp", "agent", "ecs"]
    lowercase => ["method"]
  }
}

output {
  elasticsearch {
    hosts => ["https://es01:9200"]
    index => "web-%{+YYYY.MM.dd}"
    user => "logstash_writer"
    password => "${ES_PASSWORD}"
  }
}
```

Use `${VAR}` references with the Logstash keystore so secrets stay out of config files.

## 2. Common inputs

| Input | Use |
|---|---|
| `beats` | Receive from Filebeat, Metricbeat and other Beats |
| `file` | Tail files (`path`, `start_position`, `sincedb_path`) |
| `kafka` | Consume from topics (`bootstrap_servers`, `topics`, `group_id`) |
| `http` | Receive webhooks |
| `jdbc` | Poll a database on a schedule |
| `syslog` / `tcp` / `udp` | Network sources |

## 3. Common filters

| Filter | Use |
|---|---|
| `grok` | Parse unstructured text with patterns |
| `dissect` | Faster delimiter-based parsing |
| `json` | Parse a JSON string field |
| `date` | Set `@timestamp` from a parsed time |
| `mutate` | Rename, remove, convert, split, lowercase |
| `geoip` | Add location data from an IP |
| `useragent` | Parse browser strings |
| `translate` | Look up values from a dictionary |
| `drop` | Discard events |
| `ruby` | Custom logic when nothing else fits |

## 4. Conditionals

```ruby
filter {
  if [level] == "DEBUG" { drop {} }
  if [status] >= 500 {
    mutate { add_tag => ["server_error"] }
  } else if "healthcheck" in [request] {
    drop {}
  }
}
output {
  if "server_error" in [tags] {
    elasticsearch { hosts => ["es01:9200"] index => "errors-%{+YYYY.MM.dd}" }
  } else {
    elasticsearch { hosts => ["es01:9200"] index => "logs-%{+YYYY.MM.dd}" }
  }
}
```

## 5. Multiple pipelines and queues

```yaml
# pipelines.yml
- pipeline.id: web
  path.config: "/etc/logstash/conf.d/web.conf"
  pipeline.workers: 4
- pipeline.id: audit
  path.config: "/etc/logstash/conf.d/audit.conf"
  queue.type: persisted
  queue.max_bytes: 2gb
```

A persistent queue (`queue.type: persisted`) stores events on disk so data survives restarts and absorbs bursts. Use a dead letter queue to keep events that Elasticsearch rejects.

## 6. Operate and test

```bash
bin/logstash -f pipeline.conf --config.test_and_exit     # syntax check
bin/logstash -f pipeline.conf --config.reload.automatic  # reload on change
bin/logstash-keystore create && bin/logstash-keystore add ES_PASSWORD
curl -s localhost:9600/_node/stats/pipelines?pretty      # monitoring API
```

Test grok patterns in the Kibana Grok Debugger before deploying. Use a temporary `stdout { codec => rubydebug }` output while developing.

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| `_grokparsefailure` tag | Pattern does not match; test it in the Grok Debugger |
| Events missing or duplicated | `sincedb_path`, retries, document IDs via `document_id` |
| High CPU | Heavy grok or ruby filters; prefer `dissect` and tune `pipeline.workers` and `batch.size` |
| Backpressure or slow output | Elasticsearch bulk rejections, use persistent queues, scale workers |
| Timestamps wrong | `date` filter format or timezone mismatch |
| Pipeline will not start | Run `--config.test_and_exit` and read the log for the failing plugin |

## 8. Logstash or Beats or ingest pipelines?

- Use **Beats** for lightweight collection on hosts.
- Use **Elasticsearch ingest pipelines** for simple transformations without extra servers.
- Use **Logstash** for complex routing, many inputs and outputs, enrichment and buffering.
