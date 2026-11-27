# ⚡ OWASP ZAP Cheatsheet


**OWASP ZAP** (Zed Attack Proxy) is the world's most widely used free web application security scanner — an intercepting proxy, spider, and active/passive scanner maintained by the OWASP community. It's the standard open-source **DAST** engine for CI/CD pipelines.

---

## **1. Installation**

```bash
# Docker (recommended for CI — no GUI needed)
docker pull zaproxy/zap-stable          # full release
docker pull zaproxy/zap-weekly          # latest features

# Desktop app (manual testing / proxying)
# Windows: installer from zaproxy.org | macOS: brew install --cask owasp-zap
```

---

## **2. Scan Modes — Pick the Right One**

| Script | What it does | Safe for prod? |
| --- | --- | --- |
| `zap-baseline.py` | Spider + **passive** scan only (no attacks) | ✅ Yes |
| `zap-full-scan.py` | Spider + passive + **active attacks** | ❌ Staging only |
| `zap-api-scan.py` | Imports API definition (OpenAPI/SOAP/GraphQL) + scans | ❌ Staging only |
| `zap.sh -cmd -quickurl` | One-off quick scan | ⚠️ Active |

```bash
docker run --rm -v $(pwd):/zap/wrk:rw -t zaproxy/zap-stable zap-baseline.py \
  -t https://staging.example.com \
  -r baseline-report.html -J baseline-report.json
```

**Useful flags**: `-r` HTML report, `-J` JSON report, `-x` XML, `-I` ignore INFO alerts, `-W` ignore WARN, `-l` show rules hit, `-z` extra ZAP config.

---

## **3. Automation Framework (`zap.yaml`)**

The Automation Framework is ZAP's declarative way to drive scans — the recommended approach for pipelines:

```yaml
env:
  contexts:
    - name: staging
      urls:
        - https://staging.example.com
      includePaths:
        - https://staging.example.com.*
parameters:
  failOnError: true
jobs:
  - type: spider
    parameters:
      context: staging
      maxDuration: 5
  - type: passiveScan-wait
    parameters:
      maxDuration: 10
  - type: activeScan
    parameters:
      context: staging
      policy: Default
      maxScanDurationInMins: 30
  - type: report
    parameters:
      template: traditional-html
      reportFile: zap-report.html
```

```bash
docker run --rm -v $(pwd):/zap/wrk:rw -t zaproxy/zap-stable \
  zap.sh -cmd -autorun /zap/wrk/zap.yaml
```

---

## **4. Authenticated Scans**

Add authentication to the context in `zap.yaml`:

```yaml
env:
  contexts:
    - name: staging
      urls: [https://staging.example.com]
      authentication:
        method: header
        parameters:
          header: "Authorization"
          value: "Bearer ${AUTH_TOKEN}"
      users:
        - name: scanner
          credentials: {}
```

Or inject headers at scan time with the `replacer` (works on all scripts):

```bash
zap-baseline.py -t https://staging.example.com \
  -z "-config replacer.full_list(0).description=auth \
      -config replacer.full_list(0).enabled=true \
      -config replacer.full_list(0).matchtype=REQ_HEADER \
      -config replacer.full_list(0).matchstr=Authorization \
      -config replacer.full_list(0).regex=false \
      -config replacer.full_list(0).replacement=Bearer ${TOKEN}"
```

---

## **5. API Scanning**

```bash
# OpenAPI / Swagger
docker run --rm -t zaproxy/zap-stable zap-api-scan.py \
  -t https://staging.example.com/openapi.json -f openapi -r api-report.html

# GraphQL — import the schema via automation framework job:
#   - type: graphql
#     parameters:
#       endpoint: https://staging.example.com/graphql
```

---

## **6. Tuning Alerts (`rules.tsv`)**

Control which rules fail/warn/ignore in CI — pass with `-c rules.tsv`:

```tsv
# AlertID	THRESHOLD	(NOTE)
10011	IGNORE	(Cookie no-secure — handled at LB)
40018	FAIL	(SQL Injection)
90022	WARN	(Application Error Disclosure)
```

Alert IDs are listed in the ZAP [alert catalog](https://www.zaproxy.org/docs/alerts/).

---

## **7. CI/CD Integration**

### 🔹 GitHub Actions

```yaml
- name: ZAP Baseline Scan
  uses: zaproxy/action-baseline@v0.12.0
  with:
    target: 'https://staging.example.com'
    rules_file_name: '.zap/rules.tsv'
    cmd_options: '-a'
```

### 🔹 GitLab CI

```yaml
zap_baseline:
  stage: dast
  image:
    name: zaproxy/zap-stable
    entrypoint: [""]
  script:
    - mkdir -p /zap/wrk
    - zap-baseline.py -t $DAST_TARGET -r zap-report.html -I || true
  artifacts:
    paths:
      - zap-report.html
```

---

## **8. Daemon Mode & API**

```bash
# Start ZAP headless with REST API on :8090
docker run -d -p 8090:8090 zaproxy/zap-stable \
  zap.sh -daemon -port 8090 -config api.key=changeme

# Drive it via API
curl "http://localhost:8090/JSON/spider/action/scan/?url=https://staging.example.com&apikey=changeme"
```

Official client libraries exist for Python (`zaproxy`), Java, and Node — useful for custom scan orchestration beyond the packaged scripts.

---

## 📚 **Learning Resources**

* 🔗 [ZAP Official Docs & Getting Started](https://www.zaproxy.org/docs/)
* 📦 [ZAP Automation Framework](https://www.zaproxy.org/docs/automate/automation-framework/)
* 🛡️ [ZAP Docker Scans Guide](https://www.zaproxy.org/docs/docker/about/)
