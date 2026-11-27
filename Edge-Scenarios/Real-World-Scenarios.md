# 🧩 Real-World Edge Scenarios — The Scenario Bank

**Situations nobody teaches until you've hit them.** Organized by domain — each is "problem → root cause → fix" so you can pattern-match in production *and* in interviews.

---

## **1. Docker Scenarios**

**Deploy an app on a server with no internet.**
→ `docker save -o img.tar app:tag` on connected box → copy → `docker load` offline. See `Air-Gapped-Deployments.md` for the full recipe including offline registries and pre-fetched dependencies.

**Container "works on my machine" but not the server.**
→ Architecture mismatch (built ARM64/Mac, deployed amd64). `docker buildx build --platform linux/amd64` and push a multi-arch manifest. Or: env-specific config baked into the image — config belongs in env/volumes, not layers.

**Container dies instantly on start.**
→ `docker logs <id>` first, then `docker inspect` `State.ExitCode`: 137 = OOMKill, 1 = app error, 126/127 = entrypoint not executable/not found. `docker run --entrypoint sh img` to get inside.

**Docker disk usage exploded.**
→ `docker system df` shows images/containers/volumes. `docker system prune -a` reclaims; the real culprit is usually logs (`json-file` with no rotation — set `log-opts max-size`) or leaked volumes from `-v` mounts.

**Can't reach app from outside the host.**
→ App bound to `127.0.0.1` inside container (only sees its own loopback) — bind `0.0.0.0`. Then check port mapping `-p`, host firewall, and that it's on the right docker network.

**Image has a secret baked in.**
→ `COPY`/`ADD`d secrets live in layers even if deleted later. Rotate the secret, rebuild properly (BuildKit `--mount=type=secret`), and treat the image as compromised.

---

## **2. Kubernetes Scenarios**

