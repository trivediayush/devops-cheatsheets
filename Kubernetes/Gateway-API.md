# 🚪 Kubernetes Gateway API Cheatsheet

**Gateway API** — the successor to Ingress. Ingress was one resource doing too many jobs; Gateway API splits it into **infrastructure** (Gateway, owned by platform teams) and **routes** (HTTPRoute etc., owned by app teams), with role-based separation and protocol extensibility built in.

---

## **1. Why Gateway API Over Ingress**

| Ingress | Gateway API |
| --- | --- |
| one resource — infra + routes mixed | Gateway (infra) + Routes (apps) — separate ownership |
| annotations for everything | first-class fields (no vendor annotations) |
| HTTP only | HTTP, TCP, UDP, gRPC, TLS routes |
| vague shared-hostname semantics | explicit listener hostname binding |
| LB per Ingress-ish | one Gateway, many routes share the LB |
| no cross-namespace rules | explicit `ReferenceGrant` for cross-ns access |

```text
The split that matters:
   Platform team:  GatewayClass + Gateway  ← owns the LB/entry point
   App team:       HTTPRoute + TCPRoute     ← owns what traffic goes where
```

---

## **2. The Objects**

```text
GatewayClass (cluster infra type: "istio", "nginx", "gke-l7")
     │
     ▼
Gateway (one instance: listeners :80/:443, hostname matching,
         TLS secrets — the actual entry point)
     │
     ▼
HTTPRoute / TCPRoute / GRPCRoute (attach to a Gateway listener,
                                  match host/path/headers → backend Service)
     │
     ▼
Service → pods
```

```yaml
# GatewayClass — provided by your implementation (istio/envoy/nginx-gateway):
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata: { name: istio }
spec:
  controllerName: istio.io/gateway-controller
```

```yaml
# Gateway — the infra side (platform team owns this):
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: prod-gateway
  namespace: gateway
spec:
  gatewayClassName: istio
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces: { from: Selector, selector:
          matchLabels: { gateway-access: "true" } }   # which namespaces may attach routes
    - name: https
      protocol: HTTPS
      port: 443
      hostname: "*.example.com"
      tls:
        mode: Terminate
        certificateRefs: [{ name: wildcard-cert }]
      allowedRoutes:
        namespaces: { from: All }
```

```yaml
# HTTPRoute — the app side (app team owns this):
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api
  namespace: app
spec:
  parentRefs:
    - name: prod-gateway        # attach to the Gateway
      namespace: gateway
      sectionName: https        # optional: specific listener
  hostnames: ["api.example.com"]
  rules:
    - matches:
        - path: { type: PathPrefix, value: /api }
        - headers: [{ name: x-version, value: v2 }]   # header match → canary/A-B
      backendRefs:
        - name: api-v2
          port: 8080
          weight: 10                                  # canary weight split!
        - name: api-v1
          port: 8080
          weight: 90
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs: [{ name: api, port: 8080 }]
      filters:
        - type: RequestHeaderModifier
          requestHeaderModifier:
            add: [{ name: x-env, value: prod }]
        - type: RequestRedirect                       # built-in redirect (no annotation!)
          requestRedirect:
            scheme: https
            statusCode: 301
```

---

## **3. Route Types — Pick Per Protocol**

```yaml
# GRPCRoute — gRPC service/method matching:
kind: GRPCRoute
spec:
  rules:
    - matches:
        - method: { service: myapp.UserService, method: GetUser }
      backendRefs: [{ name: user-svc, port: 9000 }]

# TLSRoute — SNI-based passthrough routing (TLS terminates at backend):
kind: TLSRoute
spec:
  parentRefs: [{ name: prod-gateway, sectionName: https }]
  hostnames: ["secure.example.com"]
  rules:
    - backendRefs: [{ name: backend, port: 443 }]

# TCPRoute / UDPRoute — L4 passthrough:
kind: TCPRoute
spec:
  rules:
    - backendRefs: [{ name: db, port: 5432 }]
```

---

## **4. Cross-Namespace — ReferenceGrant**

Routes in one namespace reaching services in another (or a Gateway in `gateway` ns serving routes from `app` ns) needs explicit permission — **ReferenceGrant** lives in the *target* namespace:

```yaml
# in the `app` namespace — allows gateway-ns routes to reach `api` svc:
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-gateway-to-api
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: app
  to:
    - group: ""
      kind: Service
      name: api
```

**The direction:** grant lives where the *target* resource is — the owner of the resource consents to being referenced.

---

## **5. Traffic Management — Built In**

```yaml
# Weighted split (canary without a mesh!):
backendRefs:
  - { name: stable, port: 80, weight: 90 }
  - { name: canary, port: 80, weight: 10 }

# Timeouts & retries (implementation-dependent):
filters:
  - type: ExtensionRef
    extensionRef: { group: ..., kind: BackendTrafficPolicy, name: policy }
```

```yaml
# The annotations you're now FREE of (Ingress-era):
# nginx.ingress.kubernetes.io/rewrite-target
# nginx.ingress.kubernetes.io/canary: "true"
# nginx.ingress.kubernetes.io/canary-weight: "10"
# → all become first-class spec fields in Gateway API
```

---

## **6. Implementations — Who Runs the Data Plane**

```bash
kubectl get gatewayclass              # which implementations are installed
kubectl describe gateway prod-gateway # the LB hostname/IP in status
kubectl get httproute -A              # all routes across namespaces
kubectl describe httproute api -n app # attachment status, resolution errors
```

| Implementation | Notes |
| --- | --- |
| **Istio** | mesh-native, the most complete Gateway API support |
| **Envoy Gateway** | standalone Envoy L7 gateway, CNCF project |
| **NGINX Gateway Fabric** | nginx-based |
| **Kong / Traefik / HAProxy** | LB-frontend focused |
| **Cilium** | eBPF data plane |
| **GKE / AWS LBC / Azure AppGW** | cloud LB integrations |

```bash
# Status tells you if it's actually working:
kubectl get gateway prod-gateway -o jsonpath='{.status.listeners[*].conditions}'
kubectl get httproute api -o jsonpath='{.status.parents[*].conditions}'
# Accepted=True + ResolvedRefs=True = route is live
```

---

## **7. Migration — Ingress → Gateway**

```bash
# ingress2gateway — the official converter:
ingress2gateway print --providers=ingress-nginx --input-file ingress.yaml
# → emits Gateway + HTTPRoute YAML to adapt
```

**Migration order:** GatewayClass + Gateway alongside Ingress → move routes one hostname at a time → validate → decommission Ingress. They coexist — Ingress still works and isn't deprecated, Gateway API is just the new standard.

---

## 📚 **Learning Resources**

* 🔗 [Gateway API Docs](https://gateway-api.sigs.k8s.io/)
* 📦 [Implementations](https://gateway-api.sigs.k8s.io/implementations/)
* 🛠️ [ingress2gateway](https://gateway-api.sigs.k8s.io/guides/migrating-from-ingress/) — the migration tool
