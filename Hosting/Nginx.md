# 🌐 Nginx Cheatsheet — Config, Reverse Proxy & Errors

**Nginx** — the web server, reverse proxy, and load balancer in front of most of the internet. Event-driven, single-thread-per-worker, handles 10k+ connections where thread-per-connection servers die.

---

## **1. How Nginx Works**

```text
master process (root) — reads config, binds ports, manages workers
   ├── worker process 1 ──┐
   ├── worker process 2 ──┤ each worker: single thread, epoll event loop,
   ├── worker process N ──┘ handles thousands of connections (non-blocking)
   │
   worker_processes = CPU cores (auto)

Request flow:
client → :80/:443 → worker accepts → matches server_name → location block
       → serves file / proxies upstream → response (worker never blocks on IO)
```

---

## **2. Config Anatomy — The Blocks That Matter**

```nginx
# /etc/nginx/nginx.conf — top level
user www-data;
worker_processes auto;
worker_connections 1024;        # max = workers × connections

http {
    include /etc/nginx/mime.types;
    sendfile on;                 # zero-copy file serving
    keepalive_timeout 65;
    gzip on;

    include /etc/nginx/conf.d/*.conf;      # or sites-enabled/*
}

# A server block = one vhost
server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;     # reverse proxy
        proxy_set_header Host $host;          # pass the real Host
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        root /var/www/app;                     # serves /var/www/app/static/...
        expires 30d;                           # cache headers
    }
}
```

**`root` vs `alias`** — the classic footgun: `location /static/ { root /var/www/app; }` → file at `/var/www/app/static/x.css` (path appended). `alias /var/www/app/;` → `/var/www/app/x.css` (prefix replaced).

---

## **3. Load Balancing & Upstreams**

```nginx
upstream backend {
    least_conn;                       # round_robin (default) | least_conn | ip_hash
    server 10.0.1.11:3000 weight=3;
    server 10.0.1.12:3000;
    server 10.0.1.13:3000 backup;      # only when others fail
    keepalive 32;                      # pool of connections to upstream
}

server {
    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";      # required for upstream keepalive
        proxy_next_upstream error timeout http_502 http_503;
    }
}
```

---

## **4. The Error Table — What Each One Actually Means**

| Error | Root cause | Fix |
| --- | --- | --- |
| **502 Bad Gateway** | Upstream down, crashed, or wrong `proxy_pass` port/socket | Is the backend running? `curl localhost:3000`. Socket perm? SELinux? |
| **504 Gateway Timeout** | Upstream alive but too slow | Raise `proxy_read_timeout 60s;` — or fix the slow backend |
| **499 Client Closed** | Client disconnected before response (not a server error) | Usually bots/timeouts; check `proxy_ignore_client_abort` |
| **403 Forbidden** | No index file, wrong `autoindex`, file perms, or `deny` rule | `chmod 755` on path, check `try_files`, SELinux context |
| **404 Not Found** | `root`/`alias` path wrong, or location didn't match | `tail -f error.log` shows the resolved path — compare |
| **413 Request Entity Too Large** | Upload bigger than `client_max_body_size` | `client_max_body_size 50m;` |
| **429** | Rate limit zone hit | `limit_req_zone` config — expected behavior |
| **500** | Usually upstream app error, or config include failure | Check upstream app logs, `nginx -t` |
| **connection refused (upstream)** | backend not listening on that port | `ss -tlnp \| grep <port>` on the backend |
| **"too many open files"** | worker hit FD limit | `worker_rlimit_nofile 65535;` + OS `ulimit -n` |
| **"worker_connections are not enough"** | more clients than capacity | Raise `worker_connections`, check for connection leaks (keepalive holding) |
| **emerg: bind() failed (98: in use)** | another process owns :80 | `ss -tlnp \| grep :80` — stop the squatter |

---

## **5. Commands You Type Daily**

```bash
nginx -t                          # TEST config — never reload without this
systemctl reload nginx            # zero-downtime config reload (new workers spawned)
systemctl restart nginx           # full restart — brief connection drop
nginx -T                          # dump the FULL effective config (all includes)
nginx -s reload / reopen / quit   # signal shortcuts

# Logs — the first place you look:
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
journalctl -u nginx -f

# Debugging:
nginx -V                          # compile flags + modules
ss -tlnp | grep nginx             # what it actually bound to
strace -p $(pgrep -f 'nginx: worker' | head -1)   # syscall trace a worker
```

---

## **6. Config Mistakes That Bite in Production**

```nginx
# ❌ proxy_pass trailing slash changes the URI mapping:
location /api/ { proxy_pass http://backend/; }      # /api/users → /users
location /api/ { proxy_pass http://backend; }       # /api/users → /api/users

# ❌ if inside location — "if is evil" in nginx:
if ($request_uri ~* "old") { ... }   # use map or rewrite instead

# ❌ serving files as www-data but owned by root 600:
chmod 755 /var/www/app            # every dir in the path needs +x

# ✅ production defaults to add:
client_max_body_size 10m;
proxy_connect_timeout 5s;
proxy_read_timeout 60s;
add_header X-Frame-Options DENY always;
server_tokens off;                # don't leak nginx version
```

```bash
# The SELinux trap on RHEL/CentOS — nginx can't reach upstream:
setsebool -P httpd_can_network_connect 1
ausearch -m avc -ts recent        # see the denials
```

---

## 📚 **Learning Resources**

* 🔗 [Nginx Beginner's Guide](https://nginx.org/en/docs/beginners_guide.html)
* 📦 [Nginx Config Docs](https://nginx.org/en/docs/)
* 🛡️ [Mozilla SSL Config Generator](https://ssl-config.mozilla.org/) — sane TLS defaults for nginx
