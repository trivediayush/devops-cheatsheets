# 📋 Jira Cheatsheet

**Jira** — Atlassian's issue tracker that runs most enterprise delivery. Boards, sprints, JQL, workflows, automation, and the REST API for wiring it into your pipelines.

---

## **1. The Vocabulary**

| Term | What it is |
| --- | --- |
| **Issue** | the unit — Bug, Story, Task, Epic, Sub-task |
| **Project** | a container with its own issue key prefix (`DEV-123`) |
| **Board** | a *view* over a filter (Scrum = sprints, Kanban = flow) — boards aren't storage |
| **Sprint** | time-boxed iteration (Scrum board only) |
| **Epic** | large body of work grouping stories |
| **Workflow** | the status state machine (To Do → In Progress → Done) + transitions + conditions |
| **Resolution** | why it closed (Done, Won't Do, Duplicate) — separate from Status |
| **Components / Labels / Fix Versions** | grouping dimensions for filtering and release |
| **Story Points** | relative effort estimate (velocity = points/sprint) |
| **Watcher / Voter** | followers vs endorsements |

---

## **2. JQL — The Search Language**

```sql
-- the grammar of every filter/board/report
project = DEV AND status = "In Progress"
assignee = currentUser() AND resolution = Unresolved
project = DEV AND sprint in openSprints()
labels = urgent ORDER BY priority DESC
created >= -7d AND type = Bug
fixVersion = "1.2.0" ORDER BY updated DESC
project = DEV AND status changed TO "Done" DURING (startOfSprint(), endOfSprint())
"Epic Link" = DEV-50                         -- all stories under an epic
```

**Power clauses:**

```sql
assignee was jsmith                          -- history
status was "To Do" BEFORE "2024-01-01"
parent = DEV-10                              -- sub-tasks
issuelinks not EMPTY                         -- has linked issues
priority in (Highest, High) AND duedate <= now()
text ~ "timeout"                             -- fuzzy full-text
```

```sql
-- the daily drivers:
assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC
project = DEV AND sprint in openSprints() AND assignee = currentUser()
project = DEV AND status = "To Do" AND labels = blocked-by-infra
```

---

## **3. Workflows — Status ≠ Resolution**

```text
To Do → In Progress → In Review → Done
              │           │
              └─── Blocked ←──┘    (transitions are the EDGES —

hidden until conditions/permissions allow them)
```

* **Status** = where it is. **Resolution** = the verdict (Done/Won't Do/Duplicate). An issue is "closed" for JQL/filters only when **resolution is set** — a Done status without resolution still counts as open.
* **Transition screens** pop fields on move (required comment, assignee, time log).
* **Conditions** restrict transitions (only assignee, only specific role, sub-tasks must be done).
* Classic trap: `resolved` issues showing in "open" queries because the Done transition didn't set Resolution — fix with a post-function.

---

## **4. The REST API — Wire It Into CI/CD**

```bash
# Auth: basic (email + API token) or Bearer
TOKEN="email@x.com:API_TOKEN"

# Get an issue
curl -u "$TOKEN" "https://co.atlassian.net/rest/api/3/issue/DEV-123"

# Search (JQL)
curl -u "$TOKEN" -X POST \
  "https://co.atlassian.net/rest/api/3/search/jql" \
  -H 'Content-Type: application/json' \
  -d '{"jql":"project=DEV AND status=Done","fields":["summary","status"]}'

# Create issue
curl -u "$TOKEN" -X POST \
  "https://co.atlassian.net/rest/api/3/issue" \
  -H 'Content-Type: application/json' \
  -d '{"fields":{"project":{"key":"DEV"},"summary":"Deploy failed",
       "issuetype":{"name":"Bug"},"description":{"type":"doc","version":1,
       "content":[{"type":"paragraph","content":[{"type":"text","text":"prod deploy broke"}]}]}}}'

# Transition (move to Done — transition IDs differ per workflow)
curl -u "$TOKEN" "https://co.atlassian.net/rest/api/3/issue/DEV-123/transitions"
curl -u "$TOKEN" -X POST \
  "https://co.atlassian.net/rest/api/3/issue/DEV-123/transitions" \
  -H 'Content-Type: application/json' -d '{"transition":{"id":"31"}}'

# Comment
curl -u "$TOKEN" -X POST \
  "https://co.atlassian.net/rest/api/3/issue/DEV-123/comment" \
  -H 'Content-Type: application/json' -d '{"body":{...ADF doc...}}'

# Link issues
curl -u "$TOKEN" -X POST \
  "https://co.atlassian.net/rest/api/3/issueLink" \
  -d '{"type":{"name":"Blocks"},"inwardIssue":{"key":"DEV-1"},"outwardIssue":{"key":"DEV-2"}}'
```

> [!NOTE]
> Description/comment bodies use **Atlassian Document Format (ADF)** — JSON nodes, not plain text. `{"type":"doc","version":1,"content":[...]}` is the shape; plain `"body": "text"` fails on v3 API.

---

## **5. Automation & Integrations**

```text
Automation rules (no code):     trigger → condition → action
  "When issue transitions to Done → set Resolution → notify Slack"
  "Cron daily → JQL: unresolved > 30d → comment + escalate"

Common integrations:
  GitHub/GitLab   → DEV-123 in commit/branch/PR auto-links + shows dev status
  Slack/Teams     → /jira create, transition notifications
  CI/CD           → deployment events on issues via "deployments" API
  Confluence      → embed JQL tables in docs
```

**Smart commits** — put the issue key in a commit message and Jira acts on it:

```text
DEV-123 #comment Fixed the retry loop
DEV-123 #time 2h
DEV-123 #transition "In Review"
```

---

## **6. Ops Gotchas**

* **Board shows nothing** → its saved filter excludes you (wrong project/labels). Check `Board Settings → Filter`.
* **Can't transition** → missing permission/condition, or a required field on the transition screen is empty.
* **"Issue deleted but still searchable"** → JQL caches; hard refresh, or it was archived not deleted.
* **API 401 with correct token** → API tokens go in *basic auth*, not Bearer; and `email:token` not `username:token`.
* **Transition ID wrong** → IDs are per-workflow; fetch `/transitions` first — never hardcode without checking the project.
* **Resolution stuck Unresolved** → the Done transition lacked the "set Resolution" post-function — classic admin bug.

---

## 📚 **Learning Resources**

* 🔗 [Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
* 📦 [JQL Reference](https://support.atlassian.com/jira-software-cloud/docs/advanced-searching/)
* 🛠️ [Smart Commits](https://support.atlassian.com/jira-software-cloud/docs/process-issues-with-smart-commits/)
