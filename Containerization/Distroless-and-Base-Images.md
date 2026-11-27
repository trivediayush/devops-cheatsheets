# 🧊 Distroless & Base Images — The Industry Sheet

**Your base image is 90% of your attack surface, image size, and CVE count.** This is the "nobody teaches this in a course" part — how to pick, harden, and ship production images.

---

## **1. The Base Image Zoo — Pick Deliberately**

| Base | Size | libc | Shell? | Package mgr? | Use when |
| --- | --- | --- | --- | --- | --- |
| `debian:bookworm` | ~120MB | glibc | ✅ | ✅ apt | Never for prod final stage |
| `debian:bookworm-slim` | ~75MB | glibc | ✅ | ✅ | Safe default — most compatible |
| `alpine` | ~5MB | **musl** | ✅ | ✅ apk | Tiny; musl DNS/syscalls quirks |
| `gcr.io/distroless/*` | ~20-50MB | glibc | ❌ | ❌ | Production — no shell, no CVEs to speak of |
| `scratch` | 0 | — | ❌ | ❌ | Static binaries only (Go/Rust) |
| `cgr.dev/chainguard/*` (Wolfi) | minimal | glibc | varies | apk | Zero-CVE supply-chain images |
| `registry.access.redhat.com/ubi*` | varies | glibc | ✅ | dnf | Enterprise/RHEL compliance |
| `mcr.microsoft.com/*` (Mariner/CBL) | slim | glibc | ✅ | tdnf | Azure-aligned base |

> [!IMPORTANT]
> **Rule of thumb:** `slim` if you need a package manager, `distroless` for glibc apps in prod, `scratch` for static Go/Rust binaries, `chainguard` when security team mandates it, `alpine` only if you actually verify musl compatibility.

---

## **2. Distroless — How to Actually Use It**

```dockerfile
# ---------- build stage: full toolchain ----------
FROM golang:1.23-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Static binary: CGO off, no dynamic libs needed
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server .

# ---------- runtime stage: nothing but the app ----------
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /app/server /server
USER nonroot                    # distroless ships a nonroot user (65532)
EXPOSE 8080
ENTRYPOINT ["/server"]
```

Distroless variants: `static` (truly nothing — for static binaries), `base` (glibc+ca-certs+tz), `cc` (base + libgcc), `java`, `nodejs`, `python3`. Tags: `:nonroot` always exists — use it.

### 🔹 The Gotchas (learned the hard way)

| Problem | Fix |
| --- | --- |
| **No shell** — can't `kubectl exec` in to debug | Run an ephemeral debug container: `kubectl debug -it pod --image=busybox --target=app`. Or build a `:debug` variant image (distroless has them — includes busybox). |
| No `ca-certificates` (scratch/static) | `COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/` or use `base` |
| No `tzdata` | Copy `/usr/share/zoneinfo` or use `base`/`cc` |
| DNS resolution differences (musl/alpine) | Alpine's musl resolver doesn't do search-domains fallback like glibc — "works on Debian, NXDOMAIN on Alpine" is this |
| Health checks (`HEALTHCHECK`/`wget`) | No shell/tools → health check must be your app's own endpoint; K8s probes hit the port directly anyway |

---

## **3. The Alpine Trap — musl vs glibc**

Alpine is tiny because it uses **musl libc** instead of glibc. Differences that bite:

* **DNS**: musl's resolver behaves differently (no `search`-domain expansion edge cases, parallel A/AAAA queries → some resolvers drop one → "flaky DNS only in Alpine").
* **Binaries**: glibc-compiled binaries don't run on musl (and vice versa). A wheel/artifact built for `manylinux` (glibc) fails on Alpine.
* **Perf edge cases**: musl's allocator/dns has historically been slower for some workloads.

Takeaway: alpine is fine for simple scripts/tools; for prod app images, `slim` or `distroless` is usually safer and barely bigger.

---

## **4. Multi-Stage — Per-Language Patterns**

```dockerfile
# ---- Node (prod deps only in final stage) ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER node
CMD ["node", "dist/index.js"]
```

```dockerfile
# ---- Java: JRE-only runtime, layered jar ----
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY . .
RUN ./mvnw -q package -DskipTests && java -Djarmode=layertools -jar target/app.jar extract

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY --from=build /app/dependencies/ ./
COPY --from=build /app/spring-boot-loader/ ./
COPY --from=build /app/application/ ./
USER 1000
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
```

```dockerfile
# ---- Python: venv copy (no pip in final image) ----
FROM python:3.12-slim AS build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim
COPY --from=build /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY . /app
WORKDIR /app
USER nobody
CMD ["python", "-m", "app"]
```

---

## **5. Layer Hygiene — Size & Security**

```dockerfile
# ❌ three layers, apt cache left in image
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# ✅ one layer — cache removed in the SAME layer it was added
RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
```

```dockerfile
# ❌ secrets persist in earlier layers even if "deleted"
COPY .env /app/.env
RUN rm /app/.env            # still extractable from layer history!

# ✅ BuildKit secret mount — never lands in a layer
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
```

* `.dockerignore` (`node_modules`, `.git`, `*.log`, `tests/`) — smaller context, faster builds, no accidental secret copies.
* Order Dockerfile least-changing → most-changing (deps before source) for cache hits.
* Pin versions: `FROM node:20.11.1-bookworm-slim` or by digest `@sha256:…` — `:latest` is a moving target.

---

## **6. Non-Root & Hardening Checklist**

```dockerfile
FROM node:20-slim
RUN groupadd -r app && useradd -r -g app -u 10001 app
COPY --from=build --chown=app:app /app /app
USER app                      # UID 10001 — not root, stable for PSP/PSA policies
```

- ✅ `USER` non-root, and set an explicit numeric UID (K8s `runAsUser` matching, works even without /etc/passwd entry)
- ✅ `readOnlyRootFilesystem: true` + `tmpfs` `/tmp` in K8s — distroless images make this easy
- ✅ Drop capabilities: `securityContext.capabilities.drop: ["ALL"]`
- ✅ No `latest` tags in prod; pin by digest
- ✅ Sign images (Cosign) + generate SBOM (Syft) — supply-chain basics
- ✅ Scan in CI: `trivy image --exit-code 1 --severity CRITICAL` — see DevSecOps sheet

---

## **7. Verify Your Work**

```bash
docker history <img>                 # layer sizes — find the fat layer
dive <img>                           # TUI: explore layers, see wasted space
docker run --rm --entrypoint "" <img> ls /     # what's actually inside
crane export <img> - | tar -tf - | head        # image contents without Docker
trivy image --severity HIGH,CRITICAL <img>     # CVE diff between bases — the killer argument
```

Size reality check (typical Node app): `node:20` full ≈ 1.0GB → `slim` multi-stage ≈ 150–250MB → `distroless` ≈ 100–180MB → `scratch`(static) ≈ 10–20MB. CVEs follow the same curve.

---

## 📚 **Learning Resources**

* 🔗 [Distroless Images (Google)](https://github.com/GoogleContainerTools/distroless)
* 📦 [Chainguard Images / Wolfi](https://edu.chainguard.dev/chainguard/chainguard-images/)
* 🛡️ [Dockerfile Best Practices](https://docs.docker.com/build/building/best-practices/)
* 🧪 [dive](https://github.com/wagoodman/dive) & [crane](https://github.com/google/go-containerregistry/tree/main/cmd/crane)
