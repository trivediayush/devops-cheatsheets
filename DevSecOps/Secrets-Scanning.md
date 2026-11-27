# 🔑 Secrets Scanning Cheatsheet

**Secrets scanning** detects API keys, tokens, private keys, and passwords committed to source control — **before** attackers find them (public repos get scraped within minutes of a leak). Tools: **Gitleaks**, **TruffleHog**, and **detect-secrets**.

---

## **1. Defense in Depth — Where to Scan**

| Layer | Mechanism | Tool |
| --- | --- | --- |
| **Pre-commit** | Blocks secrets before they leave the machine | Gitleaks pre-commit hook, Talisman |
| **Pre-receive** | Server-side hook rejecting pushes | Gitleaks, platform-native (GitHub push protection) |
| **CI on every push** | Full-history scan of the branch/PR | Gitleaks / TruffleHog in pipeline |
| **Scheduled full scan** | Nightly scan of entire repo + git history | TruffleHog `git`, Gitleaks `detect` |
| **Platform** | Built-in scanning + automatic revocation partner program | GitHub/GitLab secret scanning |

> [!IMPORTANT]
> Scanning catches leaks — **it does not fix them**. A leaked secret is compromised the moment it hits a shared branch. The only remediation is **revoke/rotate**, then purge history if needed.

---

## **2. Gitleaks**

```bash
# Install
brew install gitleaks            # macOS
# or download binary from github.com/gitleaks/gitleaks/releases

# Scan working tree (uncommitted + committed files)
gitleaks dir . -v

# Scan full git history
gitleaks git . -v --redact

# Scan a specific range
gitleaks git --log-opts="main..HEAD" .

# JSON report + non-zero exit on findings (CI mode)
gitleaks dir . --report-format json --report-path gitleaks.json --exit-code 1
```

### 🔹 Pre-commit Hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.24.0
    hooks:
      - id: gitleaks
```

### 🔹 Custom Config (`.gitleaks.toml`)

```toml
title = "gitleaks config"

[allowlist]
paths = [
  '''tests/fixtures''',
  '''docs/examples'''
]

[[rules]]
id = "company-api-key"
description = "Internal API key format"
regex = '''acme_[a-zA-Z0-9]{32}'''
secretGroup = 0
```

---

## **3. TruffleHog — Verified Secrets**

TruffleHog's superpower: it **verifies** found credentials against live APIs, slashing false positives.

```bash
# Docker
docker run --rm -v "$PWD":/repo trufflesecurity/trufflehog:latest \
  git file:///repo --only-verified

# Scan a remote repo
trufflehog git https://github.com/org/repo --only-verified

# Scan S3, GitHub orgs, etc.
trufflehog s3 --bucket=my-backups
trufflehog github --org=my-org --token=$GITHUB_TOKEN

# JSON output for pipelines
trufflehog git . --json > trufflehog.json
```

---

## **4. Baseline Legacy Findings**

Don't let 5 years of leaked history block the pipeline day one — baseline it and burn down:

```bash
# Gitleaks: create + use a baseline
gitleaks git . --baseline-path /dev/null --report-path baseline.json
gitleaks git . --baseline-path baseline.json --exit-code 1

# detect-secrets: audit-driven baseline
pip install detect-secrets
detect-secrets scan > .secrets.baseline
detect-secrets audit .secrets.baseline    # mark true/false positives interactively
```

---

## **5. CI Integration**

```yaml
# GitHub Actions
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }          # full history required
- uses: gitleaks/gitleaks-action@v2
  env:
    GITLEAKS_ENABLE_COMMENTS: true  # annotate PRs with findings

# GitLab CI
secrets_scan:
  stage: test
  image:
    name: zricethezav/gitleaks:latest
    entrypoint: [""]
  script:
    - gitleaks git . --redact --exit-code 1
```

---

## **6. When a Secret Leaks — Response Playbook**

1. **Rotate immediately** — the secret is compromised; assume it's already scraped.
2. **Verify revocation works** — hit the API with the old key; it must fail.
3. **Purge from history** (public repos): `git filter-repo` or BFG Repo Cleaner, then force-push.
4. **Notify** the secret owner / security team; check access logs for abuse.
5. **Root cause**: add the pattern to `.gitleaks.toml` allowlists only if it's a false positive.

```bash
# Purge a file from all history (git-filter-repo)
pip install git-filter-repo
git filter-repo --path secrets.env --invert-paths --force
```

---

## **7. Preventing Leaks — Better Than Scanning**

| Practice | Effect |
| --- | --- |
| Env vars + secret managers (Vault, AWS SM, Doppler) | Secrets never touch the repo |
| `.env` in `.gitignore` + `.env.example` committed | Removes the #1 leak vector |
| Short-lived credentials (OIDC, IRSA, workload identity) | Leaked keys expire in minutes |
| GitHub push protection / GitLab push rules | Server blocks the push before it lands |

---

## 📚 **Learning Resources**

* 🔗 [Gitleaks Documentation](https://github.com/gitleaks/gitleaks)
* 📦 [TruffleHog Documentation](https://github.com/trufflesecurity/trufflehog)
* 🛡️ [GitHub Push Protection](https://docs.github.com/en/code-security/secret-scanning/push-protection-for-repositories-and-organizations)
