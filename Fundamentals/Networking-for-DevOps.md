# 🌐 Networking for DevOps — The Production View

**Not the OSI model from class — the networking that actually breaks your deploys at 2 AM.** DNS, TCP, TLS, LB types, NAT, MTU, and the debug commands that find "it works on my machine" problems.

---

## **1. The Layers That Actually Matter**

| Layer | Protocols | What breaks there |
| --- | --- | --- |
| L7 Application | HTTP, gRPC, DNS(query), TLS(payload) | Wrong headers, 502s, cert errors |
| L4 Transport | TCP, UDP | Port refused, timeouts, NAT drops, MTU |
| L3 Network | IP, ICMP | Routing, security groups, ICMP-blocked PMTUD |
| L2 Link | Ethernet, ARP, VLAN | ARP issues, rarely yours (cloud abstracts it) |

**Q: Connection refused vs connection timed out?**
A: **Refused** = reached the host, nothing listening on that port (or firewall sent RST). **Timeout** = packets dropped silently — security group/firewall DROP, wrong route, or host down. Different problems entirely: refused → check the app/`ss -tulpn`; timeout → check network path/firewalls.

---

## **2. DNS — Where Half of All Outages Live**

```bash
dig example.com                    # full resolution answer
dig +short example.com             # just the IPs
dig example.com @8.8.8.8           # ask a specific resolver
dig +trace example.com             # walk the whole chain: root → TLD → authoritative
nslookup example.com               # same thing, Windows-friendly
getent hosts example.com           # what THE SYSTEM resolves (NSSwitch, /etc/hosts)
resolvectl status                  # systemd-resolved config
```

| Record | Purpose | Gotcha |
| --- | --- | --- |
| `A` / `AAAA` | Name → IPv4/IPv6 | Clients may prefer IPv6 and fail if it's broken |
| `CNAME` | Alias → another name | Can't CNAME at zone apex (use ALIAS/ANAME); adds a lookup hop |
| `MX`, `TXT` | Mail, verification/SPF | TXT used for domain verification & ACME DNS-01 |
| `NS`, `SOA` | Delegation, zone authority | SOA negative-cache TTL controls "NXDOMAIN caching" |
| `SRV` | Service → host:port | Used by Consul/K8s DNS for service discovery |

**TTL gotchas:** lowering TTL *after* you need fast failover does nothing — set it low *before* migration day. Resolvers cache NXDOMAINs too. And remember: **stubborn client DNS caches** (JVM!, browsers, nginx resolver) may ignore TTL entirely.

**Split-horizon DNS:** different answers inside vs outside the network (common with private endpoints / PrivateLink) — "works in the VPN, not outside" is usually this.

---

## **3. TCP — Handshakes, Retries & Backlogs**

```text
SYN → SYN-ACK → ACK        # 3-way handshake (1.5 RTT before first byte)
```

* `TIME_WAIT` pileup = client opening tons of short connections → enable keepalive/connection pooling (HTTP/1.1 keep-alive, or HTTP/2 multiplexing).
* Listen backlog overflow (`SYN` queue full under load) → connections hang before `accept()`: bump `net.core.somaxconn`, `net.ipv4.tcp_max_syn_backlog`, and the app's backlog arg.
* `conntrack` table exhaustion on NAT-heavy nodes (K8s nodes!) → dropped packets with "nf_conntrack: table full". Raise `net.netfilter.nf_conntrack_max`.
* **Keepalive vs LB idle timeout:** AWS NLB/ALB (60s/350s) and NAT gateways (350s) silently kill idle TCP. If "connection randomly dies after ~5 min idle" — that's it. Enable TCP keepalive or app-level heartbeats shorter than the timeout.

```bash
ss -tn state time-wait | wc -l      # TIME_WAIT count
ss -ltn                             # listen backlog (Send-Q = queue depth)
netstat -s | grep -i "listen\|reset" # TCP counters
conntrack -C                        # conntrack usage
sysctl net.netfilter.nf_conntrack_max
```

---

## **4. TLS/HTTPS — Handshake & Cert Debugging**

```bash
openssl s_client -connect host:443 -servername host    # full handshake + cert chain
openssl s_client -connect host:443 -servername host -brief
echo | openssl s_client -connect host:443 2>/dev/null | openssl x509 -noout -dates -subject -issuer
curl -vI https://api.example.com     # see TLS + HTTP exchange
curl --resolve api.com:443:1.2.3.4 https://api.com   # bypass DNS (test origin behind LB)
```

