# ✍️ Sigstore Cheatsheet — Cosign, Rekor & Fulcio

**Sigstore** — the open standard for signing, verifying, and attesting software artifacts. Three parts: **cosign** (the CLI that signs), **Fulcio** (a free CA issuing short-lived certs bound to your OIDC identity — "keyless" signing), **Rekor** (a transparency log recording every signature publicly).

```text
Keyless signing flow:
you (OIDC identity: github/google/workload)
   │
   ▼ Fulcio ──► short-lived cert binding pubkey → identity
   │
   ▼ cosign signs the artifact digest
   │
   ▼ Rekor transparency log records (cert + signature + timestamp)
   │
   ▼ anyone can verify: signature + identity + Rekor inclusion proof
```

---

## **1. Cosign — Sign & Verify Images**

```bash
# Install
brew install cosign                      # mac
go install github.com/sigstore/cosign/v2/cmd/cosign@latest

# Key-pair signing (the classic way)
cosign generate-key-pair                 # → cosign.key + cosign.pub (password-protected)
cosign sign --key cosign.key registry.local/app:1.0
cosign verify --key cosign.pub registry.local/app:1.0

# Verify output — shows identity, issuer, Rekor index:
cosign verify --key cosign.pub registry.local/app:1.0 | jq
```

**Keyless signing** — no keys to manage, identity via OIDC:

```bash
# Interactive OIDC flow (GitHub/Google/etc. login in browser):
cosign sign registry.local/app:1.0        # opens browser → Fulcio cert → sign → Rekor

# In CI (GitHub Actions has ambient OIDC — zero secrets):
cosign sign --yes registry.local/app:${{ github.sha }}

# Verify by IDENTITY, not a key:
cosign verify registry.local/app:1.0 \
  --certificate-identity="ci-bot@myorg.com" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com"
```

---

## **2. Attestations — Sign the Metadata, Not Just the Image**

```bash
# Attach a signed SBOM to the image:
cosign attest --predicate sbom.spdx.json --type spdxjson \
  --key cosign.key registry.local/app:1.0

# Attach SLSA provenance:
cosign attest --predicate provenance.json --type slsaprovenance \
  --key cosign.key registry.local/app:1.0

# Verify the attestation:
cosign verify-attestation --type spdxjson \
  --key cosign.pub registry.local/app:1.0 | jq

# List what's attached:
cosign tree registry.local/app:1.0        # signature + attestations tree
cosign download sbom registry.local/app:1.0
```

---

## **3. Rekor — Query the Transparency Log**

```bash
# Search by image digest:
rekor-cli search --sha sha256:abc123...

# Look up an entry (from cosign verify output):
rekor-cli get --log-index 12345678 --format json | jq

# Verify inclusion proof manually:
rekor-cli verify --log-index 12345678
```

**Why it matters:** Rekor makes signing *accountable* — every signature is publicly logged with a timestamp. A leaked key can't secretly sign without appearing in the log.

---

## **4. Fulcio — The Keyless CA**

```text
No keys to lose, rotate, or leak:
  OIDC token (GitHub Actions / GSA / personal OIDC)
     → Fulcio issues cert valid ~10 min, bound to that identity
     → sign during cert lifetime
     → cert expires, signature still verifiable via Rekor record
```

```bash
# Verify cert details cosign used:
cosign verify ... | jq '.[] | .optional.Subject, .optional.Issuer'
# → "ci@myorg.com" + "https://github.com/myorg/repo" — proof of WHO signed
```

---

## **5. Production Wiring — Admission Policy**

```yaml
# Enforce "only signed images run" — Sigstore Policy Controller on K8s:
apiVersion: policy.sigstore.dev/v1beta1
kind: ClusterImagePolicy
metadata: { name: require-signed }
spec:
  images:
    - glob: "registry.local/*"
  authorities:
    - keyless:
        url: https://fulcio.sigstore.dev
        identities:
          - issuer: "https://token.actions.githubusercontent.com"
            subject: "https://github.com/myorg/*"
```

```bash
# Or with cosign as a verify step in CI gate:
cosign verify --certificate-identity-regexp=".*@myorg.com" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  registry.local/app:${TAG} || exit 1   # unsigned → pipeline fails
```

---

## **6. Gotchas**

* **`cosign sign` signs the DIGEST, not the tag** — `app:latest` signed today ≠ `app:latest` tomorrow. Always sign by digest in CI (`cosign sign repo@sha256:...`).
* **Keyless needs network** — air-gapped? Use key-pair signing or run a private Sigstore stack.
* **Attestations live as OCI artifacts** on the registry — your registry must support OCI referrers (most modern ones do).
* **"cosign verify fails in cluster"** — the admission policy's identity must match the CI OIDC issuer exactly; a GitHub-org vs repo subject mismatch is the usual bug.

---

## 📚 **Learning Resources**

* 🔗 [Sigstore Docs](https://docs.sigstore.dev/)
* 📦 [Cosign CLI](https://docs.sigstore.dev/cosign/signing/overview/)
* 🛡️ [Rekor](https://docs.sigstore.dev/logging/overview/)
