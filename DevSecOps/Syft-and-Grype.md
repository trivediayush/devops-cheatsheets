# 📦 Syft & Grype Cheatsheet — SBOM Generation & Vulnerability Scanning

**Syft** generates the SBOM (Software Bill of Materials — the full ingredient list of an image/filesystem). **Grype** scans that SBOM for known CVEs. Anchore's pair: Syft inventories, Grype checks.

```text
image/filesystem ──► Syft ──► SBOM (SPDX/CycloneDX/JSON)
                              │
                              ▼
                           Grype ──► CVE list + severity + fix version
                              │
                              ▼
                        CI gate / report / attestation
```

---

## **1. Syft — Generate the SBOM**

```bash
# Install
brew install syft
curl -sSfL https://get.anchore.io/syft | sh -s -- -b /usr/local/bin

# From a container image:
syft nginx:1.25                          # default table output
syft nginx:1.25 -o json > sbom.json
syft nginx:1.25 -o spdx-json > sbom.spdx.json
syft nginx:1.25 -o cyclonedx-json > sbom.cdx.json

# From a filesystem or repo:
syft dir:./my-app
syft file:./app.tar

# Include every layer of the image (not just squashed):
syft nginx:1.25 --scope all-layers -o json
```

**Output formats** — pick per consumer:

| Format | Use when |
| --- | --- |
| `spdx-json` | industry standard, license/compliance tooling, cosign attest |
| `cyclonedx-json` | security-first tooling, OWASP ecosystem |
| `syft-json` | the richest output — what Grype reads fastest |
| `table`/`text` | human reading |

```bash
# The power moves:
syft nginx:1.25 -o json | jq '.artifacts[] | {name, version, type}'  # list packages
syft nginx:1.25 -o json | jq '.artifacts | length'                   # package count
syft nginx:1.25 -o json | jq '.artifacts[] | select(.licenses)'      # license audit
syft nginx:1.25 -o cyclonedx-json --source-name my-app --source-version 1.2.0
```

---

## **2. Grype — Scan the SBOM for CVEs**

```bash
# Install
brew install grype
curl -sSfL https://get.anchore.io/grype | sh -s -- -b /usr/local/bin

# Scan an image directly (syft runs internally):
grype nginx:1.25
grype nginx:1.25 -o json > vulns.json
grype nginx:1.25 --only-fixed            # only CVEs with available fixes

# Scan a pre-generated SBOM (faster, reproducible):
grype sbom:sbom.spdx.json
grype sbom:./sbom.json --output cyclonedx-json > vulns.cdx.json

# Filter by severity — the gate you'll actually use:
grype nginx:1.25 --fail-on high          # exit 1 if High+ found → CI gate
grype nginx:1.25 --fail-on critical
```

```bash
# Reading the output:
grype nginx:1.25 | head -20
# NAME      INSTALLED  FIXED-IN  TYPE    VULNERABILITY   SEVERITY
# openssl   3.0.9      3.0.10    deb     CVE-2023-XXXX   High

# Query the JSON:
grype nginx:1.25 -o json | jq '.matches[] | {pkg: .artifact.name, vuln: .vulnerability.id, sev: .vulnerability.severity, fix: .vulnerability.fix.versions}'
```

---

## **3. The CI Pattern — SBOM → Scan → Gate → Attest**

```yaml
# .github/workflows/sbom-scan.yml — the full supply-chain step:
- name: Generate SBOM
  run: syft ${{ env.IMAGE }} -o spdx-json > sbom.spdx.json

- name: Scan SBOM
  run: grype sbom:sbom.spdx.json --fail-on high --output table

- name: Attest SBOM to the image (Sigstore — see Sigstore cheatsheet)
  run: cosign attest --predicate sbom.spdx.json --type spdxjson ${{ env.IMAGE }}

- name: Upload SBOM as artifact
  uses: actions/upload-artifact@v4
  with: { name: sbom, path: sbom.spdx.json }
```

```bash
# In a pipeline — fail fast, report always:
grype sbom:sbom.json --fail-on critical -o json > vulns.json || true
CRITICAL=$(jq '[.matches[] | select(.vulnerability.severity == "Critical")] | length' vulns.json)
[ "$CRITICAL" -gt 0 ] && exit 1
```

---

## **4. What the Scan Actually Does**

```text
Grype matches packages → vulnerability DB (NVD + distro feeds):
   deb/rpm/apk     → distro security trackers
   java (jar)      → Maven/NVD
   npm/pip/gem/go  → language ecosystem feeds
   binary versions → embedded library matching

Important: it matches on VERSION, not exploitability.
   "fixed-in" column = the version where the CVE is patched.
   No fix available yet → shows "fixed-in: (none)" → --only-fixed filters those out.
```

```bash
# Tune the noise — .grype.yaml in repo root:
ignore:
  - vulnerability: CVE-2023-12345      # accepted risk / not exploitable
    reason: "unused code path — see ticket SEC-101"
  - vulnerability: CVE-2023-99999
    until: 2024-12-31                  # time-boxed acceptance
```

**Suppressing is a feature** — a curated `.grype.yaml` ignore list in the repo documents *which* CVEs you accepted and why. That's auditable.

---

## **5. Syft+Grype vs Trivy**

| | Syft + Grype | Trivy |
| --- | --- | --- |
| Model | two tools, SBOM-first | one tool, everything |
| SBOM focus | stronger — richer formats, better for attestation | does SBOM but scanner-first |
| Speed | SBOM generated once → scan re-runs offline | single pass |
| Secret/config scan | not their job | yes (fs secrets, misconfig) |
| Use together? | yes — grype for SBOM pipeline, Trivy for secrets/IaC | — |

**Rule:** for the *SBOM-as-artifact* pattern (attest it, ship it, scan it repeatedly offline) → Syft+Grype. For a single scanning tool that also does secrets/misconfig → Trivy. Many run both.

---

## **6. Gotchas**

* **SBOM ≠ scan results** — generate the SBOM once, scan it repeatedly as new CVEs drop (the SBOM doesn't change, the vuln DB does).
* **`--fail-on high` in CI** — start with `critical`, loosen to `high` when the backlog's manageable; `--only-fixed` filters noise but can hide real risk.
* **Distroless images** — no package manager ≠ no packages; Syft detects binaries/libs too.
* **Layer scope matters** — `--scope squashed` (default) scans the final image; `all-layers` catches vulnerabilities in build-only layers you don't ship.

---

## 📚 **Learning Resources**

* 🔗 [Syft](https://anchore.io/sbom/) — SBOM generation
* 📦 [Grype](https://anchore.io/opensource/) — vulnerability scanner
* 🛡️ [NTIA SBOM Minimum Elements](https://www.ntia.gov/sbom) — what an SBOM must contain
