# 🏠 Hosting Platforms — Shared, VPS, Cloud & Common Errors

**Where apps actually live.** Shared hosting vs VPS vs cloud vs PaaS, control panels (hPanel/cPanel), deployment flows, and the hosting-specific errors nobody explains.

---

## **1. Hosting Types — What You're Actually Buying**

| Type | You get | Good for | Pain points |
| --- | --- | --- | --- |
| **Shared** (Hostinger, Bluehost, GoDaddy, SiteGround) | a directory on a server shared by hundreds of sites | blogs, small sites, PHP/WordPress | resource caps, no root, no custom services, noisy neighbors |
| **VPS** (Hostinger VPS, DigitalOcean, Hetzner, Linode) | a VM with root on shared hardware | real apps, Docker, anything | you own security/updates/backups |
| **Dedicated** | a whole physical server | heavy/compliance workloads | cost, hardware failures are yours |
| **Cloud VM** (EC2, Azure VM, GCE) | elastic VM + ecosystem | production infra | complexity, cost surprise |
| **PaaS** (Render, Railway, Heroku, Vercel) | deploy code, platform runs it | speed over control | vendor lock-in, limited networking, price at scale |
| **Managed K8s** (EKS/AKS/GKE) | orchestrated containers | scale, microservices | the steepest learning curve |

**Progression most orgs follow:** shared → VPS → cloud VM/PaaS → containers → K8s. Each step trades convenience for control.

---

## **2. Shared Hosting — The Control Panel World**

**Hostinger = hPanel** (proprietary), most others = **cPanel**. Same concepts:

```text
hPanel / cPanel gives you:
   ├── File Manager / FTP / SSH (jailed)      ← your files live in public_html/
   ├── Domains → DNS zone editor              ← A/CNAME/MX records
   ├── Databases → MySQL (phpMyAdmin)         ← create DB + user, import .sql
   ├── SSL → free Let's Encrypt one-click
   ├── PHP settings → version, memory_limit, upload_max
   ├── Cron jobs → scheduled tasks
   └── Metrics → bandwidth, inode, CPU quota
```

**Typical deploy flow on shared hosting:**

```bash
# 1. Point domain: registrar DNS → host nameservers → A record
# 2. Upload code: FTP/File Manager → public_html/ (or git if supported)
# 3. Database: create DB + user in panel → import via phpMyAdmin
# 4. Config: edit .env / wp-config.php with DB creds from step 3
# 5. SSL: enable Let's Encrypt in panel → force HTTPS redirect
```

---

## **3. Shared Hosting Errors — The Limits You Hit**

| Error/symptom | What's really happening | Fix |
| --- | --- | --- |
| **"508 Resource Limit Reached"** | hit CPU/RAM/entry-process quota | reduce load, cache, upgrade plan |
| **White screen / blank page (PHP)** | fatal error, display_errors off | enable error log in panel; check `error_log` file |
| **500 after upload** | broken `.htaccess`, wrong PHP version, bad perms | check error log; set files 644, dirs 755 |
| **"Maximum execution time exceeded"** | script > max_execution_time (often 30s) | raise in panel; or move work to cron |
| **"Allowed memory size exhausted"** | `memory_limit` hit (often 128-256MB) | raise in panel; fix the code leaking |
| **upload fails silently** | `upload_max_filesize`/`post_max_size` limit | raise both (post must be ≥ upload) |
| **"disk quota exceeded" / can't write** | disk or **inode** limit hit | delete files; inode limit counts FILE COUNT |
| **SSL "not secure" after setup** | mixed content — page loads http:// assets | fix asset URLs, force HTTPS redirect |
| **email not sending** | shared hosts block outbound SMTP ports | use SMTP service (SendGrid, SES) |
| **site works on one network, not another** | DNS propagation or ISP cache | TTL governs it; test with `dig @8.8.8.8` |
| **"too many connections" (DB)** | shared MySQL connection limit | close connections, use persistent pooling, upgrade |

