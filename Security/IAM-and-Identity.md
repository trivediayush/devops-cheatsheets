# 🪪 IAM & Identity — Authentication & Authorization

**Identity is the new perimeter.** In cloud-native systems, "who/what is calling" matters more than "where the call comes from." This covers the concepts, protocols, and vendors — Okta, Entra ID, Keycloak — that show up in real architectures.

---

## **1. Core Vocabulary**

| Term | Definition |
| --- | --- |
| **Authentication (AuthN)** | *Who* are you — verifying an identity (password, MFA, cert, token). |
| **Authorization (AuthZ)** | *What* can you do — permissions evaluated against identity. |
| **Principal** | The identity making a request — human user, service account, workload. |
| **IdP (Identity Provider)** | System that authenticates and issues tokens — Okta, Entra ID, Keycloak, Auth0. |
| **SP / RP** | Service Provider / Relying Party — the app trusting the IdP's assertion. |
| **MFA / Step-up auth** | Multiple factors — something you know + have + are. Step-up = stronger auth for sensitive ops. |
| **Zero Trust** | "Never trust, always verify" — every request authenticated & authorized regardless of network location. |

---

## **2. The Three Protocols — SAML vs OAuth vs OIDC**

| Protocol | Era | Token | Best for | Mental model |
| --- | --- | --- | --- | --- |
| **SAML 2.0** | 2005 | XML assertions | Enterprise SSO (legacy apps, Okta→AWS console) | "Signed XML letter the IdP hands to the app via your browser" |
| **OAuth 2.0** | 2012 | Access tokens (usually JWT) | **Authorization** — API access on your behalf | "Valet key: app gets limited access without your password" |
| **OIDC** | 2014 | ID token (JWT) + OAuth | **Authentication** — "log in with Google/Okta" | "OAuth + a standard 'who is this user' layer on top" |

> [!IMPORTANT]
> **OAuth is not auth** — it grants access tokens (authorization). OIDC is the authentication layer on top of OAuth. "Login with Google" uses OIDC; "App reads your Google Drive" uses OAuth.

---

## **3. OAuth2 / OIDC Flows — Which One When**

| Flow | Use case | Creds involved |
| --- | --- | --- |
| **Authorization Code + PKCE** | Web apps, mobile, SPAs — *the default* | User creds at IdP only; app gets token via code exchange |
| **Client Credentials** | Service↔service, CI/CD, no user | Client ID + secret (or better: private key/OIDC federation) |
| **Device Authorization** | TVs, CLIs, constrained devices | User approves on another device (`aws sso login` does this) |
| ~~Implicit~~ | Deprecated — tokens in URL | Don't use |
| ~~Resource Owner Password~~ | Deprecated — app handles user password | Don't use |

```text
Auth Code Flow:
1. Browser → IdP /authorize?client_id=X&redirect_uri=Y&code_challenge=HASH  (user logs in at IdP)
2. IdP → redirect to app: ?code=abc123&state=xyz
3. App backend → IdP /token: code + code_verifier + client_secret
4. IdP → {id_token, access_token, refresh_token}
5. App validates ID token (signature, iss, aud, exp) → creates session
```

**PKCE** (`code_verifier`/`code_challenge`) prevents auth-code interception — required for public clients (SPAs, mobile, CLIs) and best practice everywhere.

---

## **4. JWT Anatomy — Decode It Always**

```text
header.payload.signature
eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL2lkcC5jb20iLCJhdWQiOiJhcGkiLCJleHAiOjE3MDAwMDAwMDB9.signature...
```

| Claim | Meaning | Check |
| --- | --- | --- |
| `iss` | Issuer — which IdP issued it | Must match expected issuer |
| `sub` | Subject — who the token is about | The principal |
| `aud` | Audience — who the token is *for* | Must be your service — else confused-deputy |
| `exp`/`iat`/`nbf` | Expiry / issued-at / not-before | Validate expiry + clock skew |
| `scope`/`roles`/`groups` | Permissions claims | Your AuthZ input |
| `jti` | Token ID — for revocation tracking | Optional |

```bash
# Decode a JWT without sending it to a website
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq .

# Validate properly: fetch IdP's public keys (JWKS) & verify signature + claims
# jwks_uri = <issuer>/.well-known/jwks.json
```

**Validation rules that matter:** verify signature (RS256 via JWKS), `exp` not past, `iss` and `aud` match, `nbf` honored with clock-skew tolerance (~30–60s). Never trust a token just because it parses.

**JWT gotchas:** can't be revoked before `exp` (short expiry + refresh, or revocation lists for critical ops); `alg: none` and `RS256→HS256` downgrade attacks are the classic vulns — pin algorithms server-side.

