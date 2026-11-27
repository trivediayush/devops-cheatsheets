<script setup>
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'

const { page } = useData()

const brands = {
  'AI-ML/AI-Fundamentals.md': { name: 'AI & Machine Learning', icon: 'ai' },
  'AI-ML/AIOps-and-MLOps.md': { name: 'AIOps & MLOps', icon: 'ai' },
  'AI-ML/FinOps.md': { name: 'FinOps', icon: 'finops' },
  'AI-ML/GenAI-and-Agents.md': { name: 'Generative AI', icon: 'genai' },
  'AI-ML/GPU-and-LLM-Infrastructure.md': { name: 'GPU & LLM Infrastructure', icon: 'gpu' },
  'AI-ML/Using-LLMs-for-DevOps.md': { name: 'LLMs for DevOps', icon: 'llm' },
  'ALM/Jira.md': { name: 'Jira', icon: 'jira' },
  'ALM/Tuleap.md': { name: 'Tuleap', icon: 'agile' },
  'CI-CD/CircleCI.md': { name: 'CircleCI', icon: 'circleci' },
  'CI-CD/Dagger-and-Modern-CI.md': { name: 'Dagger & Modern CI', icon: 'dagger' },
  'CI-CD/Deployment-Strategies.md': { name: 'CI/CD Deployment', icon: 'devops' },
  'CI-CD/GitHub-Actions.md': { name: 'GitHub Actions', icon: 'github-actions' },
  'CI-CD/GitLab-CI.md': { name: 'GitLab CI', icon: 'gitlab' },
  'CI-CD/Harness.md': { name: 'Harness', icon: 'harness' },
  'CI-CD/Jenkins.md': { name: 'Jenkins', icon: 'jenkins' },
  'CI-CD/JFrog.md': { name: 'JFrog Artifactory', icon: 'jfrog' },
  'CI-CD/Reusable-Pipelines-README.md': { name: 'Reusable Pipelines', icon: 'github-actions' },
  'Cloud/AWS.md': { name: 'Amazon Web Services', icon: 'aws' },
  'Cloud/Azure.md': { name: 'Microsoft Azure', icon: 'azure' },
  'Cloud/GCP.md': { name: 'Google Cloud', icon: 'gcp' },
  'Cloud/Kubernetes-on-AWS.md': { name: 'Amazon EKS', icon: 'kubernetes' },
  'Cloud/Terraform-on-AWS.md': { name: 'Terraform on AWS', icon: 'terraform' },
  'Cloud/VPC-Subnets-and-IPv4.md': { name: 'AWS VPC & Subnetting', icon: 'aws' },
  'Containerization/CRI-O.md': { name: 'CRI-O', icon: 'crio' },
  'Containerization/Container-Internals.md': { name: 'Docker & Containers', icon: 'docker' },
  'Containerization/Distroless-and-Base-Images.md': { name: 'Docker Images', icon: 'docker' },
  'Containerization/Docker-Architecture.md': { name: 'Docker', icon: 'docker' },
  'Containerization/Docker-Daily-Ops.md': { name: 'Docker', icon: 'docker' },
  'Containerization/Docker.md': { name: 'Docker', icon: 'docker' },
  'Containerization/Harbor.md': { name: 'Harbor Registry', icon: 'harbor' },
  'Containerization/Podman.md': { name: 'Podman', icon: 'podman' },
  'DevSecOps/DAST.md': { name: 'OWASP DAST', icon: 'owasp' },
  'DevSecOps/DevSecOps.md': { name: 'DevSecOps', icon: 'devsecops' },
  'DevSecOps/IaC-Security.md': { name: 'Infrastructure Security', icon: 'kyverno' },
  'DevSecOps/OWASP-ZAP.md': { name: 'OWASP ZAP', icon: 'owasp' },
  'DevSecOps/SAST.md': { name: 'SAST', icon: 'sonarqube' },
  'DevSecOps/SCA.md': { name: 'Software Composition Analysis', icon: 'snyk' },
  'DevSecOps/Secrets-Scanning.md': { name: 'Secrets Scanning', icon: 'vault' },
  'DevSecOps/Sigstore.md': { name: 'Sigstore', icon: 'sigstore' },
  'DevSecOps/SLSA.md': { name: 'SLSA', icon: 'slsa' },
  'DevSecOps/Syft-and-Grype.md': { name: 'Anchore Syft & Grype', icon: 'syft' },
  'Edge-Scenarios/Air-Gapped-Deployments.md': { name: 'Air-Gapped Systems', icon: 'airgap' },
  'Edge-Scenarios/Cloud-and-Security-Edge-Cases.md': { name: 'Cloud & Security Edge Cases', icon: 'edge-scenarios' },
  'Edge-Scenarios/Kubernetes-Edge-Cases.md': { name: 'Kubernetes Edge Cases', icon: 'kubernetes' },
  'Edge-Scenarios/Production-Outage-Scenarios.md': { name: 'Production Outage Playbook', icon: 'edge-scenarios' },
  'Edge-Scenarios/Real-World-Scenarios.md': { name: 'Real-World Scenarios', icon: 'edge-scenarios' },
  'Fundamentals/Linux-Daily-Commands.md': { name: 'Linux', icon: 'linux' },
  'Fundamentals/Linux-Distributions.md': { name: 'Linux', icon: 'linux' },
  'Fundamentals/Linux-Internals.md': { name: 'Linux', icon: 'linux' },
  'Fundamentals/Modern-DevOps-Stack.md': { name: 'DevOps Stack', icon: 'platform' },
  'Fundamentals/Nano.md': { name: 'GNU Nano', icon: 'nano' },
  'Fundamentals/Networking-for-DevOps.md': { name: 'Networking', icon: 'cilium' },
  'Fundamentals/Vim.md': { name: 'Vim', icon: 'vim' },
  'Hosting/Hosting-Platforms.md': { name: 'Web Hosting', icon: 'digitalocean' },
  'Hosting/Nginx.md': { name: 'NGINX', icon: 'nginx' },
  'Hosting/Web-Server-Errors.md': { name: 'HTTP & Web Servers', icon: 'nginx' },
  'Infrastructure-Management/Ansible.md': { name: 'Ansible', icon: 'ansible' },
  'Infrastructure-Management/Chef.md': { name: 'Chef', icon: 'chef' },
  'Infrastructure-Management/OpenTofu-and-Pulumi.md': { name: 'OpenTofu, Terragrunt & Pulumi', icon: 'opentofu' },
  'Infrastructure-Management/Puppet.md': { name: 'Puppet', icon: 'puppet' },
  'Infrastructure-Management/Terraform.md': { name: 'Terraform', icon: 'terraform' },
  'Interview-Prep/Fresher-0-to-1-Years.md': { name: 'DevOps Interview Prep', icon: 'interview' },
  'Interview-Prep/Junior-1-to-2-Years.md': { name: 'DevOps Interview Prep', icon: 'interview' },
  'Interview-Prep/Mid-3-to-4-Years.md': { name: 'DevOps Interview Prep', icon: 'interview' },
  'Interview-Prep/Platform-and-SRE-System-Design.md': { name: 'Platform & SRE System Design', icon: 'platform' },
  'Interview-Prep/Rapid-Fire-Revision.md': { name: 'DevOps Interview Prep', icon: 'interview' },
  'Interview-Prep/Senior-5-Plus-Years.md': { name: 'DevOps Interview Prep', icon: 'interview' },
  'Kubernetes/Gateway-API.md': { name: 'Kubernetes Gateway API', icon: 'kubernetes' },
  'Kubernetes/Helm.md': { name: 'Helm', icon: 'helm' },
  'Kubernetes/K3s.md': { name: 'K3s', icon: 'k3s' },
  'Kubernetes/Karpenter-and-Autoscaling.md': { name: 'Karpenter & KEDA', icon: 'karpenter' },
  'Kubernetes/Kubernetes-Daily-Commands.md': { name: 'Kubernetes', icon: 'kubernetes' },
  'Kubernetes/Kubernetes-Distributions.md': { name: 'Kubernetes', icon: 'kubernetes' },
  'Kubernetes/Kubernetes-Internals.md': { name: 'Kubernetes', icon: 'kubernetes' },
  'Kubernetes/Kubernetes-Policy-and-Security.md': { name: 'Kyverno, OPA & Falco', icon: 'kyverno' },
  'Kubernetes/Kubernetes-Production-Ops.md': { name: 'Kubernetes', icon: 'kubernetes' },
  'Kubernetes/Kubernetes.md': { name: 'Kubernetes', icon: 'kubernetes' },
  'Kubernetes/Kustomize.md': { name: 'Kustomize', icon: 'kustomize' },
  'Kubernetes/OpenShift.md': { name: 'Red Hat OpenShift', icon: 'openshift' },
  'Monitoring/CloudWatch.md': { name: 'Amazon CloudWatch', icon: 'cloudwatch' },
  'Monitoring/Datadog.md': { name: 'Datadog', icon: 'datadog' },
  'Monitoring/ELK-Stack.md': { name: 'Elastic Stack', icon: 'elastic' },
  'Monitoring/Elastic-Beats.md': { name: 'Elastic Beats', icon: 'beats' },
  'Monitoring/Elasticsearch.md': { name: 'Elasticsearch', icon: 'elastic' },
  'Monitoring/Grafana.md': { name: 'Grafana', icon: 'grafana' },
  'Monitoring/Kibana.md': { name: 'Kibana', icon: 'kibana' },
  'Monitoring/Logstash.md': { name: 'Logstash', icon: 'logstash' },
  'Monitoring/Nagios.md': { name: 'Nagios', icon: 'incident' },
  'Monitoring/PagerDuty.md': { name: 'PagerDuty', icon: 'pagerduty' },
  'Monitoring/Prometheus.md': { name: 'Prometheus', icon: 'prometheus' },
  'Networking/Cilium-and-eBPF.md': { name: 'Cilium, Hubble & eBPF', icon: 'cilium' },
  'Networking/Consul.md': { name: 'HashiCorp Consul', icon: 'consul' },
  'Networking/Envoy.md': { name: 'Envoy Proxy', icon: 'envoy' },
  'Networking/Istio.md': { name: 'Istio', icon: 'istio' },
  'Networking/Linkerd.md': { name: 'Linkerd', icon: 'linkerd' },
  'Observability/Grafana-LGTM-Stack.md': { name: 'Grafana LGTM+P Stack', icon: 'loki' },
  'Observability/Observability-Concepts.md': { name: 'Observability', icon: 'opentelemetry' },
  'Observability/OpenTelemetry.md': { name: 'OpenTelemetry', icon: 'opentelemetry' },
  'Platform-Engineering/ArgoCD-and-Flux.md': { name: 'Argo CD & Flux v2', icon: 'argo' },
  'Platform-Engineering/Backstage.md': { name: 'Backstage Portal', icon: 'backstage' },
  'Platform-Engineering/Crossplane.md': { name: 'Crossplane', icon: 'crossplane' },
  'Platform-Engineering/External-Secrets-and-Cert-Manager.md': { name: 'ESO & cert-manager', icon: 'cert-manager' },
  'Platform-Engineering/Platform-Engineering-and-IDP.md': { name: 'Internal Developer Platforms', icon: 'platform' },
  'Programming/Bash.md': { name: 'GNU Bash', icon: 'bash' },
  'Programming/Go.md': { name: 'Go', icon: 'go' },
  'Programming/Python.md': { name: 'Python', icon: 'python' },
  'Security/AquaSec.md': { name: 'Aqua Security', icon: 'aquasec' },
  'Security/HashiCorp-Vault.md': { name: 'HashiCorp Vault', icon: 'vault' },
  'Security/IAM-and-Identity.md': { name: 'Identity & Access Management', icon: 'security' },
  'Security/Snyk.md': { name: 'Snyk', icon: 'snyk' },
  'Security/SonarQube.md': { name: 'SonarQube', icon: 'sonarqube' },
  'Security/Trivy.md': { name: 'Trivy', icon: 'trivy' },
  'Security/Zero-Trust-and-Workload-Identity.md': { name: 'Zero-Trust & SPIFFE', icon: 'spiffe' },
  'SRE/Capacity-Planning-and-Load-Testing.md': { name: 'Capacity Planning & k6', icon: 'k6' },
  'SRE/Chaos-Engineering-and-Resilience.md': { name: 'Chaos Engineering', icon: 'chaos' },
  'SRE/Disaster-Recovery-and-Backup.md': { name: 'Disaster Recovery', icon: 'velero' },
  'SRE/Incident-Management-and-Postmortems.md': { name: 'Incident Management', icon: 'pagerduty' },
  'SRE/SLIs-SLOs-and-Error-Budgets.md': { name: 'SLIs, SLOs & Error Budgets', icon: 'sre' },
  'Version-Control/Bitbucket.md': { name: 'Bitbucket', icon: 'bitbucket' },
  'Version-Control/Gerrit.md': { name: 'Gerrit', icon: 'gerrit' },
  'Version-Control/GitHub.md': { name: 'GitHub', icon: 'github' },
  'Version-Control/GitLab.md': { name: 'GitLab', icon: 'gitlab' },
  'Version-Control/GitOps.md': { name: 'GitOps', icon: 'argo' },
}

