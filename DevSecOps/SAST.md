# 🧬 SAST (Static Application Security Testing) Cheatsheet

**SAST** analyzes **source code, bytecode, or binaries without executing them** to find vulnerabilities — SQL injection, XSS, insecure crypto, hardcoded secrets — before the code ever runs. It runs early in the pipeline (commit/PR stage) where fixes are cheapest.

---

## **1. How SAST Works**

```text
Source Code → Parse to AST/IR → Apply rules/patterns + taint analysis → Findings
```

* **Pattern matching**: flags dangerous functions (`eval()`, `strcpy`, `innerHTML`).
* **Dataflow / taint analysis**: traces untrusted input (`request.params`) to dangerous sinks (`db.query`).
* **Strengths**: runs on every commit, precise file+line location, catches issues early.
* **Weaknesses**: false positives, can't see runtime config/environment issues, language-specific.

---

## **2. Tool Landscape**

| Tool | Type | Languages | Notes |
| --- | --- | --- | --- |
| **Semgrep** | OSS + commercial | 30+ | Fast, custom rules in YAML, great for CI |
| **SonarQube** | OSS + commercial | 30+ | Quality + security, Quality Gates |
| **CodeQL** | Free for OSS | C/C++, C#, Go, Java, JS/TS, Python, Ruby | Deep semantic analysis, powers GitHub code scanning |
| **Bandit** | OSS | Python | Lightweight, AST-based |
| **Checkmarx / Fortify / Veracode** | Commercial | Broad | Enterprise SAST suites |
| **ESLint security plugins** | OSS | JS/TS | Runs in the IDE/pre-commit |

---

## **3. Semgrep — The Modern Go-To**

```bash
# Install
pip install semgrep          # or: brew install semgrep

# Scan with a public ruleset from the registry
semgrep scan --config p/owasp-top-ten
semgrep scan --config p/python --config p/secrets

# Auto-apply fixes where available
semgrep scan --config p/default --autofix

# JSON output + fail the build on findings
semgrep scan --config p/ci --json --output results.json --error
```

### 🔹 Write a Custom Rule (`rule.yml`)

```yaml
rules:
  - id: no-hardcoded-db-password
    pattern: |
      $PASSWORD = "..."
      $DB.connect(password=$PASSWORD, ...)
    message: "Hardcoded database password"
    severity: ERROR
    languages: [python]
```

```bash
semgrep scan --config rule.yml src/
```

---

## **4. CodeQL**

```bash
# Create a database, then run queries
codeql database create codeql-db --language=python --source-root=src
codeql database analyze codeql-db python-security-extended.qls --format=sarif-latest --output=results.sarif
```

GitHub Actions — zero-config code scanning:

```yaml
- uses: github/codeql-action/init@v3
  with:
    languages: javascript
- uses: github/codeql-action/analyze@v3
```

---

## **5. Language-Specific Quick Wins**

```bash
# Python
bandit -r src/ -f json -o bandit.json       # -ll for higher confidence only

# Go
go install github.com/securego/gosec/v2/cmd/gosec@latest
gosec ./...

# JavaScript / TypeScript
npx eslint --plugin security --extends plugin:security/recommended src/
```

---

## **6. CI Integration Pattern**

```yaml
sast:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Semgrep scan
      run: |
        pipx run semgrep scan \
          --config p/owasp-top-ten --config p/r2c-security-audit \
          --error --exclude tests/
```

> [!TIP]
> **Reduce noise**: scan `--baseline` (only new findings), exclude `tests/`, `vendor/`, `node_modules/`, and generated code. Tune rules before making them blocking.

---

## **7. Managing Findings**

| Practice | Why |
| --- | --- |
| Severity-based gates (block High+, warn on rest) | Prevents alert fatigue |
| `// nosemgrep: rule-id -- reason` inline ignores | Documents accepted risk where it lives |
| SARIF output → GitHub Code Scanning / DefectDojo | Central deduplication & tracking |
| Weekly triage of Medium/Low | Keeps backlog from rotting |

---

## 📚 **Learning Resources**

* 🔗 [Semgrep Documentation](https://semgrep.dev/docs/)
* 📦 [CodeQL Documentation](https://codeql.github.com/docs/)
* 🛡️ [OWASP Source Code Analysis Tools](https://owasp.org/www-community/Source_Code_Analysis_Tools)
