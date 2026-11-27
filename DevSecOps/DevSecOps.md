# 🛡️ DevSecOps Cheatsheet

**DevSecOps** is the practice of embedding **security controls and automation into every stage of the CI/CD pipeline** ("shifting security left") so vulnerabilities are caught as early and cheaply as possible — instead of being bolted on at the end.

---

## **1. Where Each Security Control Fits in the Pipeline**

| Pipeline Stage | Security Control | Typical Tools |
| --- | --- | --- |
| **IDE / Pre-commit** | Secrets detection, linting | Gitleaks, Talisman, Semgrep |
| **Source / PR** | SAST, code review | Semgrep, SonarQube, CodeQL |
| **Dependencies** | SCA, license compliance | Trivy, OWASP Dependency-Check, Snyk, Renovate |
| **Build** | Image & SBOM generation | Trivy, Syft, Grype, Cosign (signing) |
| **Test / Staging** | DAST, API scanning | OWASP ZAP, Nuclei, Burp Suite |
| **Infra / Deploy** | IaC scanning, policy-as-code | Checkov, tfsec, OPA/Conftest |
| **Runtime** | Monitoring, CSPM, runtime threat detection | Falco, Wazuh, cloud-native CSPM |
| **Continuous** | Vulnerability management, feedback loop | DefectDojo, GitHub Security, Jira |

---

## **2. The "Shift Left" Principle**

```text
Cost to fix a bug:   $1        $10        $100        $1,000+
                     |          |           |            |
Stage found:      Coding →   Build →     Test →    Production
```

* Every security check that runs **before merge** is cheap.
* Every check that runs **after deploy** is an incident.
* Goal: developers get security feedback **in their PR**, not in a Jira ticket three weeks later.

---

## **3. A Reference DevSecOps Pipeline**

```yaml
# GitHub Actions — security gates at every stage
name: DevSecOps Pipeline
on: [push, pull_request]

jobs:
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2          # Secrets scan

  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: semgrep/semgrep-action@v1            # SAST
        with:
          config: p/owasp-top-ten

  sca:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aquasecurity/trivy-action@master     # Dependency/CVE scan
        with:
          scan-type: fs
          exit-code: '1'
          severity: CRITICAL,HIGH

  iac:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bridgecrewio/checkov-action@master   # IaC misconfigs

  build-and-dast:
    needs: [secrets, sast, sca, iac]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t app:${{ github.sha }} . && docker run -d -p 8080:80 --name app app:${{ github.sha }}
      - uses: zaproxy/action-baseline@v0.12.0      # DAST baseline
        with:
          target: 'http://localhost:8080'
```

---

## **4. Security Gates: How to Enforce**

> [!IMPORTANT]
> A scan that reports but never blocks is a report generator, not a control. Every stage should have an **exit-code / quality-gate** policy.

```bash
# Common gate patterns
trivy image --exit-code 1 --severity CRITICAL app:latest   # Fail on critical CVEs
semgrep --error --config p/owasp-top-ten src/              # Fail on findings
checkov -d ./terraform --check HIGH --soft-fail-on LOW     # Fail on HIGH only
```

Recommended starting policy:

* **Block on**: leaked secrets, CRITICAL CVEs with fixes, HIGH SAST findings with high confidence.
* **Warn only**: medium/low findings, info-level misconfigs — review weekly.
* **Baseline**: generate a baseline file (`.gitleaks.baseline`, `.trivyignore`, `checkov --create-baseline`) so legacy debt doesn't block day one, then burn it down.

---

## **5. Key Metrics to Track**

| Metric | What it tells you |
| --- | --- |
| **Mean time to remediate (MTTR)** | How fast vulnerabilities get fixed |
| **% builds failing security gates** | Whether gates are real or ignored |
| **Escaped vulnerabilities** | Findings discovered in prod that pipelines missed |
| **Dependency age / freshness** | How stale your third-party components are |
| **Secrets incident count** | Effectiveness of pre-commit + pipeline scanning |

---

## **6. Cultural & Process Checklist**

* ✅ Security champions inside each dev team
* ✅ Findings land in the dev backlog with SLAs by severity (e.g., Critical: 7 days, High: 30 days)
* ✅ False-positive / accepted-risk process (`.trivyignore`, `semgrep` ignores with expiry + reason)
* ✅ Blameless postmortems for security incidents
* ✅ Security training in onboarding — OWASP Top 10, secure coding per stack

---

## 📚 **Learning Resources**

* 🔗 [OWASP DevSecOps Guideline](https://owasp.org/www-project-devsecops-guideline/)
* 📦 [OWASP DevSecOps Maturity Model (DSOMM)](https://dsomm.owasp.org/)
* 🛡️ [DevSecOps Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
