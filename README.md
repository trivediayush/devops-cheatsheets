# 🚀 DevOps Tools Cheatsheet Collection  

![DevOps Cheatsheet]

Welcome to the **DevOps Tools Cheatsheet Collection** – your go-to resource for mastering **DevOps tools and technologies**!  

💡 Whether you're an experienced **DevOps engineer**, a **sysadmin**, a **developer**, or a **newcomer** looking to streamline workflows, these curated cheatsheets offer **quick commands, best practices, and essential tips** to supercharge your DevOps journey.  

📖 **What makes this collection special?**  
✅ **Comprehensive**: Covers everything from **CI/CD**, **Containerization**, **Cloud**, **Security**, **Monitoring**, and more.  
✅ **Beginner-Friendly & Advanced**: Useful for **new learners** as well as **seasoned professionals**.  
✅ **Structured & Easy to Navigate**: Find what you need in seconds.  
✅ **Regularly Updated**: We keep it fresh with **new tools and best practices**.  

---

## 🌐 Browse as a Website

> [!TIP]
>
> This repo ships with a **full documentation website** (VitePress): categorized sidebar, **instant keyword search across every cheatsheet** (`Ctrl+K` / `⌘K`), dark/light theme, per-page table of contents, prev/next navigation, and a responsive mobile layout.
>
> ```bash
> npm install          # one-time
> npm run dev          # → http://localhost:5173 (hot reload)
> npm run build        # → static site in .vitepress/dist (deploy anywhere)
> npm run preview      # serve the built site
> ```
>
> The sidebar & nav are **generated automatically** from the folder structure — just drop a new `Tool.md` into a category folder and it appears on the site. No config edits needed.

---

## 📂 Repository Overview  

🔎 **Navigate the directory structure to find the tools you need:**  

```plaintext
/devops-cheatsheet/
│
├── README.md
├── CONTRIBUTING.md
│
├── CI-CD/
│   ├── Jenkins.md
│   ├── GitHub-Actions.md
│   ├── GitLab-CI.md
│   ├── CircleCI.md
│   └── Deployment-Strategies.md
│
├── Containerization/
│   ├── Docker.md
│   ├── CRI-O.md
│   ├── Podman.md
│   ├── Container-Internals.md
│   ├── Distroless-and-Base-Images.md
│   ├── Docker-Architecture.md
│   └── Docker-Daily-Ops.md
│
├── Kubernetes/
│   ├── Kubernetes.md
│   ├── Helm.md
│   ├── OpenShift.md
│   ├── Kubernetes-Internals.md
│   ├── Kubernetes-Distributions.md
│   ├── Kubernetes-Production-Ops.md
│   ├── Kubernetes-Daily-Commands.md
│   └── Gateway-API.md
|
├── Infrastructure-Management
│   ├── Ansible.md
│   ├── Chef.md
│   ├── Puppet.md
│   └── Terraform.md
│
├── Monitoring/
│   ├── Prometheus.md
│   ├── Grafana.md
│   ├── ELK-Stack.md
│   ├── Elastic-Beats.md
│   ├── CloudWatch.md
│   └── Nagios.md
│
├── Security/
│   ├── Trivy.md
│   ├── SonarQube.md
│   ├── AquaSec.md
│   ├── HashiCorp-Vault.md
│   └── IAM-and-Identity.md
│
├── DevSecOps/
│   ├── DevSecOps.md
│   ├── SAST.md
│   ├── DAST.md
│   ├── SCA.md
│   ├── OWASP-ZAP.md
│   ├── Secrets-Scanning.md
│   ├── IaC-Security.md
│   ├── Sigstore.md
│   ├── SLSA.md
│   └── Syft-and-Grype.md
│
├── Version-Control/
│   ├── GitLab.md
│   ├── GitHub.md
│   ├── Bitbucket.md
│   ├── Gerrit.md
│   └── GitOps.md
│
├── ALM/
│   ├── Tuleap.md
│   └── Jira.md
│
├── Interview-Prep/
│   ├── Fresher-0-to-1-Years.md
│   ├── Junior-1-to-2-Years.md
│   ├── Mid-3-to-4-Years.md
│   ├── Senior-5-Plus-Years.md
│   └── Rapid-Fire-Revision.md
│
├── Fundamentals/
│   ├── Linux-Internals.md
│   ├── Linux-Daily-Commands.md
│   ├── Linux-Distributions.md
│   ├── Networking-for-DevOps.md
│   ├── Vim.md
│   ├── Nano.md
│   └── Modern-DevOps-Stack.md
│
├── Hosting/
│   ├── Nginx.md
│   ├── Web-Server-Errors.md
│   └── Hosting-Platforms.md
│
├── Observability/
│   ├── Observability-Concepts.md
│   └── OpenTelemetry.md
│
├── Edge-Scenarios/
│   ├── Air-Gapped-Deployments.md
│   └── Real-World-Scenarios.md
│
├── AI-ML/
│   ├── AI-Fundamentals.md
│   ├── GenAI-and-Agents.md
│   ├── AIOps-and-MLOps.md
│   ├── Using-LLMs-for-DevOps.md
│   └── FinOps.md
│
├── Programming/
│   ├── Python-for-DevOps.md
│   ├── Go-for-DevOps.md
│   └── Shell-and-Bash.md
│
├── Cloud/
│   ├── AWS.md
│   ├── Azure.md
│   ├── GCP.md
│   ├── Kubernetes-on-AWS.md
│   └── Terraform-on-AWS.md
│
└── Networking/
    ├── Istio.md
    ├── Envoy.md
    ├── Consul.md
    └── Linkerd.md
```

