# 🛠️ OpenTofu, Terragrunt & Pulumi (2026 IaC Stack) Cheatsheet

After HashiCorp's 2023 BSL license change, the 2026 Infrastructure-as-Code landscape solidified around **OpenTofu** (the Linux Foundation open-source successor to Terraform), **Terragrunt** (DRY multi-environment orchestration), and **Pulumi** (real programming-language IaC in TypeScript, Go, and Python).

---

## **1. 2026 IaC Decision Matrix**

| Tool | Language | License | Standout 2026 Features | Best Fit |
| --- | --- | --- | --- | --- |
| **OpenTofu** | HCL | MPL-2.0 (Linux Foundation) | **Client-side State Encryption**, early variable eval, `removed` blocks, 100% provider compatible | Drop-in open-source Terraform replacement |
| **Terraform** | HCL | BSL 1.1 (IBM/HashiCorp) | Stacks, Ephemeral resources, HCP Terraform enterprise | Existing HCP Terraform / Enterprise shops |
| **Terragrunt** | HCL wrapper | MIT | DRY backend/provider generation, DAG `run-all` across accounts/envs | Multi-account AWS/GCP OpenTofu/Terraform fleets |
| **Pulumi** | TypeScript, Python, Go, C# | Apache-2.0 | Real loops/tests/types, **Automation API**, CrossGuard policies, ESC secrets | App-heavy teams, dynamic IDPs, complex logic |
| **Crossplane** | Kubernetes CRDs | Apache-2.0 (CNCF) | Continuous reconciliation & self-service IDP Claims | Developer-facing cloud resources on K8s |

---

## **2. OpenTofu — Key Capabilities & Migration**

### Client-Side End-to-End State Encryption (OpenTofu Exclusive!)
Encrypts both your **state file** and **saved plan files** client-side using AWS KMS, GCP KMS, OpenBao/Vault, or PBKDF2 *before* uploading to S3/GCS — protecting secrets even if an S3 bucket is misconfigured:

```hcl
terraform {
  encryption {
    key_provider "aws_kms" "state_key" {
      kms_key_id = "arn:aws:kms:us-east-1:123456789012:key/1234abcd-5678-ef90-1234-567890abcdef"
      region     = "us-east-1"
    }

    method "aes_gcm" "encrypted" {
      keys = key_provider.aws_kms.state_key
    }

    state {
      method   = method.aes_gcm.encrypted
      enforced = true                      # Refuses to read/write unencrypted state!
    }

    plan {
      method   = method.aes_gcm.encrypted
      enforced = true
    }
  }
}
```

### Dynamic Backend & Module Source Evaluation (Early Variable Eval)
Unlike legacy Terraform, OpenTofu allows variables and locals inside `backend {}` and `module.source`:

```hcl
variable "env" { type = string }

terraform {
  backend "s3" {
    bucket         = "acme-tfstate-${var.env}"
    key            = "network/terraform.tfstate"
    region         = "us-east-1"
    use_lockfile   = true                  # Native S3 state locking (no DynamoDB table needed!)
    encrypt        = true
  }
}
```

### Safe Zero-Downtime Migration from Terraform → OpenTofu

```bash
# 1. Backup existing remote state FIRST:
terraform state pull > backup-pre-tofu.tfstate

# 2. Switch CLI & re-initialize against the OpenTofu Registry (registry.opentofu.org):
tofu init -upgrade

# 3. Verify ZERO unintended infrastructure changes:
tofu plan                                  # Should report: "No changes. Your infrastructure matches..."

# 4. Daily commands are 1:1 drop-in replacements:
tofu fmt -check -recursive
tofu validate
tofu plan -out=tfplan
tofu apply tfplan
tofu test                                  # Built-in declarative .tftest.hcl unit/integration tests!
```

---

## **3. Terragrunt — DRY Multi-Account / Multi-Region Orchestration**

Eliminate copy-pasted `backend.tf` and `provider.tf` across 40 AWS accounts and 150 root modules:

```text
infra-live/
├── root.hcl                               # Generates backend + provider ONCE for entire repo
├── prod/
│   ├── account.hcl                        # aws_account_id = "111122223333"
│   └── us-east-1/
│       ├── region.hcl                     # aws_region = "us-east-1"
│       ├── vpc/terragrunt.hcl
│       ├── eks/terragrunt.hcl             # depends_on ../vpc automatically!
│       └── rds/terragrunt.hcl
└── staging/
    └── us-east-1/...
```

