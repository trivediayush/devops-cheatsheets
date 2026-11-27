# 🏗️ SLSA Cheatsheet — Supply-chain Levels for Software Artifacts

**SLSA** ("salsa") — the framework that answers *"was this artifact built by the pipeline it claims, from the source it claims?"* It's a provenance standard + maturity levels, not a single tool.

---

## **1. What SLSA Actually Proves**

```text
The attack it defends:
  source ──► build ──► artifact ──► deploy
              │                    ▲
              └── attacker injects/poisons/tampers here

SLSA provenance = signed statement:
  "artifact sha256:X was built by workflow W from
   commit C of repo R at time T by builder B"
   → consumers can verify the artifact's lineage
```

---

## **2. The Levels — What Each Requires**

| Level | Requirement | What it stops |
| --- | --- | --- |
| **L1** | provenance exists (signed statement of build inputs) | opacity — you can at least see how it was built |
| **L2** | + hosted build service signs the provenance | self-declared/forged provenance from build machines you control |
| **L3** | + hardened build platform (isolated, auditable) | build-platform tampering, persistent build compromise |
| **L4** (retired in 1.0 → tracks) | two-person review + hermetic/reproducible builds | malicious-source and non-reproducible builds |

**The real-world target today:** L3 via GitHub Actions + `slsa-github-generator` or cloud build services that emit signed provenance.

---

## **3. Provenance — The Document Itself**

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [{
    "name": "registry.local/app",
    "digest": { "sha256": "abc123..." }
  }],
  "predicateType": "https://slsa.dev/provenance/v1",
  "predicate": {
    "buildDefinition": {
      "buildType": "https://github.com/Attestations/GitHubActionsWorkflow@v1",
      "externalParameters": {
        "workflow": { "ref": "refs/heads/main", "repository": "org/repo" }
      },
      "resolvedDependencies": [
        { "uri": "git+https://github.com/org/repo", "digest": { "gitCommit": "def456" } }
      ]
    },
    "runDetails": {
      "builder": { "id": "https://github.com/actions/runner" },
      "metadata": { "startedOn": "...", "finishedOn": "..." }
    }
  }
}
```

**Read it as:** "subject X was built by builder Y from sources Z" — signed, so it can't be forged.

---

## **4. Generating SLSA Provenance in CI**

```yaml
# GitHub Actions — the official generator (produces signed provenance):
jobs:
  build:
    outputs:
      hashes: ${{ steps.hash.outputs.hashes }}
    steps:
      - run: docker build -t app . && docker save app -o app.tar
      - id: hash
        run: echo "hashes=$(sha256sum app.tar | base64 -w0)" >> "$GITHUB_OUTPUT"

  provenance:
    needs: [build]
    permissions:
      actions: read
      id-token: write      # OIDC — how the generator signs without keys
      contents: write
    uses: slsa-framework/slsa-github-generator/.github/workflows/generator_generic@v2.0.0
    with:
      base64-subjects: ${{ needs.build.outputs.hashes }}
```

```bash
# For containers — the container generator:
uses: slsa-framework/slsa-github-generator/.github/workflows/generator_container@v2.0.0

# Or manually with in-toto (lower-level):
in-toto-run --step-name build --products app.tar \
  --materials "package-lock.json" --command "npm ci && npm run build" \
  --key build-key.pem
```

---

## **5. Verifying Provenance**

```bash
# slsa-verifier — the consumer-side check:
slsa-verifier verify-image registry.local/app@sha256:abc... \
  --source-uri github.com/org/repo \
  --source-tag v1.4.2

slsa-verifier verify-artifact app.tar \
  --provenance-path provenance.intoto.jsonl \
  --source-uri github.com/org/repo \
  --source-tag v1.4.2

# In a pipeline gate — fail deploy if provenance doesn't match:
slsa-verifier verify-image "$IMAGE" \
  --source-uri github.com/myorg/repo || exit 1
```

**What verification proves:** the artifact came from YOUR repo's declared workflow, built by the hosted builder — not a developer laptop or a tampered CI job.

---

## **6. SLSA vs Related Things**

| Tool/framework | Relationship |
| --- | --- |
| **in-toto** | the attestation *format* SLSA provenance is expressed in (predicate type) |
| **Sigstore/cosign** | the *signing* mechanism — provenance gets signed into an attestation you verify |
| **SBOM (Syft)** | lists *what's in* the artifact — complements provenance's *how it was built* |
| **Scorecard (OpenSSF)** | repo hygiene score — a different axis (source health vs build integrity) |

---

## 📚 **Learning Resources**

* 🔗 [SLSA Framework](https://slsa.dev/) — levels + spec
* 📦 [slsa-github-generator](https://slsa.dev/how-to/get-started/) — provenance for GHA builds
* 🛡️ [in-toto](https://in-toto.io/) — the attestation format underneath