---

## 📚 Cheatsheet Categories  

### 🔄 **CI/CD Automation**  

Boost deployment speed with continuous integration & continuous deployment:  
🚀 [Jenkins](./CI-CD/Jenkins.md)  
🚀 [GitHub Actions](./CI-CD/GitHub-Actions.md)  
🚀 [GitLab CI](./CI-CD/GitLab-CI.md)  
🚀 [CircleCI](./CI-CD/CircleCI.md)  
🚀 [Deployment Strategies](./CI-CD/Deployment-Strategies.md)  

### 🐳 **Containers & Images**  

Build, manage, and deploy containers effortlessly:  
🔹 [Docker](./Containerization/Docker.md)  
🔹 [CRI-O](./Containerization/CRI-O.md)  
🔹 [Podman](./Containerization/Podman.md)  
🔹 [Container Internals](./Containerization/Container-Internals.md)  
🔹 [Distroless & Base Images](./Containerization/Distroless-and-Base-Images.md)  
🔹 [Docker Architecture](./Containerization/Docker-Architecture.md)  
🔹 [Docker Daily Ops](./Containerization/Docker-Daily-Ops.md)  

### ☸️ **Kubernetes**  

Orchestration from first pod to production-grade operations:  
☸️ [Kubernetes](./Kubernetes/Kubernetes.md)  
☸️ [Kubernetes Internals](./Kubernetes/Kubernetes-Internals.md)  
☸️ [Kubernetes Distributions](./Kubernetes/Kubernetes-Distributions.md)  
☸️ [Kubernetes Production Ops](./Kubernetes/Kubernetes-Production-Ops.md)  
☸️ [Kubernetes Daily Commands](./Kubernetes/Kubernetes-Daily-Commands.md)  
☸️ [Gateway API](./Kubernetes/Gateway-API.md)  
☸️ [Helm](./Kubernetes/Helm.md)  
☸️ [OpenShift](./Kubernetes/OpenShift.md)  

### 🌐 **Web Servers & Hosting**  

Front the internet and fix what's broken:  
🌐 [Nginx](./Hosting/Nginx.md)  
🌐 [Web Server Errors](./Hosting/Web-Server-Errors.md)  
🌐 [Hosting Platforms](./Hosting/Hosting-Platforms.md)  

### 📊 **Monitoring & Observability**  

Track system health, logs, and performance metrics:  
📈 [Prometheus](./Monitoring/Prometheus.md)  
📈 [Grafana](./Monitoring/Grafana.md)  
📈 [ELK Stack](./Monitoring/ELK-Stack.md)  
📈 [Elastic Beats](./Monitoring/Elastic-Beats.md)  
📈 [Nagios](./Monitoring/Nagios.md)  
📈 [CloudWatch](./Monitoring/CloudWatch.md)  