**Permission defaults:** files `644`, directories `755`, PHP files `644`. `777` works everywhere and is a security hole — if something needs write, `755`/`644` + correct owner is the real fix.

---

## **4. VPS — The Jump to Root**

```bash
# First 10 minutes on a fresh VPS:
apt update && apt upgrade -y
adduser deploy && usermod -aG sudo deploy
# SSH hardening — /etc/ssh/sshd_config:
#   PermitRootLogin no
#   PasswordAuthentication no        (keys only)
systemctl restart sshd
ufw allow 22,80,443/tcp && ufw enable
apt install fail2ban -y             # brute-force protection

# Then the stack:
# Web:    nginx + reverse proxy to app
# App:    systemd unit (survives reboots)
# TLS:    certbot --nginx -d example.com
# Deploy: git pull + restart, or docker run
```

```ini
# /etc/systemd/system/myapp.service — the VPS way to keep apps alive
[Unit]
Description=My app
After=network.target

[Service]
ExecStart=/usr/bin/node /home/deploy/app/server.js
WorkingDirectory=/home/deploy/app
Restart=always
RestartSec=5
User=deploy
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now myapp
journalctl -u myapp -f              # its logs
```

---

## **5. VPS/Server Errors — The Ops List**

| Symptom | Diagnose | Usual cause |
| --- | --- | --- |
| SSH "Connection refused" | `nc -zv ip 22` | sshd down, UFW blocking, wrong port |
| SSH works, then drops | `journalctl -u ssh` | fail2ban banned you (`fail2ban-client status sshd`) |
| Site down, server up | `systemctl status nginx myapp` | app crashed, `Restart=always` missing |
| Disk full overnight | `du -sh /* \| sort -rh` | logs unrotated, docker images, backups piling |
| Random app kills | `dmesg \| grep -i "killed process"` | OOM — VPS RAM too small, add swap or upgrade |
| Cron job never ran | `grep CRON /var/log/syslog` | wrong cron syntax, env vars missing in cron env |
| Works via IP, not domain | `dig domain.com` | DNS not pointed, or propagating |
| Letsencrypt fails | `certbot renew --dry-run` | port 80 must be reachable for HTTP-01 challenge |
| `sudo: unable to resolve host` | hostname not in /etc/hosts | add `127.0.0.1 <hostname>` — harmless but noisy |

---

## **6. When to Leave Shared Hosting**

```text
Stay on shared when:           Move to VPS/cloud when:
├── static/blog/brochure site  ├── need a background process/daemon
├── low traffic (<10k/mo)      ├── need WebSockets, queues, workers
├── PHP/WordPress fits         ├── need Docker or non-PHP runtimes
├── no backend logic           ├── hitting resource limits weekly
└── budget is the constraint   ├── need SSH/root, custom firewall
                               └── need SSL automation, API-driven DNS
```

**The migration checklist:** export DB (`mysqldump`) → archive `public_html` → set up VPS (nginx + PHP-FPM or your stack) → restore files + DB → test on hosts-file entry (`/etc/hosts` trick) → flip DNS with low TTL first → keep old hosting 1-2 weeks as rollback.

```bash
# Test the new server before DNS cutover — local hosts file:
# /etc/hosts (Linux/Mac) or C:\Windows\System32\drivers\etc\hosts
203.0.113.50  example.com www.example.com
curl -I https://example.com        # now hits the NEW server
```

---

## 📚 **Learning Resources**

* 🔗 [Hostinger Tutorials](https://www.hostinger.com/tutorials/) — hPanel walkthroughs
* 📦 [DigitalOcean Community Tutorials](https://www.digitalocean.com/community/tutorials) — excellent VPS/server guides
* 🛡️ [Let's Encrypt Docs](https://letsencrypt.org/docs/) — free TLS fundamentals
