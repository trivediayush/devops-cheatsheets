# 🛡️ Kubernetes Policy-as-Code & Runtime Security (Kyverno, OPA, CEL & Falco) Cheatsheet

In 2026, cluster governance enforces **defense-in-depth** across two moments in time:
1. **Admission Time (Before a Pod Runs)** — Native **Pod Security Admission**, Kubernetes **ValidatingAdmissionPolicy (CEL)**, **Kyverno**, and **OPA Gatekeeper**.
2. **Runtime (While Containers Execute)** — eBPF threat detection with **Falco** (and **Cilium Tetragon**).

---

## **1. Admission Control Options Compared (2026)**

| Engine | Language | Capabilities | Pros & Best Fit |
| --- | --- | --- | --- |
| **Pod Security Standards (PSS)** | Namespace labels | Built-in `Privileged / Baseline / Restricted` | Zero setup; baseline requirement on every cluster |
| **ValidatingAdmissionPolicy (CEL)** | CEL (built into K8s 1.30+ API server) | Validate only (no webhooks!) | Ultra-fast, zero webhook outage risk, built-in |
| **Kyverno** (CNCF Incubating) | Pure Kubernetes YAML | **Validate, Mutate, Generate, Verify Images (Cosign)** | Best K8s-native UX; easiest for platform teams |
| **OPA Gatekeeper** (CNCF Graduated) | Rego | Validate + Mutate (external webhook) | Unified policy language across K8s, Terraform, Envoy, CI |

---

## **2. Built-In Pod Security Standards (Namespace Labels)**

Zero add-ons required — enforce **Restricted** mode on application namespaces and **Audit/Warn** during rollout:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: checkout
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

---

## **3. Native Kubernetes `ValidatingAdmissionPolicy` (CEL — Zero Webhooks!)**

Runs directly inside `kube-apiserver` — cannot break cluster bootstrapping or add network latency:

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicy
metadata:
  name: require-non-latest-images
spec:
  failurePolicy: Fail
  matchConstraints:
    resourceRules:
      - apiGroups: ["apps"]
        apiVersions: ["v1"]
        operations: ["CREATE", "UPDATE"]
        resources: ["deployments"]
  validations:
    - expression: "object.spec.template.spec.containers.all(c, !c.image.endsWith(':latest') && c.image.contains(':'))"
      message: "All container images must specify an explicit immutable tag or digest (never :latest)."
---
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicyBinding
metadata:
  name: require-non-latest-images-binding
spec:
  policyName: require-non-latest-images
  validationActions: [Deny]                # Audit | Warn | Deny
  matchResources:
    namespaceSelector:
      matchLabels:
        env: prod
```

---

## **4. Kyverno — Validate, Mutate, Generate & Verify Signatures**

### A. Validate: Require Resource Requests/Limits & Read-Only Root FS

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-prod-guardrails
spec:
  validationFailureAction: Enforce         # Start with "Audit" first, then flip to "Enforce"!
  background: true
  rules:
    - name: check-resources-and-nonroot
      match:
        any:
          - resources:
              kinds: ["Pod"]
              namespaces: ["checkout", "payments"]
      validate:
        message: "Containers must define CPU/memory requests & limits and runAsNonRoot: true."
        pattern:
          spec:
            securityContext:
              runAsNonRoot: true
            containers:
              - securityContext:
                  allowPrivilegeEscalation: false
                  readOnlyRootFilesystem: true
                  capabilities:
                    drop: ["ALL"]
                resources:
                  requests:
                    memory: "?*"
                    cpu: "?*"
                  limits:
                    memory: "?*"
```

