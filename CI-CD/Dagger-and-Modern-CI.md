# ⚡ Dagger, Reproducible Builds & Modern CI/CD Cheatsheet

Legacy YAML-based CI suffers from **"push-and-pray"** debugging (25 commits named `fix ci yaml`), vendor lock-in, and works-on-my-machine drift. In 2026, modern platform teams use **Dagger** (programmable containerized pipelines), **Devbox / Nix / Devcontainers** (bit-for-bit reproducible toolchains), **OIDC keyless auth**, and **BuildKit remote caching**.

---

## **1. Why Dagger + Programmable CI in 2026?**

```text
Legacy YAML CI:
  Laptop (macOS, Go 1.22, brew tools)  ≠  GitHub Actions (Ubuntu, Go 1.23, bash YAML)
  -> Debug by pushing commits & waiting 8 minutes per loop!

Dagger Engine (BuildKit DAG):
  dagger call test && dagger call build
  Runs the EXACT SAME containerized pipeline on your laptop, GitHub Actions, GitLab CI, or Jenkins!
```

| Dimension | Traditional YAML CI | Dagger + Containerized CI |
| --- | --- | --- |
| **Language** | Untyped YAML + brittle inline bash | Real TypeScript, Go, or Python with IDE types & unit tests |
| **Local Execution** | Impossible or fragile (`act`) | `dagger call build` runs identically locally and in CI |
| **Caching** | Manual cache key hashing (`hashFiles`) | Automatic content-addressed BuildKit DAG & volume caching |
| **Portability** | Locked into GitHub Actions / GitLab / Jenkins syntax | Thin 5-line CI shim calls `dagger call release` anywhere |

---

## **2. Dagger Module Example (TypeScript SDK)**

```typescript
// dagger/src/index.ts — Runs identically locally & in GitHub Actions / GitLab CI!
import { dag, Container, Directory, Secret, object, func } from "@dagger.io/dagger";

@object()
export class CheckoutCi {
  /** Build reusable base Go container with persistent module cache */
  private baseEnv(source: Directory): Container {
    return dag
      .container()
      .from("golang:1.23-alpine")
      .withMountedCache("/go/pkg/mod", dag.cacheVolume("go-mod"))
      .withMountedCache("/root/.cache/go-build", dag.cacheVolume("go-build"))
      .withDirectory("/src", source)
      .withWorkdir("/src");
  }

  /** Run unit & race tests locally or in CI */
  @func()
  async test(source: Directory): Promise<string> {
    return this.baseEnv(source)
      .withExec(["go", "test", "-race", "-cover", "./..."])
      .stdout();
  }

  /** Build minimal distroless production image & scan with Trivy */
  @func()
  async buildAndScan(source: Directory, tag: string): Promise<Container> {
    const binary = this.baseEnv(source)
      .withEnvVariable("CGO_ENABLED", "0")
      .withExec(["go", "build", "-ldflags=-s -w", "-o", "/out/checkout-api", "./cmd/api"])
      .file("/out/checkout-api");

    const prodImage = dag
      .container()
      .from("gcr.io/distroless/static-debian12:nonroot")
      .withFile("/checkout-api", binary)
      .withEntrypoint(["/checkout-api"]);

    // Scan built container directly inside the pipeline before publishing:
    const tarball = prodImage.asTarball();
    await dag
      .container()
      .from("aquasec/trivy:0.56.0")
      .withMountedFile("/tmp/image.tar", tarball)
      .withExec(["trivy", "image", "--input", "/tmp/image.tar", "--exit-code", "1", "--severity", "HIGH,CRITICAL"])
      .sync();

    return prodImage;
  }

  /** Publish image using runtime Secret (never baked into layers or logs!) */
  @func()
  async publish(source: Directory, tag: string, registryToken: Secret): Promise<string> {
    const img = await this.buildAndScan(source, tag);
    return img
      .withRegistryAuth("ghcr.io", "x-access-token", registryToken)
      .publish(`ghcr.io/acme/checkout-api:${tag}`);
  }
}
```

### Running Dagger Locally & in a 10-Line GitHub Actions Wrapper

```bash
# Run locally on your laptop (instant BuildKit cache!):
dagger call test --source=.
dagger call build-and-scan --source=. --tag=dev

# Run inside GitHub Actions (.github/workflows/ci.yml):
# - uses: dagger/dagger-for-github@v7
#   with:
#     verb: call
#     args: publish --source=. --tag=${{ github.sha }} --registry-token=env:GITHUB_TOKEN
```

---

## **3. Reproducible Dev & CI Toolchains (`devbox.json` & `devcontainer.json`)**

Eliminate *"my `kubectl` / `tofu` / `helm` / `go` version is different from CI"* forever:

### Devbox (Powered by Nix — Zero Nix Language Required!)

```json
{
  "$schema": "https://raw.githubusercontent.com/jetify-com/devbox/0.13.6/.schema/devbox.schema.json",
  "packages": [
    "go@1.23.4",
    "opentofu@1.8.8",
    "kubectl@1.32.0",
    "kubernetes-helm@3.16.4",
    "kustomize@5.5.0",
    "trivy@0.58.1"
  ],
  "shell": {
    "scripts": {
      "test": "go test -race ./...",
      "lint": "golangci-lint run ./..."
    }
  }
}
```

```bash
devbox shell                 # Instant isolated shell with exact pinned tools
devbox run test              # Runs identical test suite locally and in CI!
```

---

## **4. Fast Container Builds with BuildKit, Bake & Registry Caching**

Stop waiting 12 minutes for Docker builds in ephemeral CI runners:

```bash
# Buildx with OCI Registry Cache (mode=max caches ALL intermediate stages!):
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --cache-from type=registry,ref=ghcr.io/acme/checkout-api:buildcache \
  --cache-to type=registry,ref=ghcr.io/acme/checkout-api:buildcache,mode=max \
  --provenance=mode=max \
  --sbom=true \
  --push \
  -t ghcr.io/acme/checkout-api:${GIT_SHA} .
```

### Parallel Multi-Target Builds with `docker-bake.hcl`

```hcl
group "default" {
  targets = ["api", "worker"]
}

target "base" {
  platforms = ["linux/amd64", "linux/arm64"]
  attest    = ["type=sbom", "type=provenance,mode=max"]
}

target "api" {
  inherits = ["base"]
  target   = "api"
  tags     = ["ghcr.io/acme/checkout-api:${TAG}"]
}

target "worker" {
  inherits = ["base"]
  target   = "worker"
  tags     = ["ghcr.io/acme/checkout-worker:${TAG}"]
}
```

---

## **5. 2026 Modern CI/CD Security & Speed Checklist**

| Practice | Why It Matters in 2026 |
| --- | --- |
| **Pin GitHub Actions to full 40-char commit SHAs** | Tags (`@v4`) are mutable — supply-chain attacks hijack floating tags! |
| **Use OIDC Federated Auth (Zero Static Cloud Keys)** | Short-lived 15-min STS tokens replace leaked `AWS_SECRET_ACCESS_KEY` |
| **Emit SLSA Provenance + SBOM + Cosign Signature** | Required by Kyverno/Flux admission checks before production deploy |
| **Merge Queues (GitHub Merge Queue / Aviator / Mergify)** | Prevents broken `main` when two passing PRs conflict semantically |
| **Monorepo Affected-Only Execution (Bazel / Turborepo / Nx)** | Remote build cache + change graph keeps CI under 5 minutes at 500+ engineers |
| **Concurrency Cancel-in-Progress on PRs** | Cancels superseded PR runs immediately, saving 30–50% runner minutes |