### `root.hcl`

```hcl
locals {
  account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl"))
  region_vars  = read_terragrunt_config(find_in_parent_folders("region.hcl"))
  aws_region   = local.region_vars.locals.aws_region
  account_name = local.account_vars.locals.account_name
}

remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket       = "acme-state-${local.account_name}"
    key          = "${path_relative_to_include()}/terraform.tfstate"
    region       = local.aws_region
    use_lockfile = true
    encrypt      = true
  }
}
```

### `prod/us-east-1/eks/terragrunt.hcl`

```hcl
include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "git::https://github.com/acme/infra-modules.git//eks?ref=v3.4.0"
}

dependency "vpc" {
  config_path = "../vpc"
  mock_outputs = {
    vpc_id          = "vpc-mock"
    private_subnets = ["subnet-1", "subnet-2"]
  }
}

inputs = {
  cluster_name    = "prod-us-east-1"
  vpc_id          = dependency.vpc.outputs.vpc_id
  private_subnets = dependency.vpc.outputs.private_subnets
}
```

```bash
# Run plan/apply across an entire region in dependency DAG order using OpenTofu:
TG_TF_PATH=tofu terragrunt run-all plan --terragrunt-working-dir prod/us-east-1
TG_TF_PATH=tofu terragrunt run-all apply --terragrunt-working-dir prod/us-east-1
```

---

## **4. Pulumi — Real-Language IaC (TypeScript Example)**

Use native loops, conditionals, strong typing, unit tests (`vitest`/`jest`), and reusable `ComponentResource` abstractions:

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const config = new pulumi.Config();
const env = pulumi.getStack();             // dev | staging | prod

// Reusable typed abstraction (like a module, with IDE autocomplete + unit tests):
export class SecureBucket extends pulumi.ComponentResource {
  public readonly bucketArn: pulumi.Output<string>;

  constructor(name: string, args: { retentionDays: number }, opts?: pulumi.ComponentResourceOptions) {
    super("acme:storage:SecureBucket", name, {}, opts);

    const bucket = new aws.s3.BucketV2(`${name}-bucket`, {
      tags: { Environment: env, ManagedBy: "pulumi" },
    }, { parent: this });

    new aws.s3.BucketPublicAccessBlock(`${name}-pab`, {
      bucket: bucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    }, { parent: this });

    new aws.s3.BucketServerSideEncryptionConfigurationV2(`${name}-sse`, {
      bucket: bucket.id,
      rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "aws:kms" } }],
    }, { parent: this });

    this.bucketArn = bucket.arn;
    this.registerOutputs({ bucketArn: this.bucketArn });
  }
}

const logsBucket = new SecureBucket("audit-logs", { retentionDays: 90 });
export const auditBucketArn = logsBucket.bucketArn;
```

### Essential Pulumi CLI Commands

```bash
pulumi stack select prod                   # Switch environment stack
pulumi config set --secret dbPassword xxx  # Encrypted stack secret
pulumi preview --diff                      # Detailed change preview (like plan)
pulumi up --yes                            # Apply changes
pulumi refresh                             # Reconcile drift from cloud API into state
pulumi import aws:s3/bucketV2:BucketV2 legacy my-existing-bucket
```

---

## **5. Production IaC Best Practices (2026)**

- **Never run `apply` from laptops** — Run plans on PRs and applies on merge via OIDC-authenticated CI (GitHub Actions / Spacelift / Env0 / Atlantis / Digger).
- **Split blast radius** — Keep state small & layered (`01-network` → `02-cluster` → `03-databases` → `04-apps`), never one 2,000-resource monolith state!
- **Enable S3 Native Locking (`use_lockfile = true`)** in OpenTofu 1.10+ / Terraform 1.10+ to retire legacy DynamoDB lock tables.
- **Schedule daily drift detection** (`tofu plan -detailed-exitcode` — exit code `2` alerts Slack/PagerDuty on out-of-band console changes).
- **Pin exact module & provider versions** (`.terraform.lock.hcl` committed to Git) and scan with `trivy config` / `checkov` on every PR.
