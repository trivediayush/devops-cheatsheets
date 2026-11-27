# 🔎 Gerrit Cheatsheet

<!-- ![text](https://gerrit-review.googlesource.com/static/gerrit-icon.png) -->

**Gerrit** is a web-based **code review and Git repository management** system built on top of Git. Every commit is pushed to a special `refs/for/` ref, becomes a **Change** with one or more **Patch Sets**, and must pass human review (`Code-Review`) and CI (`Verified`) labels before being merged.

---

## **1. Core Concepts & Terminology**

| Concept | Description |
| --- | --- |
| **Change** | A single unit of review (one logical commit). Tracked by a `Change-Id` footer in the commit message. |
| **Patch Set** | A revision of a Change. Amending your commit and pushing again creates Patch Set 2, 3, ... |
| **`refs/for/<branch>`** | Magic Git ref you push to in order to create/update a review instead of merging directly. |
| **Labels** | Voting dimensions: `Code-Review` (-2..+2), `Verified` (-1/+1, usually set by CI), custom labels. |
| **Submit** | Gerrit's merge action once all required labels reach their thresholds. |
| **Topic** | A tag grouping related changes across projects so they can be reviewed/submitted together. |

---

## **2. Installation Quickstart**

### 🔹 Run Gerrit with Docker

```bash
docker run -d \
  --name gerrit \
  -p 8080:8080 \
  -p 29418:29418 \
  -v gerrit-volume:/var/gerrit/review_site \
  gerritcodereview/gerrit:latest
```

* Web UI: `http://localhost:8080`
* SSH API: port `29418`

> [!TIP]
> On first login Gerrit automatically makes the first registered user an **Administrator**. Sign in via OpenID/LDAP/HTTP auth depending on your `gerrit.config`.

---

## **3. Repository Setup & Git Workflow**

### 🔹 Clone and Install the `commit-msg` Hook

The hook appends a `Change-Id:` footer to every commit — **required** for reviews:

```bash
# Clone (SSH on port 29418)
git clone ssh://user@gerrit.example.com:29418/myproject
cd myproject

# Install the commit-msg hook (adds Change-Id automatically)
gitdir=$(git rev-parse --git-dir)
scp -p -P 29418 user@gerrit.example.com:hooks/commit-msg ${gitdir}/hooks/
```

### 🔹 Push a Change for Review

```bash
git checkout -b my-feature
# ... edit files ...
git commit -am "Add feature X"
git push origin HEAD:refs/for/main
```

### 🔹 Update an Existing Change (New Patch Set)

```bash
# Make fixes, amend the SAME commit (keeps Change-Id)
git commit --amend
git push origin HEAD:refs/for/main
```

> [!IMPORTANT]
> Never squash or rebase away the `Change-Id:` line — Gerrit uses it to attach the new patch set to the existing Change.

### 🔹 Useful Push Options

```bash
# Push as a draft work-in-progress
git push origin HEAD:refs/for/main%wip

# Add reviewers and set a topic at push time
git push origin HEAD:refs/for/main%topic=bugfix-123,r=alice@example.com
```

---

## **4. SSH Command Line (`gerrit` CLI)**

Connect to the embedded SSH daemon for admin and automation tasks:

```bash
# List projects
ssh -p 29418 user@gerrit.example.com gerrit ls-projects

# Query changes
ssh -p 29418 user@gerrit.example.com gerrit query status:open project:myproject

# Vote on a change (verify +1, code-review +2)
ssh -p 29418 user@gerrit.example.com gerrit review --verified +1 --code-review +2 <CHANGE_ID>,<PATCHSET>

# Add a reviewer / comment
ssh -p 29418 user@gerrit.example.com gerrit set-reviewers -a bob@example.com <CHANGE_ID>
ssh -p 29418 user@gerrit.example.com gerrit review -m "'Looks good'" <CHANGE_ID>,<PATCHSET>

# Submit (merge) a change
ssh -p 29418 user@gerrit.example.com gerrit review --submit <CHANGE_ID>,<PATCHSET>

# Create a project
ssh -p 29418 admin@gerrit.example.com gerrit create-project --name my-new-project
```

---

## **5. Review Voting Scale**

| Label | Score | Meaning |
| --- | --- | --- |
| `Code-Review` | **+2** | Looks good, approved (required to submit) |
| `Code-Review` | **+1** | Looks good, but someone else must approve |
| `Code-Review` | **-1** | I would prefer you didn't merge this |
| `Code-Review` | **-2** | Veto — must not be merged |
| `Verified` | **+1 / -1** | CI build & tests passed / failed |

---

## **6. Search Queries (Web UI & CLI)**

```text
status:open owner:self              # My open changes
is:reviewer status:open             # Changes awaiting my review
project:kernel status:merged        # Merged changes in a project
topic:bugfix-123                    # All changes in a topic
message:"fix crash"                 # Full-text commit message search
file:^src/auth/.*                   # Changes touching specific files
age:1week                           # Recently updated
```

---

## **7. CI Integration (Verified Label)**

### 🔹 Jenkins (Gerrit Trigger Plugin)

```groovy
// Jenkinsfile triggered on patchset-created event
pipeline {
  agent any
  stages {
    stage('Verify') {
      steps {
        sh 'make test'
      }
      post {
        success {
          gerritReview labels: [Verified: 1], message: 'Build Successful'
        }
        failure {
          gerritReview labels: [Verified: -1], message: 'Build Failed'
        }
      }
    }
  }
}
```

### 🔹 Zuul (Gerrit's native CI companion)

```yaml
# zuul.d/jobs.yaml — pipeline reacting to Gerrit events
- pipeline:
    name: check
    trigger:
      gerrit:
        - event: patchset-created
    success:
      gerrit:
        Verified: 1
    failure:
      gerrit:
        Verified: -1
```

---

## **8. Common Administration Tasks**

```bash
# Reindex a project (after bulk imports)
ssh -p 29418 admin@gerrit.example.com gerrit index start myproject

# Show connected replication queues
ssh -p 29418 admin@gerrit.example.com gerrit show-queue

# Reload plugins / restart
ssh -p 29418 admin@gerrit.example.com gerrit plugin reload replication
ssh -p 29418 admin@gerrit.example.com gerrit restart
```

Key config file: `$GERRIT_SITE/etc/gerrit.config` — controls auth type, canonical web URL, SSH listen port, and label definitions per project (in `project.config` inside the `All-Projects` repo).

---

## 📚 **Learning Resources**

* 🔗 [Official Gerrit Documentation](https://gerrit-review.googlesource.com/Documentation/)
* 📦 [Gerrit Code Review for Git — Intro & Workflow](https://gerrit-review.googlesource.com/Documentation/intro-gerrit-walkthrough.html)
* 🛠️ [Gerrit Trigger — Jenkins Plugin](https://plugins.jenkins.io/gerrit-trigger/)