**`CrashLoopBackOff` — the #1 pod failure.**
→ `kubectl logs pod --previous` (crashed container's logs) + `kubectl describe pod` (events). Ranked causes: app crash > failing liveness probe > bad config/secret > OOM > entrypoint error.

**`ImagePullBackOff`.**
→ Image doesn't exist/tag typo, private registry auth missing (`imagePullSecrets`), rate-limited by Docker Hub (mirror through your registry), or no network path to registry (air-gap: preload `ctr images import`).

**`Pending` forever.**
→ `kubectl describe pod` events name it: insufficient resources (requests > free), unbound PVC, taints without tolerations, nodeSelector matching nothing.

**Service reachable inside cluster, not outside.**
→ Type is `ClusterIP` — need `NodePort`/`LoadBalancer`/Ingress. Or Ingress controller has no LB / wrong ingressClass. `kubectl get svc,ep,ingress` and check endpoints have pod IPs.

**Pod healthy but getting no traffic.**
→ Readiness probe failing → pod stays out of Service endpoints. `kubectl get endpoints <svc>` — empty = probe or selector label mismatch.

**"It worked until the node restarted."**
→ No `requests/limits` → QoS BestEffort, first evicted. Or pod data lived on node-local storage instead of a PVC.

**etcd losing quorum in a 2-node control plane.**
→ 2 members = quorum of 2 — one failure = outage. Always odd numbers (3 or 5) for etcd/control-plane.

---

## **3. CI/CD Scenarios**

**Pipeline passed but prod is broken.**
→ The pipeline tested something different than what prod runs: `latest` tag moved between build and deploy (pin by digest), environment config drift, or tests only ran against mocks.

**Secrets leaked into CI logs.**
→ Rotate first, then fix: mask variables (GitLab `masked`, GitHub `secrets.*` auto-masks), don't `echo`/`cat` them, use OIDC instead of stored creds where possible.

**Deploy flapping between versions.**
→ Two controllers fighting — e.g., GitOps (Argo) vs a manual `kubectl edit` loop, or HPA scaling fighting a fixed replica count. One source of truth.

**Rollback that isn't a rollback.**
→ "Roll back" that just redeploys the current broken commit — you need the *previous artifact* (image tag/digest or deployment revision), not `main` rebuilt.

**Cache poisoning a pipeline.**
→ Dependency cache keyed wrong (not by lockfile) → stale deps pass tests. Or a compromised dep got cached. Clear by lockfile-hash keying + periodic cache eviction.

---

## **4. Linux Scenarios**

**"Disk full" but `df` shows space.**
→ Inode exhaustion (`df -i`) — millions of tiny files. Or deleted-file-held-open: `lsof +L1` finds the process holding the deleted space.

**Process won't die with `kill -9`.**
→ `D` state (uninterruptible IO) — stuck syscall, usually NFS/disk. Signal queues until IO returns; fix the underlying storage.

**Server slow, CPU looks fine.**
→ IO wait / swap / CPU throttling in cgroup. Check `vmstat` (`wa`, `si/so`), `iostat`, and `cat /sys/fs/cgroup/.../cpu.stat` (`nr_throttled` — the hidden container throttle).

**"Too many open files."**
→ `ulimit -n` default 1024 hit by sockets+files. `ls /proc/<pid>/fd | wc -l` to confirm; `LimitNOFILE=` in systemd unit (not shell profile — doesn't apply to services).

**Service starts at boot but dies randomly.**
→ OOM-killed (`dmesg | grep -i oom`), or restart policy wrong (`Restart=on-failure` vs `always`), or it depends on network (`After=network-online.target` missing).

---

## **5. Networking Scenarios**

**TLS works in browser, fails in curl/app.**
→ Missing intermediate cert (browsers fetch/chain; curl doesn't) — `openssl s_client` shows `unable to verify first certificate`. Or SNI missing for multi-cert hosts.

**Works in VPN, not outside (or vice versa).**
→ Split-horizon DNS — private endpoints (AWS PrivateLink/Azure Private Endpoint) resolve differently inside vs outside. `dig` both sides.

**Connections die after ~5 minutes idle.**
→ LB/NAT idle timeout (ALB 60s, NAT gateway 350s) killing the conn — enable TCP keepalive or app heartbeats under the timeout.

**Small requests fine, large ones hang mid-transfer.**
→ MTU/PMTUD — tunnel overhead shrinks path MTU, ICMP needed for discovery is blocked → packet blackhole. `ping -M do -s 1472` tests; fix = MSS clamp or lower MTU.

**Random DNS failures under load.**
→ conntrack table full on the node (`nf_conntrack: table full`) or UDP DNS packet loss — TCP DNS fallback hides it. Also: single resolver dependency.

**Service resolves but connection refused.**
→ DNS fine, nothing listening — or listening on wrong interface (`ss -tulpn`), or a security group allowing the IP but the app bound to `127.0.0.1`.

---

## **6. IAM / Identity Scenarios**

**"Access denied" right after granting access.**
→ Propagation delay (IAM eventual consistency, RBAC in Azure takes minutes). Or — the deny is a *different* layer: SCP/deny policy, permission boundary, resource policy.

**Token works in test, 401s in prod.**
→ Wrong audience (`aud` claim), wrong issuer, expired token + clock skew, or a different realm/tenant. Decode the JWT (`jwt.io` / `jwt decode`) — claims tell the story.

**Service-to-service auth broken after rotation.**
→ Old token still cached in the client app — JWTs are valid until expiry even after the secret rotates. Dual-credential rotation period needed.

**SSO login loops back to login.**
→ Redirect URI mismatch (must match *exactly* incl. trailing slash), `state`/`nonce` mismatch, or cookie `SameSite` blocking the return post.

**Privileged account needs emergency access — how?**
→ Break-glass account: vaulted creds, monitored usage, MFA'd, exempt from SSO dependencies (it must work when IdP is down). Test it quarterly — a break-glass that doesn't work when needed is a liability.

**Workload needs cloud API access with no stored keys.**
→ Workload identity federation: OIDC token → STS. AWS EKS Pod Identity / IRSA, Azure Workload Identity, GCP Workload Identity Federation, GitHub Actions → `sts:AssumeRoleWithWebIdentity`. The modern answer to "where do I put the AWS key?" — nowhere.

---

## **7. Platform Engineering, GitOps & IaC Edge Scenarios (2026)**

**Argo CD constantly flips between `Synced` and `OutOfSync` every 3 minutes.**
→ Controller fight: HPA/KEDA mutates `spec.replicas` while Git hardcodes a static replica count, OR a mutating webhook injects annotations. Remove `replicas` from Git for autoscaled apps, enable `ServerSideApply=true`, and configure `ignoreDifferences`.

**OpenTofu/Terraform wants to destroy and recreate your production RDS database after renaming a module.**
→ Changing a resource address looks like delete + create to IaC. Add a declarative `moved { from = ... to = ... }` block to migrate state cleanly with zero downtime, and keep `lifecycle { prevent_destroy = true }` on every stateful resource.

**Karpenter won't drain or upgrade an underutilized node for hours.**
→ Check `kubectl get pdb -A | awk '$5 == 0'`. A `replicas: 1` Deployment paired with `minAvailable: 1` (or `maxUnavailable: 0`) leaves zero allowed disruptions and deadlocks every voluntary drain.

**Rolling deploy causes 1–3 seconds of `502 Bad Gateway` errors despite `maxUnavailable: 0`.**
→ `kubelet` sends `SIGTERM` faster than `EndpointSlice` updates reach `kube-proxy`/Envoy/ALB. Add `lifecycle.preStop.exec: ["sh", "-c", "sleep 10"]` and handle `SIGTERM` gracefully. See the visual breakdown in [Kubernetes Edge Cases](./Kubernetes-Edge-Cases.md).

---

## **8. Databases, Queues & Observability Edge Scenarios**

**Autoscaling pods from 10 → 60 during a traffic spike crashes PostgreSQL instead of helping.**
→ Every pod opened its own 20-connection pool (`60 × 20 = 1,200` connections > `max_connections`). Put **PgBouncer** (`transaction` mode) or **AWS RDS Proxy** in front of Postgres and set `statement_timeout`.

**Prometheus or Loki OOMKills overnight after an ordinary feature release.**
→ High-cardinality label explosion (`user_id`, `trace_id`, or unnormalized `/orders/12345` URL paths added as a metric/log label). Put high-cardinality IDs in **Loki Structured Metadata** or log bodies — never in labels — and enforce collector relabeling caps.

**Kafka consumer lag climbs endlessly while pods look healthy with zero restarts.**
→ Rebalance storm: batch processing exceeded `max.poll.interval.ms` (5m), causing the broker to evict the consumer and loop forever. Lower `max.poll.records`, switch to `CooperativeStickyAssignor`, and route poison pills to a Dead Letter Topic.

**Random 5-second latency spikes on external API calls inside Kubernetes.**
→ Default `ndots:5` amplifies every external lookup into 8–10 UDP queries, saturating Linux `nf_conntrack` and dropping UDP DNS packets (triggering glibc's 5s timeout). Deploy **NodeLocal DNSCache** and set `ndots: 2`.

---

## **9. Visual Triage Flow & Deep Playbooks**

![First-10-Minutes Production Outage Triage Flowchart](/diagrams/edge-triage-decision-tree.svg)

| Deep-Dive Playbook | What's Covered (With Diagrams & Full Answers) |
| --- | --- |
| 🔥 [Production Outage Scenarios](./Production-Outage-Scenarios.md) | Retry amplification storms, CoreDNS/conntrack cascades, NAT SNAT exhaustion, cache stampedes, TLS chain failures, MTU blackholes |
| ☸️ [Kubernetes Production Edge Cases](./Kubernetes-Edge-Cases.md) | Rolling-update `502` race (`preStop`), CFS CPU throttling, stuck `Terminating` namespaces, RWO Multi-Attach, exit codes, AZ routing |
| ☁️ [Cloud, IaC & Security Edge Cases](./Cloud-and-Security-Edge-Cases.md) | IaC state locks & `moved`, IAM SCP/boundary overrides, RDS DNS cache, Vault seal quorum loss, GPU `Xid 79` nodes, S3 lockouts |
| 🔌 [Air-Gapped Deployments](./Air-Gapped-Deployments.md) | Offline Docker/OCI mirroring, private Helm/apt/PyPI/npm mirrors, air-gapped K8s bootstrap |

---

## 📚 **Learning Resources & Hands-On Practice**

* 🧪 [Hands-On DevOps, Linux & Kubernetes Practice Labs (practice.atrivedi.online)](https://practice.atrivedi.online/)
* 🔗 [Kubernetes Troubleshooting Guide](https://kubernetes.io/docs/tasks/debug/)
* 📦 [Linux Debugging Tools (Brendan Gregg)](https://www.brendangregg.com/linuxperf.html)

