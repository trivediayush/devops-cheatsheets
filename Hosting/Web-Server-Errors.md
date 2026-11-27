# 🚨 Web Server Errors — Diagnosis Playbook

**When "the site is down" lands on your desk.** HTTP error decoding, the layer-by-layer diagnosis method, SSL/DNS failures, and Apache/Caddy quick references.

---

## **1. The Diagnosis Method — Outside In**

```text
Is it down for everyone or just you?
   │
   ▼
1. DNS resolves?        dig +short site.com        (NXDOMAIN? wrong IP?)
2. Port reachable?      nc -zv site.com 443        (refused vs timeout!)
3. TLS handshake?       curl -vI https://site.com  (cert error? handshake fail?)
4. HTTP response?       curl -I https://site.com   (which status code?)
5. Right content?       curl https://site.com      (200 but wrong page = app)
   │
   ▼ each layer failing → different owner:
   DNS → registrar/DNS admin    TCP → firewall/LB    TLS → certs
   HTTP 4xx → client/routing    HTTP 5xx → app/upstream
```

---

## **2. HTTP Status Codes — Cause → Fix**

| Code | Means | Most common cause → fix |
| --- | --- | --- |
| **301/302** | Redirect | Redirect loop? `curl -IL` follows and shows the cycle (http↔https loop, www↔apex loop) |
| **400** | Bad Request | Malformed request — oversized headers, invalid characters in URL |
| **401** | Unauthenticated | Missing/expired token, wrong `Authorization` header, SSO session dead |
| **403** | Forbidden | Authenticated but denied — WAF rule, IP block, file perms, missing index |
| **404** | Not Found | Wrong path/routing rule — check `try_files`, rewrite rules, app routes |
| **405** | Method Not Allowed | POST to a GET-only endpoint, or static server rejecting methods |
| **408/499** | Timeout/closed | Client gave up — slow upstream, or client-side timeout too short |
| **413** | Entity Too Large | Upload > `client_max_body_size` (nginx) / `LimitRequestBody` (apache) |
| **429** | Rate Limited | Legit throttling — check rate-limit config vs traffic |
| **500** | Internal Error | App exception — read app logs, not web server logs |
| **502** | Bad Gateway | Upstream dead/refusing — the #1 "site down" error |
| **503** | Unavailable | Intentional (maintenance/LB health check failing) or overload |
| **504** | Gateway Timeout | Upstream alive but slow — timeout, not crash |

---

## **3. The 502/503/504 Decision Tree**

```text
5xx from the proxy?
   │
   ├── 502 Bad Gateway ──► upstream refused/dropped the connection
   │      ├── backend process down?      systemctl status app
   │      ├── listening on wrong port?   ss -tlnp | grep <port>
   │      ├── crashed/OOM-killed?        dmesg | grep -i kill
   │      └── socket/SELinux/firewall?   ausearch -m avc; firewall rules
   │
   ├── 503 Unavailable ──► declared unhealthy or maintenance
   │      ├── LB health check failing?   check /healthz directly
   │      ├── all backends down?         upstream marked all-unhealthy
   │      └── maintenance flag set?      check config/maintenance files
   │
   └── 504 Timeout ──► upstream took too long
          ├── slow query/deploy?          app slow, raise timeout OR fix it
          ├── upstream keepalive dead?    stale pooled connections
          └── proxy_read_timeout too low? default 60s
```

---

## **4. SSL/TLS Errors**

```bash
# Read the cert the server actually serves:
echo | openssl s_client -connect site.com:443 -servername site.com 2>/dev/null | openssl x509 -noout -dates -issuer -subject
```

| Error | Cause → fix |
| --- | --- |
| `certificate has expired` | renew it — `certbot renew`, check auto-renewal cron/systemd timer |
| `name mismatch` | cert for `www.` requested for apex (or vice versa) — get SAN cert |
| `untrusted authority` | missing intermediate/chain — use `fullchain.pem`, not `cert.pem` |
| `SSL routines:...wrong version` | HTTPS request to an HTTP port — the server block has no `ssl` |
| `handshake failure` | TLS version/cipher mismatch — old client vs modern-only config |

```bash
certbot certificates                # all certs + expiry dates
certbot renew --dry-run             # test renewal before it bites
openssl s_client -connect site.com:443 -servername site.com < /dev/null
```

---

## **5. DNS Failures**

```bash
dig site.com                        # what it resolves to
dig site.com @8.8.8.8               # is it local-DNS or authoritative?
dig site.com NS                     # who serves the zone
dig +trace site.com                 # the full delegation chain
```

| Symptom | Cause |
| --- | --- |
| `NXDOMAIN` | record doesn't exist (typo, deleted, or never created) |
| resolves to old IP | TTL not expired — `dig` shows remaining TTL, wait or flush |
| works on 8.8.8.8, not local | local resolver/corp DNS caching or blocking |
| just changed, works for some | propagation — DNS is cached everywhere; TTL governs it |
| `SERVFAIL` | authoritative server broken or DNSSEC validation failing |

---

## **6. Apache & Caddy — Quick Survival**

```bash
# Apache
apachectl configtest                # = nginx -t
systemctl reload apache2            # or httpd on RHEL
tail -f /var/log/apache2/error_log  # or /var/log/httpd/error_log
apachectl -S                        # show parsed vhosts

# .htaccess — per-dir overrides, read on EVERY request (slow);
# 500 errors after deploy? a broken .htaccess is suspect #1

# Caddy
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
caddy fmt --overwrite Caddyfile     # auto-format
# auto-HTTPS via Let's Encrypt is built in — cert errors are rare
```

---

## **7. "Site Is Slow" — Quick Triage**

```bash
# Server-side:
top; free -h; df -h; iostat -x 1 3           # resource check
ss -s                                        # connection summary
tail -f access.log | awk '{print $9}' | sort | uniq -c | sort -rn | head   # status mix
grep -c "POST" access.log                    # is traffic legit or an attack?

# Client-facing:
curl -o /dev/null -s -w "dns:%{time_namelookup} connect:%{time_connect} tls:%{time_appconnect} ttfb:%{time_starttransfer} total:%{time_total}\n" https://site.com
```

---

## 📚 **Learning Resources**

* 🔗 [HTTP Status Codes — MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
* 📦 [Nginx Error Log Docs](https://nginx.org/en/docs/ngx_core_module.html#error_log)
* 🛡️ [SSL Labs Server Test](https://www.ssllabs.com/ssltest/) — grade your TLS config
