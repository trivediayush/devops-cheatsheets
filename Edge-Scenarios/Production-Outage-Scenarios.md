# 🔥 Production Outage Scenarios — War-Room Playbook & Answers

**High-severity SEV0/SEV1 production failures rarely have obvious error messages.** Each scenario below follows the exact war-room structure asked in Senior/Staff SRE interviews and lived at 2 AM: **Symptom → Architecture Diagram → Diagnostic Commands → Root Cause Answer → Immediate Mitigation → Permanent Fix.**

> Want to troubleshoot live broken Linux, Docker, Kubernetes, and cloud environments hands-on? Practice directly on **[practice.atrivedi.online](https://practice.atrivedi.online/)**.

![First-10-Minutes Production Outage Triage Flowchart](/diagrams/edge-triage-decision-tree.svg)

---

## **Scenario 1: Mysterious Intermittent 5-Second Latency Spikes (p99 = 5.02s, p50 = 18ms)**

![CoreDNS ndots:5 Amplification and nf_conntrack Exhaustion Cascade](/diagrams/coredns-conntrack-cascade.svg)

**Symptom:** Users report random 5-second freezes on API calls. CPU, RAM, and DB metrics all look healthy (`< 35%`). No code was deployed in 3 days.

**Diagnostic Commands:**
```bash
# Check kernel conntrack table drops on worker nodes:
dmesg -T | grep -i conntrack
sysctl net.netfilter.nf_conntrack_count net.netfilter.nf_conntrack_max

# Inspect Pod DNS config & trace actual DNS queries:
kubectl exec -n checkout deploy/checkout-api -- cat /etc/resolv.conf
hubble observe --namespace checkout --protocol dns --verdict DROPPED --last 50
```

**Root Cause Answer:**
Kubernetes defaults every pod's `/etc/resolv.conf` to `options ndots:5`. Calling an external hostname like `api.stripe.com` (2 dots < 5) forces glibc to fire **4 failed cluster search-domain lookups** (both `A` and `AAAA` = **8–10 UDP packets per single lookup!**). Under load, parallel `A` + `AAAA` UDP packets from the same source port hit a Linux kernel `nf_conntrack` DNAT race or fill the `conntrack` table, silently dropping one UDP packet. Linux glibc waits an **exact 5-second timeout** before retrying.

**Immediate Mitigation:** Scale CoreDNS replicas & raise `nf_conntrack_max` on impacted nodes.
**Permanent Fix:**
1. Deploy **NodeLocal DNSCache** (routes DNS over local TCP/link-local bypassing `conntrack`).
2. Lower `ndots` to `2` in Pod `dnsConfig` (or use FQDNs with trailing dots like `api.stripe.com.`).
3. Alert when `node_nf_conntrack_entries / node_nf_conntrack_entries_limit > 0.75`.

---

## **Scenario 2: A 3-Second Downstream Blip Turns Into a 45-Minute Total Outage**

![Microservice Retry Amplification Storm vs Circuit Breaker and Retry Budget](/diagrams/retry-storm-cascade.svg)

**Symptom:** The Payments DB had a 3-second primary failover. Even after Postgres came back online healthy, the entire checkout platform stayed 100% down for 45 minutes until traffic was shut off completely.

**Diagnostic Commands:**
```bash
# Check Envoy / Gateway retry amplification ratio:
kubectl exec -n gateway deploy/envoy -- curl -s localhost:15000/stats | grep upstream_rq_retry

# Inspect active Postgres connections & waiting queries:
psql -c "SELECT state, wait_event_type, count(*) FROM pg_stat_activity GROUP BY 1,2;"
```

**Root Cause Answer:**
**Metastable Failure via Retry Amplification Storm.** Four layers in the request path (Client → API Gateway → Checkout → Payments) each had `retries: 3` with fixed 100ms backoff. A brief 3-second blip multiplied 100 RPS into **`100 × 3⁴ = 8,100 RPS`** synchronized retry waves. Even after the DB recovered, the self-inflicted retry tsunami kept the DB permanently pinned at 100% CPU (**metastable state**).

**Immediate Mitigation:** Enable aggressive load shedding (`429/503`) at the edge gateway for 60 seconds to drain queues and break the feedback loop.
**Permanent Fix:**
- Retry **only at a single layer** (outermost idempotent boundary) with **Exponential Backoff + Full Jitter**.
- Enforce **Retry Budgets** (cap retries to `<= 10%` of total active traffic) and **Circuit Breakers** (Envoy `outlierDetection`).
- Propagate **gRPC/HTTP request deadlines** so services abort work once the caller has already timed out.

---

## **Scenario 3: Cache Stampede (Thundering Herd) Melts Primary Database at Exactly :00**

```text
00:00:00  Popular Redis key ("homepage:catalog", TTL=1h) EXPIRES
             │
             ├──► 4,000 concurrent API pods get CACHE MISS simultaneously
             │
             ▼
          All 4,000 pods fire identical heavy SELECT query at Postgres Primary!
             │
             ▼
          Postgres CPU -> 100% -> Connection pool full -> Checkout & Login die!
```

**Symptom:** Every day at midnight (or immediately after flushing Redis), database CPU spikes to 100% and unrelated endpoints start timing out.

**Root Cause Answer:**
**Cache Stampede / Dogpile Effect.** Thousands of requests miss the same hot key at the exact same millisecond and all query the database simultaneously before the first response repopulates Redis.

**Permanent Fix (3-Layer Defense):**
1. **Singleflight / Distributed Mutex Lock:** Only 1 request rebuilds the key while peers wait briefly or receive slightly stale data.
2. **Stale-While-Revalidate + Probabilistic Early Expiration (PER / XFetch):** Refresh hot keys asynchronously *before* hard TTL expires.
3. **TTL Jitter:** Randomize cache TTLs (`base_ttl + random(0, 15%)`) so keys never expire in synchronized waves.

---

## **Scenario 4: Outbound API Calls Randomly Fail with `EADDRNOTAVAIL` / Timeouts During Traffic Peak**

```text
120 EKS Pods (Private Subnets) ──► Single AWS NAT Gateway (1 Elastic IP)
                                       │
                                       ▼
                        Max 55,000 simultaneous connections
                        per destination IP:port (SNAT limit!)
                                       │
                                       ▼
                        ErrorPortAllocation metric > 0 -> Packets DROPPED!
```

**Symptom:** During a marketing spike, pods calling S3, Stripe, or an external SaaS API fail intermittently with connection timeouts while internal cluster traffic is 100% healthy.

**Diagnostic Commands:**
```bash
# Check AWS CloudWatch NAT Gateway ErrorPortAllocation metric:
aws cloudwatch get-metric-statistics \
  --namespace AWS/NATGateway --metric-name ErrorPortAllocation \
  --dimensions Name=NatGatewayId,Value=nat-0abc12345 \
  --start-time "$(date -u -d '30 minutes ago' +%FT%TZ)" --end-time "$(date -u +%FT%TZ)" \
  --period 60 --statistics Sum
```

**Root Cause Answer:**
**NAT Gateway SNAT Port Exhaustion.** Each Elastic IP on an AWS NAT Gateway supports ~55,000 concurrent connections to any single destination IP/port. Short-lived non-keepalive HTTP clients opening thousands of new TCP sockets per second exhaust SNAT ports (`TIME_WAIT` accumulation) and trigger silent packet drops.

**Permanent Fix:**
- Enable **HTTP Keep-Alive connection pooling** in application HTTP clients (eliminates 95% of new TCP handshakes).
- Add **VPC Gateway/Interface Endpoints** for AWS APIs (S3, DynamoDB, ECR, STS, SQS) so AWS traffic never touches the NAT Gateway (also saves huge NAT data-processing costs!).
- Attach **multiple Elastic IPs** (up to 8 per NAT Gateway) and deploy **1 NAT Gateway per AZ**.

---

## **Scenario 5: Database Connection Pool Exhaustion After Scaling Pods 10 → 60**

```text
60 API Pods × 20 local pool connections = 1,200 Postgres backends!
Postgres max_connections = 500 -> "FATAL: sorry, too many clients already"
```

**Symptom:** HPA/KEDA scaled your microservice cleanly during a spike, yet error rate jumped to 80% immediately after scaling out!

**Root Cause Answer:**
Each pod opens its own DB connection pool (`pool_size = 20`). Scaling horizontally from 10 to 60 pods multiplied open connections to 1,200, exceeding PostgreSQL `max_connections` and exhausting DB RAM (~10MB per backend process + context-switch thrashing).

**Immediate Mitigation:** Temporarily cap HPA `maxReplicas` or lower app `DB_POOL_MAX`.
**Permanent Fix:**
- Put **PgBouncer** (in `transaction` pooling mode) or **AWS RDS Proxy** in front of PostgreSQL so 2,000 app connections multiplex cleanly onto ~80 real DB connections.
- Enforce `statement_timeout = '3s'` and `idle_in_transaction_session_timeout = '10s'` on app DB roles so slow queries cannot hold pool slots hostage.

---

## **Scenario 6: Sudden Global TLS Outage — "Certificate Has Expired" Even Though Leaf Cert Is Valid**

**Symptom:** Browsers show green lock on your website, yet mobile apps, Go/Python microservices, and partner webhooks all start failing TLS handshakes simultaneously.

**Diagnostic Commands:**
```bash
# Inspect the FULL certificate chain served by the endpoint:
openssl s_client -connect api.acme.io:443 -servername api.acme.io -showcerts </dev/null 2>/dev/null \
  | awk '/BEGIN CERT/,/END CERT/{ if(/BEGIN CERT/){a++}; out="cert"a".pem"; print >out }'
for f in cert*.pem; do echo "=== $f ==="; openssl x509 -in "$f" -noout -subject -issuer -dates; done
```

**Root Cause Answer:**
1. Either the **intermediate CA certificate** in the bundled `fullchain.pem` expired (or was omitted), so strict non-browser TLS clients cannot build a trust chain (browsers hide this via AIA chasing / cached intermediates), **OR**
2. A **cross-signed root** expired on older container base images (`ca-certificates` package never updated in a 3-year-old Docker image!).

**Permanent Fix:**
- Always serve the complete `fullchain.pem` (leaf + intermediate) managed automatically by **cert-manager**.
- Monitor **every cert in the chain** (`probe_ssl_earliest_cert_expiry` in Prometheus Blackbox Exporter — alert `< 21 days`).
- Rebuild base images weekly with fresh `ca-certificates` (distroless / Chainguard / Alpine).

---

## **Scenario 7: Kafka Consumer Group Stuck in Infinite Rebalance Storm (`0` Messages/sec Processed)**

```text
Consumer polls 500 messages -> Processing takes 6m (exceeds max.poll.interval.ms = 5m!)
   │
   ▼
Broker assumes Consumer is DEAD -> Evicts consumer -> Triggers Group Rebalance
   │
   ▼
All 20 consumers stop processing -> Re-assign partitions -> Same slow batch crashes next consumer!
```

**Symptom:** Kafka consumer lag shoots up vertically. Pods are `Running` with `0` restarts, yet zero messages are committed and logs spam `Revoking previously assigned partitions`.

**Root Cause Answer:**
**Infinite Rebalance Storm.** Processing a heavy batch took longer than `max.poll.interval.ms` (default 5 min), causing the broker to kick the consumer out of the group, pausing the entire consumer group while reassigning partitions, and redelivering the exact same poison/slow batch forever.

**Permanent Fix:**
1. Lower `max.poll.records` (e.g., from `500` → `50`) so every poll batch finishes well under `max.poll.interval.ms`.
2. Switch partition assignor to **`CooperativeStickyAssignor`** (incremental cooperative rebalancing — stops stop-the-world pauses!).
3. Enable **Static Group Membership** (`group.instance.id`) so short pod restarts don't trigger unnecessary rebalances.
4. Route unparseable "poison pill" messages to a **Dead Letter Topic (DLT)** after 3 attempts.

---

## **Scenario 8: Traffic Fails Silently Over WireGuard / VPN Tunnel ONLY for Large Payloads**

```text
Healthcheck GET /healthz (64 bytes)      ──► 200 OK   (fits in 1420B tunnel MTU)
POST /api/upload (4 KB JSON payload)     ──► HANGS!   (1500B packet + 80B WireGuard header = 1580B!)
                                                      Firewall blocks ICMP "Fragmentation Needed" -> Blackhole!
```

**Symptom:** Small health checks and pings succeed (`100%`), yet TLS handshakes with large certs or `POST` requests `> 1.4 KB` hang forever and time out.

**Diagnostic Command:**
```bash
# Binary-search exact working Path MTU with Don't Fragment (-M do) bit set:
ping -M do -s 1472 -c 3 <target-ip>   # Fails if tunnel overhead exists
ping -M do -s 1392 -c 3 <target-ip>   # Succeeds -> MTU is ~1420!
```

**Root Cause Answer:**
**Path MTU Discovery (PMTUD) Blackhole.** Encapsulation (WireGuard, VXLAN, IPsec, AWS Transit Gateway) adds 50–80 bytes to each packet. When a router needs to drop an oversized packet with DF=1, an overly strict Security Group/NACL drops the `ICMP Type 3 Code 4 (Fragmentation Needed)` reply, so TCP never shrinks its segment size.

**Permanent Fix:**
- Allow **ICMP Type 3 Code 4** across internal VPCs/firewalls.
- Configure **TCP MSS Clamping** (`iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu`) and lower CNI/WireGuard interface MTU (`1420`).

---

## **📚 Practice & Related Playbooks**

- 🧪 [Hands-On Production Troubleshooting Labs — practice.atrivedi.online](https://practice.atrivedi.online/)
- ☸️ [Kubernetes Production Edge Cases](./Kubernetes-Edge-Cases.md)
- ☁️ [Cloud, IaC & Security Edge Cases](./Cloud-and-Security-Edge-Cases.md)
- 🚨 [Incident Management & Blameless Postmortems](../SRE/Incident-Management-and-Postmortems.md)