**Failure cheat table:** `certificate has expired` → clock skew or expired cert; `unable to verify the first certificate` → missing intermediate chain (most common!); `hostname mismatch` → SNI/SAN mismatch; `ssl handshake failure` → TLS version/cipher mismatch (old client vs TLS1.3-only server).

mTLS note: client cert auth happens *during* the handshake — a `400`/`403` post-handshake means the cert was accepted but rejected by policy.

---

## **5. HTTP — Semantics That Matter**

| Concept | Why it matters |
| --- | --- |
| **HTTP/1.1** | One request per connection at a time; keep-alive reuses conn serially → head-of-line blocking |
| **HTTP/2** | Multiplexed streams over one TCP conn; HPACK header compression — most modern traffic |
| **HTTP/3 (QUIC)** | UDP-based, no TCP HoL blocking, faster handshakes — CDNs/mesh increasingly default |
| **Headers** | `X-Forwarded-For` (real client IP behind LB), `Host` (vhost routing), `Authorization`, `Forwarded` |
| **Status** | 301/308 perm redirect (browsers cache!), 429 rate-limit (`Retry-After`), 502 bad gateway (upstream dead), 503 unavailable (LB/health), 504 upstream timeout |

```bash
curl -sv https://api.com/health 2>&1 | grep -E "HTTP/|< |>"
curl -w "@-" -o /dev/null -s https://api.com <<'EOF'
time_namelookup:  %{time_namelookup}\n
time_connect:     %{time_connect}\n
time_appconnect:  %{time_appconnect}\n      # TLS done
time_starttransfer: %{time_starttransfer}\n # first byte
time_total:       %{time_total}\n
EOF
```
This timing breakdown instantly tells you whether slowness is DNS, TCP, TLS, or server-side.

---

## **6. NAT, VIPs & Load Balancing**

* **SNAT/NAT gateway**: private instances get outbound internet; each NAT IP has ~64k ports → **SNAT port exhaustion** under heavy short-lived outbound connections (metrics: `ErrorPortAllocation`). Fix: more IPs, keepalive, or endpoint consolidation.
* **L4 LB** (TCP/UDP, IP+port): NLB, `kube-proxy` — fast, connection-level, doesn't see HTTP.
* **L7 LB** (HTTP-aware): ALB, NGINX, Ingress — path/host routing, TLS termination, retries. Sees each request; can return 502/503/504 itself.
* **DNAT/Service VIPs**: K8s `ClusterIP` is just iptables/IPVS DNAT rules programmed by kube-proxy — a "virtual" IP that doesn't exist on any interface.

---

## **7. MTU & Fragmentation — The Stealth Bug**

Ethernet MTU = 1500, but tunnels eat headers (VXLAN ≈ −50, IPsec/GRE more, K8s overlays similar). Oversized packet with DF bit + PMTUD ICMP blocked = **connection stalls after handshake, small requests work, large downloads hang**. The signature is unmistakable once you've seen it.

```bash
ping -M do -s 1472 host       # test path MTU (Linux: 1472+28=1500)
tracepath host                # shows discovered MTU per hop
ip link show eth0             # interface MTU
```
Fix: clamp MSS (`iptables -t mangle -A POSTROUTING -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu`) or lower interface MTU on tunnel endpoints.

---

## **8. The Debug Playbook**

```text
1. DNS?        dig +short host            → resolves? right IP?
2. Route?      ping / traceroute host     → reachable?
3. Port?       nc -zv host 443            → refused (app) or timeout (firewall)?
4. TLS?        openssl s_client           → cert/handshake OK?
5. App?        curl -v /timing script     → HTTP status? where's the delay?
6. Inside?     ss -tulpn on the box       → is it even listening? on what IP?
```

> [!TIP]
> `0.0.0.0` vs `127.0.0.1` listen address is the #1 "can't reach it from outside" cause inside containers — app bound to localhost never sees external traffic.

---

## 📚 **Learning Resources**

* 🔗 [Julia Evans' Networking Zines (wizardzines)](https://wizardzines.com/)
* 📦 [Cloudflare Learning Center](https://www.cloudflare.com/learning/)
* 🛠️ [tcpdump cheat sheet](https://danielmiessler.com/p/tcpdump)
