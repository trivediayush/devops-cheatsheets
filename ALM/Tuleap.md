# 🧭 Tuleap Cheatsheet

![text](https://www.tuleap.org/themes/tuleap/img/tuleap-logo.svg)

**Tuleap** is an open-source **Application Lifecycle Management (ALM)** platform combining agile project management (Scrum/Kanban), Git hosting with pull requests, document management, CI integration, and requirement/defect **trackers** — all in one self-hosted suite.

---

## **1. Core Concepts & Terminology**

| Concept | Description |
| --- | --- |
| **Project** | Top-level workspace containing trackers, Git repos, docs, and dashboards. |
| **Tracker** | A customizable issue/artifact type (e.g., User Stories, Bugs, Tasks, Requirements) with its own fields & workflow. |
| **Artifact** | A single item inside a tracker (one bug, one story). Linked to other artifacts via references like `art #123`. |
| **Agile Dashboard** | Scrum and Kanban boards built on top of trackers — backlogs, sprints, burndown charts. |
| **Pull Request** | Built-in code review on Tuleap-hosted Git repositories. |
| **REST API** | Full-featured API (`/api/v1/...`) used for automation, reporting, and CI integration. |

---

## **2. Installation Quickstart**

### 🔹 Docker (Community Edition)

```bash
# Create volumes for data persistence
docker volume create --name tuleap-data
docker volume create --name tuleap-db

# First run: initializes DB and prints admin credentials to logs
docker run -d \
  --name tuleap \
  -p 80:80 -p 443:443 -p 22:22 \
  -e TULEAP_FQDN=tuleap.example.com \
  -e TULEAP_DB_ADMIN_PASSWORD=ChangeMe123! \
  -v tuleap-data:/data \
  -v tuleap-db:/var/lib/mysql \
  tuleap/tuleap-community-edition:latest

# Watch bootstrap progress & grab site admin password
docker logs -f tuleap
```

### 🔹 RHEL / Rocky Linux (Production)

```bash
dnf install -y tuleap \
  tuleap-plugin-git tuleap-plugin-agiledashboard \
  tuleap-plugin-docman tuleap-plugin-pullrequest
# Then run the interactive setup
/usr/share/tuleap/tools/setup.el7.sh \
  --configure \
  --server-name=tuleap.example.com \
  --mysql-server=localhost \
  --mysql-password=ChangeMe123!
```

---

## **3. Trackers & Artifacts (Work Items)**

* **Create trackers**: Project Admin → Trackers → New Tracker → choose template (Bugs, Stories, Requirements) or build from scratch with custom fields, workflow states, and permissions.
* **Cross-references**: typing `art #123`, `story #45`, or `git #a1b2c3d` inside any text field auto-links artifacts, commits, and documents.
* **Workflow rules**: enforce transitions (e.g., `New → In Progress → Done`) and required fields per state.

```bash
# Search artifacts via REST API
curl -s -H "X-Auth-AccessKey: $TULEAP_KEY" \
  "https://tuleap.example.com/api/v1/trackers/42/artifacts?query={\"status\":\"open\"}"
```

---

## **4. Git Hosting & Pull Requests**

```bash
# Clone a Tuleap-hosted repo (SSH)
git clone ssh://gitolite@tuleap.example.com/myproject/myrepo.git

# Create a PR from the web UI: Git repo → Pull Requests → New
# Or via REST API:
curl -X POST -H "X-Auth-AccessKey: $TULEAP_KEY" \
  -H "Content-Type: application/json" \
  -d '{"git_repository_id": 7, "branch_src": "feature-x", "branch_dest": "main", "title": "Add feature X"}' \
  https://tuleap.example.com/api/v1/pull_requests
```

> [!TIP]
> Tuleap Git supports **pre-receive hooks** — enforce artifact references in commit messages so every commit links back to a tracked work item.

---

## **5. Agile Dashboard (Scrum & Kanban)**

1. Enable the **Agile Dashboard** plugin on the project.
2. Map trackers: define which tracker = Backlog items, which = Sprints/Releases.
3. Scrum board auto-generates: Release → Sprint planning, burndown, and task boards.
4. Kanban board: create a Kanban on any tracker — columns map to workflow states, WIP limits configurable per column.

---

## **6. CI/CD Integration**

### 🔹 Jenkins Plugin

Install the **Tuleap** plugin in Jenkins to get build status reported back onto artifacts and Git commits:

```groovy
// Jenkinsfile
pipeline {
  agent any
  stages {
    stage('Build') {
      steps { sh 'make build' }
    }
  }
  post {
    always {
      tuleapSendTTMResults(   // report test results to Tuleap Test Management
        credentialsId: 'tuleap-api-key'
      )
    }
  }
}
```

### 🔹 Webhooks / Generic CI

```bash
# Update an artifact from any CI job via REST
curl -X PUT -H "X-Auth-AccessKey: $TULEAP_KEY" \
  -H "Content-Type: application/json" \
  -d '{"values": [{"field_id": 100, "value": "deployed"}]}' \
  https://tuleap.example.com/api/v1/artifacts/123
```

---

## **7. REST API Essentials**

Get an API key: **Account → Preferences → Keys & Tokens → Access Key**.

```bash
export TULEAP_KEY="tlp-k1-xxxxxxxxxxxx"
AUTH="X-Auth-AccessKey: $TULEAP_KEY"

# Who am I
curl -s -H "$AUTH" https://tuleap.example.com/api/v1/users/self

# List projects / project trackers
curl -s -H "$AUTH" https://tuleap.example.com/api/v1/projects
curl -s -H "$AUTH" https://tuleap.example.com/api/v1/projects/101/trackers

# Create an artifact
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"tracker": {"id": 42}, "values_by_field": {"summary": {"value": "Login page 500 error"}}}' \
  https://tuleap.example.com/api/v1/artifacts
```

> [!NOTE]
> Interactive API explorer is built in: visit `https://<your-tuleap>/api/v1/explorer/` to try every endpoint live.

---

## **8. Administration Quick Commands**

```bash
# Inside the container/host: run Tuleap CLI tools
tuleap config-list                          # Show configuration
tuleap config-set sys_default_domain tuleap.example.com
tuleap queue-task-worker                    # Process background jobs

# Database & backups (data volume layout)
#   /data/etc        → config
#   /var/lib/mysql   → database (separate volume)
```

---

## 📚 **Learning Resources**

* 🔗 [Official Tuleap Documentation](https://docs.tuleap.org/)
* 📦 [Tuleap REST API Reference](https://docs.tuleap.org/user-guide/integration/api/rest.html)
* 🧩 [Tuleap Docker Image Docs](https://docs.tuleap.org/installation-guide/docker-image.html)
