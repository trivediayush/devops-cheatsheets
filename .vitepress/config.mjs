import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Prefer an explicit public URL; Vercel's production domain is a safe automatic fallback
// even when the current build is a preview deployment.
const siteUrlValue = process.env.SITE_URL
  || process.env.VITEPRESS_SITE_URL
  || process.env.VERCEL_PROJECT_PRODUCTION_URL
  || 'https://devops.atrivedi.online'
const siteUrl = siteUrlValue
  ? new URL(/^https?:\/\//i.test(siteUrlValue) ? siteUrlValue : `https://${siteUrlValue}`)
    .toString()
    .replace(/\/+$/, '')
  : ''
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION || ''

// Display order + labels — arranged as a learning path, beginner → advanced.
// Folders not listed appear after, alphabetically.
const CATEGORY_META = {
  'Fundamentals': { icon: 'linux.svg', label: 'Fundamentals' },
  'Programming': { icon: 'bash.svg', label: 'Programming' },
  'Version-Control': { icon: 'git.svg', label: 'Version Control & GitOps' },
  'CI-CD': { icon: 'github-actions.svg', label: 'CI/CD Automation' },
  'Containerization': { icon: 'docker.svg', label: 'Containers & Images' },
  'Kubernetes': { icon: 'kubernetes.svg', label: 'Kubernetes' },
  'Platform-Engineering': { icon: 'platform.svg', label: 'Platform Engineering' },
  'Infrastructure-Management': { icon: 'terraform.svg', label: 'Infrastructure as Code' },
  'Cloud': { icon: 'aws.svg', label: 'Cloud Services' },
  'Networking': { icon: 'istio.svg', label: 'Networking & Service Mesh' },
  'Hosting': { icon: 'nginx.svg', label: 'Web Servers & Hosting' },
  'Monitoring': { icon: 'prometheus.svg', label: 'Monitoring Tools' },
  'Observability': { icon: 'opentelemetry.svg', label: 'Observability' },
  'SRE': { icon: 'sre.svg', label: 'SRE & Reliability' },
  'Security': { icon: 'security.svg', label: 'Security & Compliance' },
  'DevSecOps': { icon: 'devsecops.png', label: 'DevSecOps' },
  'Edge-Scenarios': { icon: 'edge-scenarios.svg', label: 'Edge Scenarios' },
  'AI-ML': { icon: 'ai.png', label: 'AI, GenAI & FinOps' },
  'ALM': { icon: 'agile.svg', label: 'Application Lifecycle Mgmt' },
  'Interview-Prep': { icon: 'interview.svg', label: 'Interview Prep' },
}

// Per-folder file order — beginner → advanced. Files not listed sort after, alphabetically.
const FILE_ORDER = {
  'Fundamentals': ['Linux-Daily-Commands.md', 'Vim.md', 'Nano.md', 'Linux-Distributions.md', 'Networking-for-DevOps.md', 'Linux-Internals.md', 'Modern-DevOps-Stack.md'],
  'Programming': ['Bash.md', 'Python.md', 'Go.md'],
  'Version-Control': ['GitHub.md', 'GitLab.md', 'Bitbucket.md', 'Gerrit.md', 'GitOps.md'],
  'CI-CD': ['GitHub-Actions.md', 'GitLab-CI.md', 'Jenkins.md', 'CircleCI.md', 'Harness.md', 'JFrog.md', 'Reusable-Pipelines-README.md', 'Deployment-Strategies.md', 'Dagger-and-Modern-CI.md'],
  'Containerization': ['Docker.md', 'Docker-Daily-Ops.md', 'Docker-Architecture.md', 'Container-Internals.md', 'Distroless-and-Base-Images.md', 'Harbor.md', 'Podman.md', 'CRI-O.md'],
  'Kubernetes': ['Kubernetes.md', 'Kubernetes-Daily-Commands.md', 'Kubernetes-Distributions.md', 'K3s.md', 'Kubernetes-Internals.md', 'Kubernetes-Production-Ops.md', 'Helm.md', 'Kustomize.md', 'Gateway-API.md', 'Karpenter-and-Autoscaling.md', 'Kubernetes-Policy-and-Security.md', 'OpenShift.md'],
  'Platform-Engineering': ['Platform-Engineering-and-IDP.md', 'Backstage.md', 'Crossplane.md', 'ArgoCD-and-Flux.md', 'External-Secrets-and-Cert-Manager.md'],
  'Infrastructure-Management': ['Terraform.md', 'OpenTofu-and-Pulumi.md', 'Ansible.md', 'Chef.md', 'Puppet.md'],
  'Cloud': ['AWS.md', 'VPC-Subnets-and-IPv4.md', 'Azure.md', 'GCP.md', 'Kubernetes-on-AWS.md', 'Terraform-on-AWS.md'],
  'Networking': ['Cilium-and-eBPF.md', 'Istio.md', 'Linkerd.md', 'Envoy.md', 'Consul.md'],
  'Hosting': ['Nginx.md', 'Web-Server-Errors.md', 'Hosting-Platforms.md'],
  'Monitoring': ['Prometheus.md', 'Grafana.md', 'Elastic-Beats.md', 'ELK-Stack.md', 'Elasticsearch.md', 'Logstash.md', 'Kibana.md', 'Datadog.md', 'CloudWatch.md', 'PagerDuty.md', 'Nagios.md'],
  'Observability': ['Observability-Concepts.md', 'OpenTelemetry.md', 'Grafana-LGTM-Stack.md'],
  'SRE': ['SLIs-SLOs-and-Error-Budgets.md', 'Incident-Management-and-Postmortems.md', 'Chaos-Engineering-and-Resilience.md', 'Disaster-Recovery-and-Backup.md', 'Capacity-Planning-and-Load-Testing.md'],
  'Security': ['IAM-and-Identity.md', 'Zero-Trust-and-Workload-Identity.md', 'Trivy.md', 'Snyk.md', 'SonarQube.md', 'HashiCorp-Vault.md', 'AquaSec.md'],
  'DevSecOps': ['DevSecOps.md', 'SAST.md', 'DAST.md', 'SCA.md', 'Secrets-Scanning.md', 'OWASP-ZAP.md', 'IaC-Security.md', 'Syft-and-Grype.md', 'Sigstore.md', 'SLSA.md'],
  'Edge-Scenarios': ['Real-World-Scenarios.md', 'Production-Outage-Scenarios.md', 'Kubernetes-Edge-Cases.md', 'Cloud-and-Security-Edge-Cases.md', 'Air-Gapped-Deployments.md'],
  'AI-ML': ['AI-Fundamentals.md', 'GenAI-and-Agents.md', 'Using-LLMs-for-DevOps.md', 'AIOps-and-MLOps.md', 'GPU-and-LLM-Infrastructure.md', 'FinOps.md'],
  'ALM': ['Jira.md', 'Tuleap.md'],
  'Interview-Prep': ['Fresher-0-to-1-Years.md', 'Junior-1-to-2-Years.md', 'Mid-3-to-4-Years.md', 'Senior-5-Plus-Years.md', 'Platform-and-SRE-System-Design.md', 'Rapid-Fire-Revision.md'],
}

const NAME_OVERRIDES = {
  'CRI-O': 'CRI-O',
  'ELK-Stack': 'ELK Stack',
  'OWASP-ZAP': 'OWASP ZAP',
  'DevSecOps': 'DevSecOps Overview',
  'IAM-and-Identity': 'IAM & Identity',
  'Zero-Trust-and-Workload-Identity': 'Zero-Trust & Workload Identity',
  'AIOps-and-MLOps': 'AIOps & MLOps',
  'GenAI-and-Agents': 'GenAI & Agents',
  'AI-Fundamentals': 'AI Fundamentals',
  'GPU-and-LLM-Infrastructure': 'GPU & LLM Infrastructure',
  'Shell-and-Bash': 'Shell & Bash',
  'Elastic-Beats': 'Elastic Beats',
  'Linux-Distributions': 'Linux Distributions',
  'Linux-Daily-Commands': 'Linux Daily Commands',
  'Docker-Daily-Ops': 'Docker Daily Ops',
  'Kubernetes-Daily-Commands': 'Kubernetes Daily Commands',
  'Kubernetes-Production-Ops': 'Kubernetes Production Ops',
  'Karpenter-and-Autoscaling': 'Karpenter, KEDA & Autoscaling',
  'Kubernetes-Policy-and-Security': 'K8s Policy (Kyverno, OPA, Falco)',
  'Kustomize': 'Kustomize',
  'Platform-Engineering-and-IDP': 'Platform Engineering & IDP',
  'Backstage': 'Backstage Portal',
  'Crossplane': 'Crossplane Control Plane',
  'ArgoCD-and-Flux': 'Argo CD, Rollouts & Flux v2',
  'External-Secrets-and-Cert-Manager': 'External Secrets & cert-manager',
  'OpenTofu-and-Pulumi': 'OpenTofu, Terragrunt & Pulumi',
  'Cilium-and-eBPF': 'Cilium, Hubble & eBPF',
  'Grafana-LGTM-Stack': 'Grafana LGTM+P Stack',
  'Dagger-and-Modern-CI': 'Dagger & Modern CI/CD',
  'SLIs-SLOs-and-Error-Budgets': 'SLIs, SLOs & Error Budgets',
  'Incident-Management-and-Postmortems': 'Incident Mgmt & Postmortems',
  'Chaos-Engineering-and-Resilience': 'Chaos Engineering & Resilience',
  'Disaster-Recovery-and-Backup': 'Disaster Recovery & Backups',
  'Capacity-Planning-and-Load-Testing': 'Capacity Planning & k6',
  'Platform-and-SRE-System-Design': 'Platform & SRE System Design',
  'Production-Outage-Scenarios': 'Production Outage Playbook',
  'Kubernetes-Edge-Cases': 'Kubernetes Edge Cases',
  'Cloud-and-Security-Edge-Cases': 'Cloud & Security Edge Cases',
  'Web-Server-Errors': 'Web Server Errors',
  'Hosting-Platforms': 'Hosting Platforms',
  'Vim': 'Vim',
  'Nano': 'Nano',
  'Jira': 'Jira',
  'GitOps': 'GitOps',
  'Using-LLMs-for-DevOps': 'Using LLMs for DevOps',
  'Deployment-Strategies': 'Deployment Strategies',
  'Reusable-Pipelines-README': 'Reusable Pipelines',
  'Modern-DevOps-Stack': 'Modern DevOps Stack',
  'Sigstore': 'Sigstore',
  'SLSA': 'SLSA',
  'Syft-and-Grype': 'Syft & Grype',
  'Gateway-API': 'Gateway API',
  'JFrog': 'JFrog Artifactory',
  'VPC-Subnets-and-IPv4': 'VPCs, Subnets & IPv4',
}

const titleFrom = f => {
  const stem = f.replace(/\.md$/, '')
  return NAME_OVERRIDES[stem] ?? stem.replace(/-/g, ' ')
}

const SKIP_DIRS = new Set(['node_modules', '.vitepress', '.git', 'docs'])

function scan() {
  const dirs = fs.readdirSync(srcDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_') && !SKIP_DIRS.has(d.name))
    .map(d => ({
      dir: d.name,
      files: fs.readdirSync(path.join(srcDir, d.name))
        .filter(f => f.endsWith('.md') && !f.startsWith('_'))
        .sort((a, b) => {
          const order = FILE_ORDER[d.name] ?? []
          const ia = order.indexOf(a), ib = order.indexOf(b)
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
        }),
    }))
    .filter(g => g.files.length)
  const order = Object.keys(CATEGORY_META)
  return dirs.sort((a, b) => {
    const ia = order.indexOf(a.dir), ib = order.indexOf(b.dir)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.dir.localeCompare(b.dir)
  })
}

const groups = scan()

// Small inline icon used in sidebar / nav labels (rendered as HTML by VitePress).
const iconTag = icon => `<img class="cat-ico" src="/icons/${icon}" alt="" width="18" height="18" loading="lazy" decoding="async"> `
const featureIcon = icon => ({ src: `/icons/${icon}`, width: 28, height: 28 })

const sidebar = groups.map(g => {
  const meta = CATEGORY_META[g.dir] ?? { icon: 'devops.png', label: titleFrom(g.dir + '.md') }
  return {
    text: `${iconTag(meta.icon)}${meta.label}`,
    collapsed: true,
    items: g.files.map(f => ({
      text: titleFrom(f),
      link: `/${g.dir}/${f.replace(/\.md$/, '')}`,
    })),
  }
})

const nav = [
  { text: 'Home', link: '/' },
  {
    text: 'Cheatsheets',
    items: groups.map(g => {
      const meta = CATEGORY_META[g.dir] ?? { icon: 'devops.png', label: titleFrom(g.dir + '.md') }
      return {
        text: `${iconTag(meta.icon)}${meta.label}`,
        link: `/${g.dir}/${g.files[0].replace(/\.md$/, '')}`,
      }
    }),
  },
  { text: 'Interview Prep', link: `/Interview-Prep/${(groups.find(g => g.dir === 'Interview-Prep')?.files[0] ?? 'README').replace(/\.md$/, '')}` },
  { text: 'Practice', link: 'https://practice.atrivedi.online/' },
  { text: 'About', link: '/about' },
]

function extractIntro(relativePath) {
  if (!relativePath || relativePath === 'index.md' || relativePath === 'about.md') return ''

  try {
    const source = fs.readFileSync(path.join(srcDir, relativePath), 'utf8')
      .replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')
    const lines = source.split(/\r?\n/)
    const blocks = []
    let current = []

    const flush = () => {
      if (current.length) blocks.push(current.join(' '))
      current = []
    }

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) {
        flush()
        continue
      }
      if (/^(#{1,6}\s|```|~~~|\|:?[-| ]+\||[-*_]{3,}$|<|>\s|[-*+]\s|\d+[.)]\s)/.test(line)) {
        flush()
        continue
      }
      current.push(line)
    }
    flush()

    for (const block of blocks) {
      const cleaned = block
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[\*_~]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (cleaned.length >= 45) return cleaned
    }
  } catch {
    // A missing or unreadable source page falls back to the category description.
  }
  return ''
}

function trimDescription(value, limit = 158) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= limit) return clean
  const clipped = clean.slice(0, limit - 1)
  const boundary = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, boundary > 95 ? boundary : limit - 1).trimEnd()}…`
}

function pageDescription(pageData) {
  const relativePath = pageData.relativePath || ''
  if (relativePath === 'index.md') {
    return trimDescription('Free DevOps cheatsheets for Docker, Kubernetes, CI/CD, cloud, Terraform, Linux, security, and monitoring. Practical commands, production guidance, and interview prep.')
  }

  if (relativePath === 'about.md') {
    return trimDescription('Explore the open-source DevOps Cheatsheets project: practical commands, architecture notes, production troubleshooting, and interview preparation for DevOps, SRE, and platform engineers.')
  }

  const suppliedDescription = pageData.frontmatter?.description
  if (typeof suppliedDescription === 'string' && suppliedDescription.trim()) {
    return trimDescription(suppliedDescription)
  }

  const categoryKey = relativePath.split('/')[0] || ''
  const category = CATEGORY_META[categoryKey]?.label || categoryKey.replace(/-/g, ' ') || 'DevOps'
  const title = pageData.title || 'DevOps topic'
  const intro = extractIntro(relativePath)
  const generated = intro
    ? `${title}: ${intro}`
    : `${title}: practical commands, examples, architecture, and troubleshooting for ${category}, DevOps, SRE, and platform engineering.`
  return trimDescription(generated)
}

function canonicalPath(relativePath = '') {
  if (!relativePath || relativePath === 'index.md') return '/'
  return `/${relativePath.replace(/index\.md$/, '').replace(/\.md$/, '')}`
}

export default defineConfig({
  vite: {
    build: { chunkSizeWarningLimit: 900 },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
    },
  },
  title: 'DevOps Cheatsheets',
  titleTemplate: ':title | DevOps Cheatsheets',
  description: 'Free DevOps cheatsheets for Docker, Kubernetes, CI/CD, cloud, security, monitoring, SRE, and platform engineering.',
  ...(siteUrl ? { sitemap: { hostname: siteUrl } } : {}),
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: false,
  ignoreDeadLinks: false,
  // Keep repository administration documents out of the public documentation site.
  // Tool-specific *-README.md sheets remain included as regular content pages.
  srcExclude: ['**/node_modules/**', 'README.md', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md'],

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/favicon-192.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/favicon-192.png' }],
    ['meta', { name: 'theme-color', content: '#fafaf9', media: '(prefers-color-scheme: light)' }],
    ['meta', { name: 'theme-color', content: '#1b1d22', media: '(prefers-color-scheme: dark)' }],
    ['meta', { name: 'color-scheme', content: 'light dark' }],
    ['meta', { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' }],
    ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }],
    ['meta', { property: 'og:image', content: '/brand-preview.png' }],
    ...(googleSiteVerification ? [['meta', { name: 'google-site-verification', content: googleSiteVerification }]] : []),
  ],

  transformPageData(pageData) {
    const relativePath = pageData.relativePath || ''
    const isHome = pageData.frontmatter?.layout === 'home' || relativePath === 'index.md'
    const isAboutPage = relativePath === 'about.md'
    const title = isHome ? 'DevOps Cheatsheets' : (pageData.title || 'DevOps Cheatsheets')
    const description = pageDescription(pageData)
    const canonical = siteUrl ? `${siteUrl}${canonicalPath(relativePath)}` : ''
    const image = siteUrl ? `${siteUrl}/brand-preview.png` : '/brand-preview.png'
    const categoryKey = relativePath.includes('/') ? relativePath.split('/')[0] : ''
    const category = CATEGORY_META[categoryKey]?.label || categoryKey.replace(/-/g, ' ')
    const hasArticle = !isHome && !isAboutPage

    pageData.description = description
    pageData.frontmatter.head ??= []
    const head = pageData.frontmatter.head
    const addMeta = (name, content, property = false) => {
      const attribute = property ? 'property' : 'name'
      if (!head.some(([tag, attrs]) => tag === 'meta' && attrs?.[attribute] === name)) {
        head.push(['meta', { [attribute]: name, content }])
      }
    }

    addMeta('og:title', `${title} | DevOps Cheatsheets`, true)
    addMeta('og:description', description, true)
    addMeta('og:type', isHome || isAboutPage ? 'website' : 'article', true)
    addMeta('og:site_name', 'DevOps Cheatsheets', true)
    addMeta('og:locale', 'en_US', true)
    if (canonical) addMeta('og:url', canonical, true)
    addMeta('og:image', image, true)
    addMeta('og:image:alt', `${title} — DevOps Cheatsheets`, true)
    addMeta('og:image:width', '1100', true)
    addMeta('og:image:height', '420', true)
    addMeta('twitter:card', 'summary_large_image')
    addMeta('twitter:title', `${title} | DevOps Cheatsheets`)
    addMeta('twitter:description', description)
    addMeta('twitter:image', image)
    addMeta('twitter:image:alt', `${title} — DevOps Cheatsheets`)

    if (canonical && !head.some(([tag, attrs]) => tag === 'link' && attrs?.rel === 'canonical')) {
      head.push(['link', { rel: 'canonical', href: canonical }])
    }

    const organizationId = siteUrl ? `${siteUrl}/#organization` : undefined
    const websiteId = siteUrl ? `${siteUrl}/#website` : undefined
    const graph = []
    graph.push({
      '@type': 'Organization',
      ...(organizationId ? { '@id': organizationId, url: siteUrl } : {}),
      name: 'DevOps Cheatsheets',
      ...(siteUrl ? { logo: { '@type': 'ImageObject', url: `${siteUrl}/favicon-512.png` } } : {}),
    })

    if (isHome) {
      graph.push({
        '@type': 'WebSite',
        ...(websiteId ? { '@id': websiteId, url: siteUrl } : {}),
        name: 'DevOps Cheatsheets',
        description,
        inLanguage: 'en-US',
        publisher: organizationId ? { '@id': organizationId } : { '@type': 'Organization', name: 'DevOps Cheatsheets' },
      })
      if (canonical) {
        graph.push({ '@type': 'WebPage', '@id': canonical, url: canonical, name: title, description, isPartOf: { '@id': websiteId } })
      }
    } else {
      graph.push({
        '@type': isAboutPage ? 'AboutPage' : 'TechArticle',
        ...(canonical ? { '@id': canonical, url: canonical, ...(hasArticle ? { mainEntityOfPage: canonical } : {}) } : {}),
        name: title,
        headline: title,
        description,
        inLanguage: 'en-US',
        isAccessibleForFree: true,
        ...(category ? { articleSection: category } : {}),
        ...(siteUrl && hasArticle ? { image: [image] } : {}),
        publisher: organizationId ? { '@id': organizationId } : { '@type': 'Organization', name: 'DevOps Cheatsheets' },
        ...(websiteId ? { isPartOf: { '@id': websiteId } } : {}),
      })
      if (canonical) {
        graph.push({
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
            { '@type': 'ListItem', position: 2, name: title, item: canonical },
          ],
        })
      }
    }

    if (!head.some(([tag, attrs]) => tag === 'script' && attrs?.type === 'application/ld+json')) {
      const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
      head.push(['script', { type: 'application/ld+json' }, jsonLd])
    }
  },

  buildEnd(siteConfig) {
    const outputDirectory = path.resolve(siteConfig.outDir)
    fs.mkdirSync(outputDirectory, { recursive: true })
    const lines = ['User-agent: *', 'Allow: /']
    if (siteUrl) lines.push(`Sitemap: ${siteUrl}/sitemap.xml`)
    fs.writeFileSync(path.join(outputDirectory, 'robots.txt'), `${lines.join('\n')}\n`)
  },

  markdown: {
    languages: ['hcl', 'terraform'],
    languageAlias: { cfg: 'ini', promql: 'js', logql: 'js', traceql: 'js' },
    config: (md) => {
      // Escape {{ }} so GitHub Actions ${{ }} / Jinja syntax doesn't get
      // compiled as Vue interpolation inside tables and inline code.
      md.core.ruler.after('inline', 'escape-mustache', (state) => {
        const esc = (s) => s.replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;')
        for (const token of state.tokens) {
          if (token.type === 'html_block' || token.type === 'html_inline') continue
          if (token.type === 'inline' && token.children) {
            for (const child of token.children) {
              if (child.type === 'code_inline' || child.type === 'text') {
                child.content = esc(child.content)
              }
            }
          }
        }
      })
    },
  },

  themeConfig: {
    logo: { light: '/favicon.svg', dark: '/favicon-dark.svg', alt: 'DevOps Cheatsheets' },
    nav,
    sidebar,
    outline: { level: [2, 3], label: 'On this page' },
    search: {
      provider: 'local',
      options: {
        detailedView: true,
        miniSearch: { searchOptions: { boost: { title: 4, h2: 2 } } },
      },
    },
    docFooter: { prev: '← Prev', next: 'Next →' },
    footer: {
      message: 'DevOps Tools Cheatsheet Collection — built by <a href="https://github.com/trivediayush" target="_blank" rel="noopener">@trivediayush</a> · Hands-on practice labs at <a href="https://practice.atrivedi.online/" target="_blank" rel="noopener">practice.atrivedi.online</a>',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/trivediayush' },
    ],
    returnToTopLabel: 'Back to top',
    darkModeSwitchLabel: 'Theme',
    sidebarMenuLabel: 'Categories',
    outlineTitle: 'On this page',
  },
})