### 🔐 **Security & Compliance**  

Ensure security best practices and vulnerability scanning:  
🛡️ [Trivy](./Security/Trivy.md)  
🛡️ [SonarQube](./Security/SonarQube.md)  
🛡️ [AquaSec](./Security/AquaSec.md)  
🛡️ [HashiCorp Vault](./Security/HashiCorp-Vault.md)  
🛡️ [IAM & Identity](./Security/IAM-and-Identity.md)

### 🛡️ **DevSecOps**

Shift-left security: scanning, secrets, policy-as-code, and pipeline gates:
🔒 [DevSecOps Overview](./DevSecOps/DevSecOps.md)  
🔒 [SAST — Static Analysis](./DevSecOps/SAST.md)  
🔒 [DAST — Dynamic Analysis](./DevSecOps/DAST.md)  
🔒 [SCA — Dependency & SBOM](./DevSecOps/SCA.md)  
🔒 [OWASP ZAP](./DevSecOps/OWASP-ZAP.md)  
🔒 [Secrets Scanning](./DevSecOps/Secrets-Scanning.md)  
🔒 [IaC Security](./DevSecOps/IaC-Security.md)  
🔒 [Sigstore — Cosign, Rekor & Fulcio](./DevSecOps/Sigstore.md)  
🔒 [SLSA — Build Provenance](./DevSecOps/SLSA.md)  
🔒 [Syft & Grype — SBOM & Scanning](./DevSecOps/Syft-and-Grype.md)  

### 🔖 **Version Control & GitOps**  

Efficiently manage repositories and collaboration:  
📂 [GitLab](./Version-Control/GitLab.md)  
📂 [GitHub](./Version-Control/GitHub.md)  
📂 [Bitbucket](./Version-Control/Bitbucket.md)  
📂 [Gerrit](./Version-Control/Gerrit.md)  
📂 [GitOps](./Version-Control/GitOps.md)  

### 🧭 **Application Lifecycle Management**

Plan, track, review, and ship from one platform:
🧭 [Tuleap](./ALM/Tuleap.md)  
🧭 [Jira](./ALM/Jira.md)  

### 🎯 **Interview Prep**

Tiered Q&A and revision notes to survive interview grilling at every level:
🎯 [Fresher (0–1 years)](./Interview-Prep/Fresher-0-to-1-Years.md)  
🎯 [Junior (1–2 years)](./Interview-Prep/Junior-1-to-2-Years.md)  
🎯 [Mid-Level (3–4 years)](./Interview-Prep/Mid-3-to-4-Years.md)  
🎯 [Senior (5+ years)](./Interview-Prep/Senior-5-Plus-Years.md)  
🎯 [Rapid-Fire Revision](./Interview-Prep/Rapid-Fire-Revision.md)  

### 🧱 **Fundamentals**

The layer under every tool — internals, not textbook theory:
🧱 [Linux Internals](./Fundamentals/Linux-Internals.md)  
🧱 [Linux Daily Commands](./Fundamentals/Linux-Daily-Commands.md)  
🧱 [Linux Distributions](./Fundamentals/Linux-Distributions.md)  
🧱 [Networking for DevOps](./Fundamentals/Networking-for-DevOps.md)  
🧱 [Vim](./Fundamentals/Vim.md)  
🧱 [Nano](./Fundamentals/Nano.md)  
🧱 [Modern DevOps Stack](./Fundamentals/Modern-DevOps-Stack.md)  

### 📈 **Observability**

Concepts, vocabulary, and instrumentation — beyond tools:
📈 [Observability Concepts](./Observability/Observability-Concepts.md)  
📈 [OpenTelemetry](./Observability/OpenTelemetry.md)  

### 🧩 **Edge Scenarios**

Real-world situations nobody teaches until you've hit them:
🧩 [Air-Gapped & Offline Deployments](./Edge-Scenarios/Air-Gapped-Deployments.md)  
🧩 [Real-World Scenario Bank](./Edge-Scenarios/Real-World-Scenarios.md)  