const categoryDefaults = {
  'AI-ML': { name: 'AI & Machine Learning', icon: 'ai' },
  ALM: { name: 'Application Lifecycle Management', icon: 'agile' },
  'CI-CD': { name: 'CI/CD Automation', icon: 'github-actions' },
  Cloud: { name: 'Cloud Computing', icon: 'aws' },
  Containerization: { name: 'Containers', icon: 'docker' },
  DevSecOps: { name: 'DevSecOps', icon: 'devsecops' },
  'Edge-Scenarios': { name: 'Edge Scenarios', icon: 'edge-scenarios' },
  Fundamentals: { name: 'Linux & Systems', icon: 'linux' },
  Hosting: { name: 'Web Hosting', icon: 'nginx' },
  'Infrastructure-Management': { name: 'Infrastructure as Code', icon: 'terraform' },
  'Interview-Prep': { name: 'DevOps Interview Prep', icon: 'interview' },
  Kubernetes: { name: 'Kubernetes', icon: 'kubernetes' },
  Monitoring: { name: 'Monitoring', icon: 'prometheus' },
  Networking: { name: 'Networking & Service Mesh', icon: 'istio' },
  Observability: { name: 'Observability', icon: 'opentelemetry' },
  'Platform-Engineering': { name: 'Platform Engineering', icon: 'platform' },
  Programming: { name: 'Programming', icon: 'bash' },
  Security: { name: 'Security', icon: 'security' },
  SRE: { name: 'SRE & Reliability', icon: 'sre' },
  'Version-Control': { name: 'Version Control', icon: 'git' },
}

