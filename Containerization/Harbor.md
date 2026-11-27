---
title: Harbor
description: Harbor open-source container registry cheatsheet covering install, projects, RBAC, replication, vulnerability scanning, image signing, retention, robot accounts and operations.
---

# Harbor

Harbor is a CNCF-graduated, open-source registry that stores, signs and scans container images and OCI artifacts (Helm charts, SBOMs, signatures). It adds what a plain registry lacks: projects, RBAC, vulnerability scanning, replication, retention and audit logs.

## 1. Architecture at a glance

| Component | Role |
|---|---|
| Core | API, auth, projects, RBAC, policy engine |
| Portal | Web UI |
| Registry | Distribution-based image storage |
| Job service | Replication, GC, scan and retention jobs |
| Trivy adapter | Vulnerability scanning (default scanner) |
| Database / Redis | PostgreSQL for metadata, Redis for cache and job queues |
| Proxy (nginx) | TLS termination and routing |

## 2. Install

```bash
# Online installer (Docker Compose)
tar xzvf harbor-online-installer-*.tgz && cd harbor
cp harbor.yml.tmpl harbor.yml
# Edit hostname, https cert/key, harbor_admin_password, data_volume
sudo ./install.sh --with-trivy

# Helm on Kubernetes
helm repo add harbor https://helm.goharbor.io
helm upgrade --install harbor harbor/harbor \
  --namespace harbor --create-namespace \
  --set expose.type=ingress \
  --set expose.ingress.hosts.core=registry.example.com \
  --set externalURL=https://registry.example.com \
  --set persistence.enabled=true
```

## 3. Daily Docker workflow

```bash
docker login registry.example.com
docker tag myapp:1.0 registry.example.com/team-a/myapp:1.0
docker push registry.example.com/team-a/myapp:1.0
docker pull registry.example.com/team-a/myapp:1.0

# Pull-through proxy cache project (Docker Hub)
docker pull registry.example.com/dockerhub-proxy/library/nginx:stable
```

## 4. Projects, RBAC and robot accounts

| Role | Can do |
|---|---|
| Project admin | Manage members, policies and settings |
| Maintainer | Push, pull, scan, delete artifacts |
| Developer | Push and pull |
| Guest | Pull only |
| Limited guest | Pull without browsing the repository list |

Use robot accounts for CI/CD instead of personal credentials. Scope them to one project, grant only `push` or `pull`, and set an expiry.

```bash
# Login in CI with a robot account (name looks like robot$project+ci)
echo "$HARBOR_ROBOT_SECRET" | docker login registry.example.com \
  -u 'robot$team-a+ci' --password-stdin
```

## 5. API quick reference

```bash
H=https://registry.example.com/api/v2.0

curl -u admin:"$PASS" "$H/projects"
curl -u admin:"$PASS" "$H/projects/team-a/repositories"
curl -u admin:"$PASS" "$H/projects/team-a/repositories/myapp/artifacts?with_scan_overview=true"

# Trigger a scan
curl -u admin:"$PASS" -X POST \
  "$H/projects/team-a/repositories/myapp/artifacts/1.0/scan"

# Health
curl -s "$H/health"
```

## 6. Vulnerability scanning and policy

- Scan on push per project, so every new image gets a report.
- Enable **Prevent vulnerable images from running** with a severity threshold (for example High) to block pulls of risky images.
- Add a **CVE allowlist** only for reviewed, time-boxed exceptions.
- Re-scan regularly; new CVEs appear against images that have not changed.

## 7. Signing and SBOM

```bash
# Sign with cosign (Sigstore) and push the signature next to the image
cosign sign registry.example.com/team-a/myapp:1.0
cosign verify registry.example.com/team-a/myapp:1.0 \
  --certificate-identity-regexp '.*' --certificate-oidc-issuer-regexp '.*'
```

Enable **Cosign/Notation deployment security** on the project to allow only signed images to be pulled. Harbor also stores SBOM artifacts attached to an image.

## 8. Replication and proxy cache

| Feature | Use it for |
|---|---|
| Push-based replication | Mirror production images to a DR or edge registry |
| Pull-based replication | Pull approved upstream images into your registry |
| Proxy cache project | Cache Docker Hub, GHCR or Quay pulls and avoid rate limits |
| Filters | Replicate only matching repositories, tags or labels |
| Schedule / event-based | Run on a cron schedule or when an image is pushed |

Proxy cache is also useful in air-gapped and rate-limited environments.

## 9. Retention, immutability and garbage collection

- **Tag retention** keeps the last N pushed or pulled tags and removes the rest; always dry-run first.
- **Tag immutability** stops anyone from overwriting a tag such as `v1.2.3` or `release-*`.
- Deleting artifacts only unreferences blobs. Run **Garbage Collection** to reclaim disk space, and schedule it off-peak.
- Quotas per project cap storage and prevent one team from filling the volume.

## 10. Kubernetes usage

```bash
kubectl create secret docker-registry harbor-pull \
  --docker-server=registry.example.com \
  --docker-username='robot$team-a+k8s-pull' \
  --docker-password="$HARBOR_ROBOT_SECRET" \
  -n my-namespace
```

```yaml
spec:
  imagePullSecrets:
    - name: harbor-pull
  containers:
    - name: app
      image: registry.example.com/team-a/myapp:1.0
```

## 11. Operations and troubleshooting

| Symptom | Check |
|---|---|
| `x509: certificate signed by unknown authority` | Install the CA on Docker/containerd hosts, for example `/etc/docker/certs.d/<host>/ca.crt` |
| `unauthorized: authentication required` | Expired robot account, wrong project scope or an expired CLI secret |
| Push fails with `413` | Raise `client_max_body_size` on the ingress or proxy in front of Harbor |
| Disk keeps growing | Run GC, check retention rules and project quotas |
| Scan stuck in `Queued` | Check the Trivy adapter and job service pods or containers, and the vulnerability DB download |
| Components unhealthy | `curl /api/v2.0/health`, then `docker compose ps` or `kubectl -n harbor get pods` |

```bash
# Back up before upgrades: database, registry data and harbor.yml
docker compose -f /opt/harbor/docker-compose.yml ps
docker compose -f /opt/harbor/docker-compose.yml logs --tail=100 core
```

## 12. Production checklist

- Terminate TLS with a trusted certificate and use a real hostname.
- Use external PostgreSQL, Redis and object storage (S3, GCS or Azure Blob) for high availability.
- Enable OIDC/LDAP SSO and limit local admin use.
- One project per team, robot accounts for automation, immutability on release tags.
- Scan on push, block high-severity pulls, sign release images.
- Schedule retention and GC, and monitor `/metrics` with Prometheus.
- Back up the database and registry storage regularly and test restores.
