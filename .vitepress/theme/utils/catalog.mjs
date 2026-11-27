export const TRACKS = [
  { id: 'all', label: 'All Topics' },
  { id: 'core', label: 'Core & CI/CD' },
  { id: 'cloud-k8s', label: 'Cloud & K8s' },
  { id: 'ops-sec', label: 'Ops & Security' },
  { id: 'ai-career', label: 'AI & Career' },
]

export const CATEGORY_CATALOG = [
  { title: 'Fundamentals', track: 'core', keywords: 'linux vim nano shell bash networking distro kernel stack' },
  { title: 'Programming', track: 'core', keywords: 'bash python go golang scripting automation cli' },
  { title: 'Version Control & GitOps', track: 'core', keywords: 'git github gitlab bitbucket gerrit gitops' },
  { title: 'CI/CD Automation', track: 'core', keywords: 'jenkins github actions gitlab ci circleci harness jfrog dagger devbox nix buildkit pipelines canary blue green' },
  { title: 'Containers & Images', track: 'cloud-k8s', keywords: 'docker podman cri-o harbor distroless oci containerd dockerfile compose' },
  { title: 'Kubernetes', track: 'cloud-k8s', keywords: 'k8s kubectl helm kustomize k3s openshift gateway api karpenter keda autoscaling kyverno opa gatekeeper cel falco pods deployments' },
  { title: 'Platform Engineering', track: 'cloud-k8s', keywords: 'idp internal developer platform golden paths score backstage scaffolder crossplane xrd argocd argo rollouts flux eso external secrets cert-manager dora devex' },
  { title: 'Infrastructure as Code', track: 'cloud-k8s', keywords: 'iac terraform opentofu tofu terragrunt pulumi ansible chef puppet provisioning configuration' },
  { title: 'Cloud', track: 'cloud-k8s', keywords: 'aws azure gcp vpc subnet ipv4 eks iam ec2 s3 cloud' },
  { title: 'Networking & Service Mesh', track: 'cloud-k8s', keywords: 'cilium ebpf hubble tetragon istio linkerd envoy consul mesh proxy dns mtls' },
  { title: 'Web Servers & Hosting', track: 'core', keywords: 'nginx http errors 502 504 reverse proxy hosting vps ssl tls' },
  { title: 'Monitoring Tools', track: 'ops-sec', keywords: 'prometheus grafana elk elasticsearch logstash kibana beats datadog cloudwatch pagerduty nagios alerts' },
  { title: 'Observability', track: 'ops-sec', keywords: 'opentelemetry otel tracing metrics logs melt red use lgtm loki logql tempo traceql mimir thanos alloy pyroscope' },
  { title: 'SRE & Reliability', track: 'ops-sec', keywords: 'sre sli slo sla error budget burn rate sloth incident management postmortem blameless chaos mesh fis resilience disaster recovery dr velero etcd pitr backup capacity planning load testing k6' },
  { title: 'Security', track: 'ops-sec', keywords: 'iam identity zero trust spiffe spire oidc eks pod identity ssm tailscale trivy snyk sonarqube aquasec vault secrets compliance' },
  { title: 'DevSecOps', track: 'ops-sec', keywords: 'sast dast sca owasp zap iac security syft grype sigstore slsa sbom' },
  { title: 'Edge Scenarios', track: 'ops-sec', keywords: 'air-gapped offline incident troubleshooting production outages war room diagrams 502 prestop conntrack ndots retry storm nat gateway multi-attach pdb cfs throttling xid s3 lockout' },
  { title: 'AI, GenAI & FinOps', track: 'ai-career', keywords: 'ai ml llm rag agents aiops mlops finops cost cloud optimization gpu nvidia mig dra vllm sglang dcgm ttft inference' },
  { title: 'ALM', track: 'ai-career', keywords: 'jira tuleap agile sprint board ticketing lifecycle' },
  { title: 'Interview Prep', track: 'ai-career', keywords: 'interview questions fresher junior mid senior staff system design sre platform rapid fire revision career' },
]

export function normalizeQuery(query) {
  return String(query || '').trim().toLowerCase()
}

export function filterCategories(items, { track = 'all', query = '' } = {}) {
  const q = normalizeQuery(query)
  const terms = q ? q.split(/\s+/).filter(Boolean) : []

  return items.map((item, index) => {
    const meta = CATEGORY_CATALOG.find((entry) => entry.title === item.title)
    const itemTrack = meta?.track || 'core'
    const trackMatches = track === 'all' || itemTrack === track
    if (!trackMatches) return { index, visible: false, track: itemTrack }

    if (!terms.length) return { index, visible: true, track: itemTrack }

    const haystack = `${item.title || ''} ${item.details || ''} ${meta?.keywords || ''}`.toLowerCase()
    const queryMatches = terms.every((term) => haystack.includes(term))
    return { index, visible: queryMatches, track: itemTrack }
  })
}

export function countVisible(results) {
  return results.reduce((acc, item) => acc + (item.visible ? 1 : 0), 0)
}
