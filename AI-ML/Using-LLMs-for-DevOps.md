# 🤖 Using LLMs for DevOps — Prompt Engineering Cheatsheet

**LLMs as a daily engineering tool** — ChatGPT, Devin, Claude, Gemini, Copilot. The prompting patterns that make them useful for ops work, and the safety rules that keep them from causing incidents.

---

## **1. The Golden Rule**

> **An LLM is a very well-read junior engineer: fast recall, broad knowledge, zero context on YOUR systems, and confidently wrong 5% of the time.**

Use it for: first drafts, explanations, boilerplate, decoding errors, "how do I X again", rubber-ducking. Verify everything before prod.

---

## **2. Prompt Engineering — The Patterns That Work**

**Structure = Role + Context + Task + Format + Constraints:**

```text
❌ "write a terraform s3 bucket"

✅ "You are a platform engineer. Write Terraform for an S3 bucket that:
- is private with encryption (SSE-S3) and versioning
- blocks all public access
- has a lifecycle rule: objects >90d → glacier
Output: complete .tf file with comments on security-relevant lines.
Do NOT include a public policy or ACL."
```

| Pattern | Example |
| --- | --- |
| **Set the role** | "Act as a senior SRE reviewing this runbook" |
| **Give context** | paste the error + the command that produced it + relevant config |
| **Specify format** | "output only the diff", "table comparing X vs Y", "one-line bash" |
| **Constrain** | "no external deps", "bash 3.2 compatible", "POSIX only", "explain for a mid-level engineer" |
| **Iterate, don't restart** | "same but without jq", "now make it idempotent", "add error handling" |
| **Ask for the why** | "explain each flag", "what are the failure modes", "what could go wrong in prod" |

**The most reliable trick — paste the real error:** "Here's the actual `kubectl describe pod` output: [paste]. Why is it stuck?" beats "how do I debug a pending pod" every time. LLMs are excellent at *interpreting*, weak at *guessing your environment*.

---

## **3. DevOps-Specific Prompt Recipes**

**Decode an error:**
```text
"This Helm install fails with: [paste]. Cluster is EKS 1.29, values.yaml: [paste].
Explain the error, the most likely cause, and the fix — in that order."
```

**Write a runbook/runbook step:**
```text
"Write a runbook for 'Pod stuck in ImagePullBackOff on EKS'.
Format: Symptoms | Likely causes | Diagnostic commands (kubectl) | Fix per cause |
Escalation. Assume the reader knows kubectl basics but not ECR specifics."
```

**Generate the tedious:**
```text
"Convert this nginx config to an HAProxy frontend/backend: [paste]"
"Write a jq one-liner that extracts .items[].metadata.name where .status.phase != Running"
"Make this curl into a proper retry-with-backoff bash function"
```

**Review (the highest-ROI use):**
```text
"Review this Dockerfile for security and layer-efficiency issues. [paste]
Flag: running as root, unpinned base, secrets in layers, missing .dockerignore,
no HEALTHCHECK. Then show the fixed version."
```

**Explain a system you don't know:**
```text
"I'm inheriting a Vault + External Secrets setup. Explain the auth flow between
ESO and Vault (Kubernetes auth method), what can break, and how to verify it's healthy."
```

**Incident timeline draft:**
```text
"Turn these Slack timestamps + log lines into an incident timeline table:
time | event | source | action taken. [paste]"
```

---

## **4. Using Agent Tools — Devin / Copilot / Claude Code / Cursor**

Agent tools (Devin, Claude Code, Cursor, Copilot Workspace) don't just answer — they **edit files, run commands, open PRs**. Different rules apply:

```text
Good agent task:              Bad agent task:
├── "update all Dockerfiles   ├── "fix prod"
│   to use pinned digests"    ├── "make it faster"
├── "write pytest cases for   ├── "secure this" (no criteria)
│   utils.py edge cases"      ├── "migrate to X" (no plan/context)
├── "add a /health endpoint   └── "deploy this"
│   and wire it to k8s probes"
└── scoped, verifiable, reviewable
```

**Agent workflow that works:** small scoped task → let it run → **review the diff like a junior's PR** → run tests yourself → merge. Never let an agent's output reach prod without human review.

**Prompting agents:** include acceptance criteria ("the test must pass `pytest -k auth`"), the file paths, and what NOT to touch ("don't modify the CI workflow").

---

## **5. The Safety Rules — Non-Negotiable**

| Rule | Why |
| --- | --- |
| **Never paste secrets** — tokens, keys, kubeconfigs, `.env`, internal IPs/hostnames where policy forbids | prompts may be logged/train on; secrets leak |
| **Never paste PII/customer data** | same, plus legal/compliance |
| **Redact before pasting** — `TOKEN=xxx`, `host=db.internal` → `db.<REDACTED>` | keeps context without the leak |
| **Verify every command** — LLMs hallucinate flags | `rm -rf` a hallucination is real damage; run read-only first |
| **Check the version** — LLMs blend versions | `kubectl` flags change; EKS 1.29 ≠ 1.20 — ask "which version" explicitly |
| **Don't paste prod configs** into a public LLM | org policy; use enterprise/self-hosted with no-train |
| **It doesn't know your system** — "is my disk full" is YOUR check | it can only reason about what you paste |
| **Treat generated IaC/policies as a draft** — review IAM `*`s, open SGs, `latest` tags | LLMs default to permissive "works" not secure "right" |

```bash
# Before pasting — redact the usual suspects:
sed -E 's/(token|key|secret|password|Authorization: Bearer )[A-Za-z0-9_\-\.=:]+/\1<REDACTED>/gi' file
```

---

## **6. What LLMs Are Genuinely Good At vs Not**

| Strong | Weak/unsafe |
| --- | --- |
| Boilerplate: Dockerfiles, YAML, pipelines | knowing your actual environment/state |
| Decoding error messages you paste | real-time info (versions, prices, your metrics) |
| Explaining concepts, comparing tools | guaranteed-correct commands (always verify) |
| Reviewing config/code for known anti-patterns | novel architecture decisions for YOUR context |
| Regex/jq/awk one-liners | secrets/credentials handling |
| Drafting runbooks, postmortems, docs | knowing your org's conventions |

---

## **7. The Daily Workflow**

```text
Hit an error → paste the REAL output → get hypothesis → verify on the box
Need a script → describe I/O precisely → get draft → run on a COPY → fix → commit
Learning something → "explain X like I'm an SRE" → read → ask follow-ups
Writing docs → dump bullets → get prose → edit to your voice
On-call → paste logs → "what's the most likely failure chain here"
```

**The meta-skill** — LLMs reward *precise questions*. "Write a bash script that tails /var/log/nginx/access.log, counts 5xx per minute, and alerts over threshold 10" → production-usable output. "Help with nginx errors" → generic listicle. Be specific.

---

## 📚 **Learning Resources**

* 🔗 [OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
* 📦 [Anthropic Prompt Engineering](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)
* 🛠️ [Google Prompting Guide](https://ai.google.dev/gemini-api/docs/prompting-strategies)
