---
title: Elasticsearch
description: Elasticsearch cheatsheet covering architecture, indices, mappings, queries, aggregations, ILM, cluster health and troubleshooting.
---

# Elasticsearch

Elasticsearch is a distributed search and analytics engine built on Apache Lucene. Data is stored as JSON documents in indices split into shards, and is queried through a REST API.

## 1. Core concepts

| Term | Meaning |
|---|---|
| Node | One running Elasticsearch instance |
| Cluster | A group of nodes sharing one cluster name |
| Index | A collection of documents with a shared mapping |
| Shard | A Lucene index; primary shards hold data, replicas are copies |
| Mapping | Field names and types, similar to a schema |
| Data stream | Append-only time-series index abstraction with automatic rollover |

Node roles: `master`, `data_hot`, `data_warm`, `data_cold`, `ingest`, `coordinating` (no role), `ml`.

## 2. Cluster health and inspection

```bash
curl -s localhost:9200/_cluster/health?pretty
curl -s localhost:9200/_cat/nodes?v
curl -s localhost:9200/_cat/indices?v&s=store.size:desc
curl -s localhost:9200/_cat/shards?v
curl -s localhost:9200/_cat/allocation?v
curl -s "localhost:9200/_cluster/allocation/explain?pretty"
```

| Status | Meaning |
|---|---|
| green | All primary and replica shards are assigned |
| yellow | All primaries assigned, some replicas missing |
| red | At least one primary shard is unassigned, so data is unavailable |

## 3. Index and document CRUD

```bash
# Create index with settings and mapping
curl -X PUT localhost:9200/app-logs -H 'Content-Type: application/json' -d '{
  "settings": { "number_of_shards": 1, "number_of_replicas": 1 },
  "mappings": { "properties": {
    "@timestamp": { "type": "date" },
    "level":      { "type": "keyword" },
    "message":    { "type": "text" },
    "service":    { "type": "keyword" }
  } }
}'

curl -X POST localhost:9200/app-logs/_doc -H 'Content-Type: application/json' \
  -d '{"@timestamp":"2026-01-01T10:00:00Z","level":"error","message":"db timeout","service":"api"}'
curl localhost:9200/app-logs/_doc/<id>
curl -X DELETE localhost:9200/app-logs
```

`text` fields are analysed for full-text search; `keyword` fields are exact and used for filters, sorting and aggregations.

## 4. Search queries

```bash
curl -s localhost:9200/app-logs/_search -H 'Content-Type: application/json' -d '{
  "query": {
    "bool": {
      "must":   [ { "match": { "message": "timeout" } } ],
      "filter": [ { "term": { "level": "error" } },
                  { "range": { "@timestamp": { "gte": "now-1h" } } } ]
    }
  },
  "sort": [ { "@timestamp": "desc" } ],
  "size": 20
}'
```

Use `filter` for yes/no conditions because it is cached and does not score. Use `must` when relevance matters.

## 5. Aggregations

```bash
curl -s localhost:9200/app-logs/_search -H 'Content-Type: application/json' -d '{
  "size": 0,
  "aggs": {
    "by_service": { "terms": { "field": "service" },
      "aggs": { "errors": { "filter": { "term": { "level": "error" } } } } },
    "per_minute": { "date_histogram": { "field": "@timestamp", "fixed_interval": "1m" } }
  }
}'
```

## 6. Index lifecycle management (ILM)

```bash
curl -X PUT localhost:9200/_ilm/policy/logs-policy -H 'Content-Type: application/json' -d '{
  "policy": { "phases": {
    "hot":    { "actions": { "rollover": { "max_primary_shard_size": "50gb", "max_age": "7d" } } },
    "warm":   { "min_age": "7d",  "actions": { "forcemerge": { "max_num_segments": 1 } } },
    "delete": { "min_age": "30d", "actions": { "delete": {} } }
  } }
}'
```

## 7. Snapshots and backup

```bash
curl -X PUT localhost:9200/_snapshot/s3_repo -H 'Content-Type: application/json' \
  -d '{"type":"s3","settings":{"bucket":"es-backups"}}'
curl -X PUT "localhost:9200/_snapshot/s3_repo/snap-1?wait_for_completion=true"
curl -X POST localhost:9200/_snapshot/s3_repo/snap-1/_restore
```

## 8. Sizing and tuning rules of thumb

- Keep shards between 10 GB and 50 GB and under about 20 shards per GB of heap.
- Set the JVM heap to half of RAM and no more than about 31 GB.
- Disable swap and set `vm.max_map_count=262144`.
- Use at least three master-eligible nodes in production.
- Prefer data streams and ILM over daily indices for logs.
- Avoid wildcard-prefix queries and deep pagination; use `search_after`.

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| Red or yellow cluster | `_cluster/allocation/explain`, disk watermarks, node count |
| Disk watermark hit, indices read-only | Free space, then clear the block with `index.blocks.read_only_allow_delete: null` |
| Slow searches | `_nodes/hot_threads`, shard count, field types, expensive queries |
| Heap pressure or circuit breaker errors | Too many shards, large aggregations, fielddata on `text` fields |
| Unassigned shards | Allocation explain, node attributes, replica count above node count |
| Mapping conflicts | Use an explicit mapping or index template instead of dynamic mapping |
