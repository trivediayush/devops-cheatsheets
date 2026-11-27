# 📦 SCA (Software Composition Analysis) Cheatsheet

**SCA** identifies **all third-party and open-source components** in your application and flags known vulnerabilities (CVEs), outdated versions, and **license compliance** risks. Since ~80% of modern codebases are dependencies, SCA is usually the highest-ROI security scan you can add.

---

## **1. What SCA Covers**

| Concern | What it finds |
| --- | --- |
| **Known vulnerabilities** | CVEs in direct & transitive dependencies (e.g., Log4Shell) |
| **Outdated packages** | Versions far behind upstream — accumulated upgrade debt |
| **License risk** | GPL/AGPL copyleft in commercial code, missing attributions |
| **SBOM** | Full inventory of components — required for many compliance regimes |

> [!NOTE]
> **Transitive dependencies matter**: `npm install express` pulls ~60 packages. SCA tools resolve the full tree — your lockfile is the ground truth.

---

## **2. Tool Landscape**

| Tool | Ecosystems | Notes |
| --- | --- | --- |
| **Trivy** | All (fs, image, repo) | Fast, scans lockfiles + OS packages, generates SBOM |
| **OWASP Dependency-Check** | Java, .NET, JS, Python, Ruby | Classic OSS scanner, NVD-based |
| **Snyk** | All | Commercial, great fix-PR automation |
| **Dependabot / Renovate** | All | Automated dependency-update PRs with CVE alerts |
| **Syft + Grype** | Containers, dirs, SBOMs | SBOM generation + vulnerability matching pair |
| **OSV-Scanner** | All | Google's free scanner using the OSV database |
| **`npm audit` / `pip-audit` / `cargo audit`** | Per-ecosystem | Built-in, zero setup |

---

## **3. Quick Scans by Ecosystem**

```bash
# JavaScript
npm audit --audit-level=high          # fail on high+
npm audit fix                         # auto-upgrade safe fixes

# Python
pip install pip-audit
pip-audit -r requirements.txt
pip-audit --fix -r requirements.txt

# Go — vuln checking is built in
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...

# Rust
cargo audit
```

---

## **4. Trivy for SCA (filesystem scan)**

```bash
# Scan a repo's lockfiles for dependency CVEs
trivy fs --scanners vuln --severity HIGH,CRITICAL .

# Include license scanning
trivy fs --scanners vuln,license .

# Scan a built image (OS packages + app deps together)
trivy image --severity HIGH,CRITICAL --exit-code 1 myapp:latest
```

---

## **5. OWASP Dependency-Check**

```bash
docker run --rm \
  -v "$PWD":/src \
  owasp/dependency-check:latest \
  --scan /src \
  --format HTML --format JSON \
  --out /src/reports \
  --failOnCVSS 7                    # exit non-zero on CVSS >= 7
```

> [!TIP]
> Dependency-Check supports an **NVD API key** (`--nvdApiKey`) — without it, database updates are heavily rate-limited. Get a free key from nist.gov.

---

## **6. SBOM Generation & Scanning**

```bash
# Generate SBOM (CycloneDX / SPDX) with Syft
syft myapp:latest -o cyclonedx-json=sbom.json
syft dir:. -o spdx-json=sbom.spdx.json

# Scan the SBOM with Grype
grype sbom:sbom.json --fail-on high

# Or do both in one shot with Trivy
trivy image --format cyclonedx --output sbom.json myapp:latest
trivy sbom sbom.json --severity CRITICAL --exit-code 1
```

---

## **7. Automated Dependency Updates**

### 🔹 Dependabot (`.github/dependabot.yml`)

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
  - package-ecosystem: docker
    directory: /
    schedule:
      interval: weekly
```

### 🔹 Renovate (`renovate.json`)

```json
{
  "extends": ["config:recommended", ":vulnerabilityAlerts"],
  "schedule": ["before 6am on monday"],
  "vulnerabilityAlerts": { "schedule": ["at any time"] }
}
```

---

## **8. CI Gate Pattern**

```yaml
sca:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Dependency vulnerability scan
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: fs
        scanners: vuln
        severity: CRITICAL,HIGH
        ignore-unfixed: true        # only block what you can fix
        exit-code: '1'
```

---

## **9. License Compliance**

```bash
# Flag copyleft licenses in dependencies (Trivy)
trivy fs --scanners license --license-full .

# Node ecosystem
npx license-checker --summary --failOn "GPL;AGPL"
```

---

## 📚 **Learning Resources**

* 🔗 [OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/)
* 📦 [OSV.dev — Open Vulnerability Database](https://osv.dev/)
* 🛡️ [CycloneDX & SPDX SBOM Standards](https://cyclonedx.org/)