---

## **5. RBAC / ABAC / PBAC — Authorization Models**

| Model | Decides by | Example | When it scales |
| --- | --- | --- | --- |
| **RBAC** | Role membership | "DevOps role can deploy to prod" | Small-medium orgs; roles get messy at scale ("role explosion") |
| **ABAC** | Attributes | "If dept=finance AND env≠prod AND time<6pm" | Complex policies, fine-grained cloud IAM (AWS tags, conditions) |
| **PBAC / ReBAC** | Relationships/policy | "You can edit docs in projects you own" | GitHub/Google-style sharing models, policy engines (OPA, Cedar) |

Modern stacks layer them: RBAC for coarse groups + ABAC conditions for precision. K8s RBAC = Role/ClusterRole+Bindings (see `Kubernetes-Internals.md`).

---

## **6. The Vendors — What Each Actually Is**

### 🔹 Okta

Cloud IdP for workforce identity: **Universal Directory** (user store), SSO to SAML/OIDC apps, Adaptive MFA, **Lifecycle Management** (SCIM provisioning/deprovisioning — joiner/mover/leaver automation), Okta Workflows (no-code automation), Advanced Server Access (SSH/RDP via OIDC short-lived certs), Okta API Access Management (OAuth as a service).

```text
Joiner: HR system → Okta → auto-provision accounts in Salesforce/AWS/GitHub (SCIM)
Leaver: HR offboard → Okta → disable + deprovision everywhere → no orphan accounts
```

Okta concepts to know: *Okta Identity Engine (OIE)* vs Classic, *Okta orgs* (tenant), *Okta Verify* (MFA app), *Sign-on policies*, *Inline hooks* (custom logic during flows).

### 🔹 Microsoft Entra ID (ex-Azure AD)

Same class as Okta but Microsoft-native: SSO, Conditional Access (context-aware policies — device + location + risk), PIM (Privileged Identity Management — **just-in-time** admin elevation with approval + audit), B2B/B2C guest flows, workload identities (managed identities + service principals).

### 🔹 Keycloak

Self-hosted open-source IdP (Red Hat) — full OIDC/SAML/social-login/broker in one Java app. The standard for "need an IdP we control" (on-prem, air-gap, cost-sensitive).

### 🔹 Auth0 / Cognito / WorkOS / Clerk

CIAM (customer identity) — auth for your *product's* users, not your workforce. Managed login, social providers, MFA, user migration.

---

## **7. Workload Identity — Machines Authenticating**

The modern answer to "how does a pod/VM/CI job get credentials?"

```text
SPIFFE ID:  spiffe://trust-domain/ns/prod/sa/payments
Workload → attest (prove it's that workload) → get SVID (JWT or X.509)
         → exchange for cloud creds (STS) or use directly (mTLS)
```

* **SPIFFE/SPIRE**: workload identity standard — identity tied to the workload, not a secret.
* **Cloud-native**: AWS IRSA (EKS pod → IAM role via OIDC), Azure Managed Identity, GCP Workload Identity.
* **OIDC federation**: GitHub Actions → `sts:AssumeRoleWithWebIdentity` — the pattern that killed stored CI secrets.

---

## **8. Zero Trust in Practice**

```text
Verify explicitly  → every request authenticated (mTLS, OIDC) & authorized
Least privilege    → just-in-time/just-enough access, not standing admin
Assume breach      → segment, monitor, encrypt everything
```

Practical stack: IdP (Okta/Entra) → device trust (MDM) → context-aware policies (Conditional Access/Okta sign-on policies) → workload identity (SPIFFE) → service mesh mTLS → JIT elevation (PIM, temporary roles).

---

## **9. Gotchas That Bite**

* **Clock skew breaks JWT/TLS validation** — run NTP, especially air-gapped.
* **Redirect URI exact-match** — trailing slashes count. Login loops = this.
* **`aud` validation skipped** → token for service A works on service B (confused deputy).
* **Refresh token theft > access token theft** — rotate refresh tokens, bind to client.
* **SCIM deprovisioning gaps** = orphaned accounts — the #1 audit finding.
* **SSO as single point of failure** — break-glass accounts bypassing IdP for emergencies.

---

## 📚 **Learning Resources**

* 🔗 [OAuth 2.0 Simplified (oauth.com)](https://www.oauth.com/)
* 📦 [OIDC Primer (Okta)](https://developer.okta.com/docs/concepts/oauth-openid/)
* 🛡️ [SPIFFE](https://spiffe.io/)
* 🧾 [JWT.io debugger](https://jwt.io/) — decode, but don't paste prod tokens