### B. Verify Container Image Signatures & Attestations (Sigstore Cosign)

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-signed-images
spec:
  validationFailureAction: Enforce
  webhookTimeoutSeconds: 15
  rules:
    - name: verify-cosign-keyless
      match:
        any:
          - resources:
              kinds: ["Pod"]
      verifyImages:
        - imageReferences:
            - "ghcr.io/acme/*"
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/acme-org/*"
                    issuer: "https://token.actions.githubusercontent.com"
                    rekor:
                      url: https://rekor.sigstore.dev
```

### C. Generate: Auto-Create Default-Deny NetworkPolicy on Every New Namespace

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: generate-default-deny-netpol
spec:
  rules:
    - name: default-deny-ingress
      match:
        any:
          - resources:
              kinds: ["Namespace"]
              selector:
                matchLabels:
                  tenant: "app"
      generate:
        apiVersion: networking.k8s.io/v1
        kind: NetworkPolicy
        name: default-deny-ingress
        namespace: "{{request.object.metadata.name}}"
        synchronize: true
        data:
          spec:
            podSelector: {}
            policyTypes: ["Ingress"]
```

### Test Kyverno Policies in CI (Shift-Left!)

```bash
# Apply policy against local manifests in CI before PR merge:
kyverno apply policies/ --resource k8s/overlays/prod/

# Run unit tests for policies:
kyverno test policies/
```

---

## **5. OPA Gatekeeper (Rego ConstraintTemplate)**

```yaml
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8sallowedrepos
spec:
  crd:
    spec:
      names:
        kind: K8sAllowedRepos
      validation:
        openAPIV3Schema:
          type: object
          properties:
            repos:
              type: array
              items: { type: string }
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8sallowedrepos
        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          not startswith_any(container.image, input.parameters.repos)
          msg := sprintf("Image <%v> is not from an approved registry %v", [container.image, input.parameters.repos])
        }
        startswith_any(str, prefixes) {
          startswith(str, prefixes[_])
        }
```

---

## **6. Falco (CNCF Graduated) — eBPF Runtime Threat Detection**

Admission control stops bad YAML; **Falco** watches Linux kernel syscalls via modern **eBPF** to catch live attacks (reverse shells, crypto miners, reading `/etc/shadow`, writing to `/bin`, container escapes):

```yaml
# Custom Falco rule: alert if any production container spawns a shell or runs curl/wget:
- rule: Unexpected Shell or Downloader in Prod Container
  desc: Detect interactive shell or payload download inside an immutable production container
  condition: >
    spawned_process and container
    and k8s.ns.name in (checkout, payments)
    and proc.name in (bash, sh, zsh, curl, wget, nc, socat)
  output: >
    Unexpected tool spawned in prod container
    (user=%user.name pod=%k8s.pod.name ns=%k8s.ns.name cmd=%proc.cmdline image=%container.image.repository)
  priority: CRITICAL
  tags: [container, mitre_execution, production]
```

```bash
# Install Falco with modern eBPF probe (no kernel module compilation needed!) + Falcosidekick:
helm install falco falcosecurity/falco \
  --namespace falco --create-namespace \
  --set driver.kind=modern_ebpf \
  --set tty=true \
  --set falcosidekick.enabled=true \
  --set falcosidekick.config.slack.webhookurl=$SLACK_SEC_WEBHOOK

# Stream live security alerts:
kubectl logs -n falco -l app.kubernetes.io/name=falco -f
```

---

## **7. Safe Policy Rollout Strategy (Never Brick Production!)**

1. **Always exclude `kube-system`, `kyverno`, `falco`, `cilium` namespaces** in admission webhook `namespaceSelector` so the cluster can always recover itself.
2. **Audit Mode First (`Audit` / `dryrun`)** for 2 weeks; inspect `PolicyReport` (`kubectl get polr -A`) and remediate existing workloads.
3. **Shift-Left in CI** (`kyverno apply` / `conftest`) so developers see clear failures on PRs, not mysterious Argo CD sync blocks.
4. **Enforce (`Enforce` / `Deny`)** with `failurePolicy: Ignore` on non-security policies and `failurePolicy: Fail` only on high-availability webhooks (`>= 3` replicas across AZs).