### 🤖 **AI, GenAI & FinOps**

AI fundamentals for infrastructure engineers plus cloud cost engineering:
🤖 [AI Fundamentals](./AI-ML/AI-Fundamentals.md)  
🤖 [GenAI, RAG & Agents](./AI-ML/GenAI-and-Agents.md)  
🤖 [AIOps & MLOps](./AI-ML/AIOps-and-MLOps.md)  
🤖 [Using LLMs for DevOps](./AI-ML/Using-LLMs-for-DevOps.md)  
🤖 [FinOps](./AI-ML/FinOps.md)  

### 💻 **Programming**

The languages DevOps is written in — scripting to shipping binaries:
💻 [Python](./Programming/Python.md)  
💻 [Go](./Programming/Go.md)  
💻 [Bash](./Programming/Bash.md)  

### ☁️ **Cloud Services**  

Provision and manage cloud resources:  
☁️ [AWS](./Cloud/AWS.md)  
☁️ [Azure](./Cloud/Azure.md)  
☁️ [Google Cloud Platform (GCP)](./Cloud/GCP.md)  
☁️ [Terraform](./Cloud/Terraform-on-AWS.md)  
☁️ [Kubernetes on AWS](./Cloud/Kubernetes-on-AWS.md)  

### 🌐 **Networking & Service Mesh**  

Enhance connectivity, security, and service discovery:  
🌍 [Istio](./Networking/Istio.md)  
🌍 [Envoy](./Networking/Envoy.md)  
🌍 [Consul](./Networking/Consul.md)  
🌍 [Linkerd](./Networking/Linkerd.md)  

### ⚙️ **Infrastructure as Code (IaC)**

Automate the provisioning and management of your infrastructure:  
📂 [Terraform](./Infrastructure-Management/Terraform.md)  
📂 [Ansible](./Infrastructure-Management/Ansible.md)  
📂 [Chef](./Infrastructure-Management/Chef.md)  
📂 [Puppet](./Infrastructure-Management/Puppet.md)

---

## 👥 Who Should Use This?  

> [!IMPORTANT]
>
> ✅ **DevOps Engineers** – Quick access to essential commands & tools  
> ✅ **Sysadmins** – Simplify system management with structured cheatsheets  
> ✅ **Developers** – Understand DevOps tools and workflows  
> ✅ **Beginners** – Learn step-by-step with curated resources  
>
> Whether you're **automating deployments**, **managing cloud infrastructure**, or **ensuring security compliance**, this collection is your **ultimate DevOps guide**! 🚀  

---

## 🛠️ How to Use This Repository

> [!NOTE]
>
> 1. **Explore the Categories**: Navigate through the folders to find the tool or technology you're interested in.
> 2. **Use the Cheatsheets**: Each cheatsheet is designed to provide quick access to the most important commands and concepts.
> 3. **Contribute**: Found something missing? Want to share your own tips? Check out our [Contributing Guidelines](./CONTRIBUTING.md) and submit a pull request.

---

## 🤝 Contributions Welcome!  

💡 This is a **community-driven project**! If you have insights, fixes, or new tools to share, your contributions are **highly valued**.  

> 🔥 **Want to contribute?** Check out the [CONTRIBUTING.md](./CONTRIBUTING.md) file.  

---

## 📢 Stay Updated  

🔔 **Regular updates** keep this collection **relevant and practical**.  
⭐ **Star this repository** to stay updated!  

---

## 🛠️ Author & Community  

This project is crafted with 💡 by .  
Your feedback is always welcome! Let's build together. 🚀  

📧 **Connect with me:**  
🔗 **GitHub**:  
🔗 **Blog**:   
🔗 **Telegram Community**: 
🔗 **LinkedIn**: 

---

## ⭐ Support the Project  

If this helped you, consider:  
✅ **Starring** ⭐ this repository  
✅ **Sharing** 📢 with your network  

---

## 🔥 Take Your DevOps Game to the Next Level with This Cheatsheet Collection! 🚀

### 📢 Stay Connected  

