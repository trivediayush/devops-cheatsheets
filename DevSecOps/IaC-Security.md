# 🏗️ IaC Security Scanning Cheatsheet

**IaC security scanning** finds misconfigurations in infrastructure code — open security groups, public S3 buckets, unencrypted storage, over-privileged IAM — **before** they're deployed to real environments. Tools: **Checkov**, **tfsec**, **Terrascan**, and **OPA/Conftest** for custom policy-as-code.

---

## **1. Tool Landscape**

| Tool | IaC Coverage | Notes |
| --- | --- | --- |
| **Checkov** | Terraform, CFN, K8s, Helm, Dockerfile, ARM, Serverless | 1000+ built-in policies, custom policies in Python/YAML |
| **tfsec / Trivy config** | Terraform | tfsec merged into Trivy — `trivy config` is the successor |
| **Terrascan** | Terraform, K8s, Helm, Dockerfile | Rego-based policies |
| **OPA / Conftest** | Any structured config (YAML/JSON/TF plan) | Universal policy engine — write your own rules in Rego |
| **KICS** | Terraform, K8s, Docker, CFN, Ansible | Checkmarx OSS scanner |
| **kube-bench / kube-hunter** | Live K8s clusters | CIS benchmark + penetration checks on running clusters |

---

## **2. Checkov — The Swiss Army Knife**

```bash
# Install
pip install checkov          # or: brew install checkov

# Scan a directory of Terraform / K8s / CFN files
checkov -d ./terraform
checkov -d ./k8s --framework kubernetes

# Scan a compiled Terraform plan (catches resolved values)
terraform plan -out tfplan.binary
terraform show -json tfplan.binary > tfplan.json
checkov -f tfplan.json

# Output formats for CI
checkov -d . -o sarif --output-file-path results.sarif
checkov -d . --check HIGH --soft-fail-on LOW,MEDIUM   # gate on severity
```

### 🔹 Skip / Baseline

```hcl
# Inline suppression with a reason — always leave the why
resource "aws_s3_bucket" "logs" {
  #checkov:skip=CKV_AWS_18: Access logging enabled on the logging bucket itself
  bucket = "my-logs"
}
```

```bash
# Baseline existing violations, only gate on new ones
checkov -d . --create-baseline
checkov -d . --baseline checkov.baseline
```

---

## **3. Trivy for IaC (`trivy config` — tfsec successor)**

```bash
# Scan Terraform / Dockerfile / K8s manifests for misconfigs
trivy config ./terraform --severity HIGH,CRITICAL

# Scan a K8s manifest
trivy config ./k8s/deployment.yaml

# Combined: vulns + misconfigs + secrets on a repo
trivy fs --scanners vuln,misconfig,secret .
```

---

## **4. OPA / Conftest — Custom Policy as Code**

Write rules in **Rego** to enforce org-specific requirements that generic scanners miss:

```rego
# policy/tags.rego — require cost-center tag on all AWS resources
package main

deny[msg] {
  resource := input.resource[res_type][name]
  startswith(res_type, "aws_")
  not resource.tags["cost-center"]
  msg := sprintf("%s.%s missing required tag 'cost-center'", [res_type, name])
}
```

```bash
# Evaluate a Terraform plan against policy
terraform show -json tfplan.binary > tfplan.json
conftest test tfplan.json -p policy/

# Works on any YAML/JSON — K8s manifests, CI configs, etc.
conftest test k8s/deployment.yaml -p policy/
```

---

## **5. Common Findings Cheat Table**

| Finding | Fix |
| --- | --- |
| `0.0.0.0/0` on security group ingress | Restrict CIDRs; use SG-to-SG rules |
| S3 bucket public / no encryption | `aws_s3_bucket_public_access_block`, SSE-KMS |
| IAM policy `Action: "*"` / `Resource: "*"` | Least-privilege scoped policies |
| Container runs as root / privileged | `runAsNonRoot: true`, drop capabilities |
| K8s no resource limits | Set `requests`/`limits` |
| Secrets in `user_data` / env vars | Use secret managers, `sensitive = true` |
| Logging/audit disabled | CloudTrail, flow logs, access logging |

---

## **6. CI Integration**

```yaml
# GitHub Actions
- name: Checkov IaC scan
  uses: bridgecrewio/checkov-action@master
  with:
    directory: ./terraform
    check: HIGH,CRITICAL
    output_format: sarif
    output_file_path: checkov.sarif

- name: Upload SARIF to GitHub Security tab
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: checkov.sarif
```

```yaml
# GitLab CI
iac_scan:
  stage: test
  image:
    name: aquasec/trivy:latest
    entrypoint: [""]
  script:
    - trivy config --severity HIGH,CRITICAL --exit-code 1 ./terraform
```

---

## **7. Kubernetes Runtime Benchmarks**

```bash
# CIS Kubernetes benchmark on a live cluster
docker run --rm -v $(pwd):/host aquasec/kube-bench:latest run --targets node

# Cluster attack-surface probing
docker run --rm -it --network host aquasec/kube-hunter:latest --remote worker-1
```

---

## 📚 **Learning Resources**

* 🔗 [Checkov Documentation](https://www.checkov.io/1.Welcome/Quick%20Start.html)
* 📦 [Conftest & Open Policy Agent](https://www.conftest.dev/)
* 🛡️ [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks)
