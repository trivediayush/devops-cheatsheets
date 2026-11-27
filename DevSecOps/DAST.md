# 🎯 DAST (Dynamic Application Security Testing) Cheatsheet

**DAST** tests a **running application from the outside** — like an attacker would — by sending crafted HTTP requests and analyzing responses. It finds real exploitable issues (XSS, SQLi, auth flaws, misconfigurations) that SAST can't see, with almost no language dependency.

---

## **1. SAST vs DAST vs SCA — At a Glance**

| | SAST | DAST | SCA |
| --- | --- | --- | --- |
| **Analyzes** | Source code (not running) | Running app over HTTP | Third-party dependencies |
| **Finds** | Code-level vulns, injection sinks | Exploitable runtime vulns, config issues | Known CVEs, license risk |
| **Needs** | Source access | Deployed URL | Manifests / lockfiles |
| **False positives** | Higher | Low (proven exploit) | Low |
| **Pipeline stage** | PR / build | Staging / post-deploy test | Build |

---

## **2. Tool Landscape**

| Tool | Type | Best for |
| --- | --- | --- |
| **OWASP ZAP** | OSS | Baseline + full scans, API scanning, automation |
| **Nuclei** | OSS | Fast template-based CVE/misconfig scanning |
| **Nikto** | OSS | Web server misconfigs, outdated software |
| **Burp Suite** | Commercial (free Community) | Manual + assisted testing |
| **StackHawk / Probely** | Commercial | CI-native DAST platforms |

---

## **3. OWASP ZAP — Quick Scans (Docker)**

```bash
# Baseline scan — passive, safe for any environment
docker run --rm -t zaproxy/zap-stable zap-baseline.py \
  -t https://staging.example.com -r baseline-report.html

# Full scan — active attacks, NEVER run against production
docker run --rm -t zaproxy/zap-stable zap-full-scan.py \
  -t https://staging.example.com -r full-report.html

# API scan — point at an OpenAPI spec
docker run --rm -t zaproxy/zap-stable zap-api-scan.py \
  -t https://staging.example.com/openapi.json -f openapi -r api-report.html

# Fail the pipeline on findings
docker run --rm -t zaproxy/zap-stable zap-baseline.py \
  -t https://staging.example.com -I    # -I = don't fail on INFO; exits non-zero on WARN+
```

---

## **4. Nuclei — Fast Template Scanning**

```bash
# Install
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
# or
docker run --rm projectdiscovery/nuclei:latest -u https://staging.example.com

# Scan with all templates
nuclei -u https://staging.example.com

# Target specific categories / severities
nuclei -u https://staging.example.com -t cves/ -severity critical,high
nuclei -u https://staging.example.com -t exposures/ -t misconfiguration/

# Multiple targets from a file
nuclei -l urls.txt -o nuclei-results.txt
```

---

## **5. Nikto — Server Misconfiguration Sweep**

```bash
docker run --rm sullo/nikto -h https://staging.example.com
# Useful flags: -ssl -Tuning x (all tests) -output report.html
```

---

## **6. Authenticated Scanning**

Most real bugs hide behind login. Give the scanner a session:

```bash
# ZAP: pass auth header / use a context file
zap-full-scan.py -t https://staging.example.com \
  -z "-config replacer.full_list(0).description=auth
       -config replacer.full_list(0).enabled=true
       -config replacer.full_list(0).matchtype=REQ_HEADER
       -config replacer.full_list(0).matchstr=Authorization
       -config replacer.full_list(0).regex=false
       -config replacer.full_list(0).replacement=Bearer $TOKEN"
```

> [!WARNING]
> **Never run active DAST against production.** Scanners submit forms, create data, and can trigger destructive endpoints. Always target a staging environment with seed data.

---

## **7. CI Integration Pattern**

```yaml
dast:
  needs: deploy-to-staging
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: ZAP Baseline Scan
      uses: zaproxy/action-baseline@v0.12.0
      with:
        target: 'https://staging.example.com'
        rules_file_name: '.zap/rules.tsv'    # per-rule FAIL/WARN/IGNORE tuning
        cmd_options: '-a'
```

`.zap/rules.tsv` — tune which alerts fail the build:

```tsv
10011	IGNORE	(Cookie Without Secure Flag - covered by infra)
40018	FAIL	(SQL Injection)
```

---

## **8. Making DAST Effective**

* **Seed realistic test data** — scanners can't find IDOR on objects that don't exist.
* **Provide auth** — unauthenticated scans cover <20% of the attack surface.
* **Scan APIs too** — feed your OpenAPI/Swagger spec to ZAP for structured coverage.
* **Schedule deep scans** — full active scans take hours; run baseline on every deploy, full scans nightly.
* **Triage into the backlog** — DAST findings are real exploits; assign severity SLAs.

---

## 📚 **Learning Resources**

* 🔗 [OWASP ZAP Documentation](https://www.zaproxy.org/docs/)
* 📦 [Nuclei Templates](https://github.com/projectdiscovery/nuclei-templates)
* 🛡️ [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
