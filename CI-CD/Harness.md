---
title: Harness
description: Harness CI/CD cheatsheet covering pipelines, stages, steps, connectors, delegates, deployment strategies, GitOps and best practices.
---

# Harness

Harness is a software delivery platform that includes CI, CD, GitOps, feature flags, cloud cost management and security testing. Pipelines are defined in YAML and executed by delegates running in your own infrastructure.

## 1. Key concepts

| Concept | Meaning |
|---|---|
| Account, organisation, project | Hierarchy for scoping resources and permissions |
| Pipeline | Ordered stages that build, test and deploy |
| Stage | A unit such as Build, Deploy or Approval |
| Step / step group | One action inside a stage |
| Connector | Saved credentials for Git, cloud, registry or cluster |
| Delegate | Lightweight agent that runs tasks inside your network |
| Service / environment / infrastructure | What you deploy, where, and onto which target |
| Template | Reusable stage, step or pipeline |

## 2. Install a delegate on Kubernetes

```bash
helm repo add harness-delegate https://app.harness.io/storage/harness-download/delegate-helm-chart/
helm upgrade --install helm-delegate harness-delegate/harness-delegate-ng \
  -n harness-delegate-ng --create-namespace \
  --set delegateName=helm-delegate \
  --set accountId=<ACCOUNT_ID> \
  --set delegateToken=<TOKEN> \
  --set managerEndpoint=https://app.harness.io \
  --set delegateDockerImage=harness/delegate:latest \
  --set replicas=2
kubectl -n harness-delegate-ng get pods
```

Run at least two delegate replicas and give them only the network access and permissions they need.

## 3. CI pipeline example

```yaml
pipeline:
  name: build-and-push
  identifier: build_and_push
  projectIdentifier: demo
  orgIdentifier: default
  stages:
    - stage:
        name: Build
        identifier: Build
        type: CI
        spec:
          cloneCodebase: true
          platform: { os: Linux, arch: Amd64 }
          runtime: { type: Cloud, spec: {} }
          execution:
            steps:
              - step:
                  type: Run
                  name: Test
                  identifier: Test
                  spec:
                    shell: Sh
                    command: npm ci && npm test
              - step:
                  type: BuildAndPushDockerRegistry
                  name: Push image
                  identifier: Push_image
                  spec:
                    connectorRef: dockerhub
                    repo: acme/myapp
                    tags:
                      - <+pipeline.sequenceId>
```

## 4. CD deployment strategies

| Strategy | Notes |
|---|---|
| Rolling | Replace instances gradually |
| Blue-green | Switch traffic between two environments with instant rollback |
| Canary | Shift a percentage of traffic, verify, then continue |
| Basic | Single step deploy, for simple cases |

Add **Continuous Verification** to compare metrics and logs from tools such as Datadog, Prometheus or Elastic, and roll back automatically on regression. Add approval steps for production.

## 5. Expressions and secrets

```text
<+pipeline.name>               <+pipeline.sequenceId>
<+stage.name>                  <+codebase.commitSha>
<+artifact.image>              <+env.name>
<+secrets.getValue("db_pass")> <+variable.account.region>
```

Store credentials in the Harness secret manager or an external one such as Vault or AWS Secrets Manager, never in YAML.

## 6. GitOps

Harness GitOps is built on Argo CD. It syncs Kubernetes state from Git across clusters, shows drift, and supports promotion through environments with pull requests.

## 7. Best practices

- Keep pipelines in Git (Git Experience) with pull request review.
- Build reusable templates for build and deploy stages.
- Use OPA policies to enforce rules such as required approvals and allowed registries.
- Use triggers for webhook, scheduled and artifact events.
- Include security scans such as STO or Snyk, and fail on high severity.
- Scope RBAC by project and use service accounts for automation.

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| Delegate offline | Pod logs, token, outbound access to `app.harness.io`, proxy settings |
| Connector test fails | Credentials, delegate selector, network access to the target |
| Step cannot find a tool | Use a container step image that includes the tool |
| Wrong delegate used | Delegate selectors and tags on the step, stage or connector |
| Deployment stuck | Pod events, rollout status, approval or verification step waiting |