const rasters = new Set(['ai', 'genai', 'llm', 'devops', 'devsecops'])

const brand = computed(() => {
  const relativePath = page.value.relativePath || ''
  const pathParts = relativePath.split('/')
  return brands[relativePath] || categoryDefaults[pathParts[0]] || null
})

const categoryLabel = computed(() => {
  const relativePath = page.value.relativePath || ''
  const folder = relativePath.split('/')[0]
  return categoryDefaults[folder]?.name || ''
})

const showCategoryPrefix = computed(() => {
  return Boolean(categoryLabel.value && brand.value && categoryLabel.value !== brand.value.name)
})

const logoUrl = computed(() => brand.value?.icon
  ? withBase(`/icons/${brand.value.icon}.${rasters.has(brand.value.icon) ? 'png' : 'svg'}`)
  : '')

</script>

<template>
  <div v-if="brand" class="topic-brand" :aria-label="`${brand.name} topic`">
    <img
      v-if="logoUrl"
      :key="logoUrl"
      class="topic-brand__logo"
      :src="logoUrl"
      alt=""
      width="24"
      height="24"
      decoding="async"
    >
    <div class="topic-brand__meta">
      <template v-if="showCategoryPrefix">
        <span class="topic-brand__cat">{{ categoryLabel }}</span>
        <span class="topic-brand__sep" aria-hidden="true">/</span>
      </template>
      <span class="topic-brand__name">{{ brand.name }}</span>
    </div>
  </div>
</template>
