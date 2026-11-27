---
title: Snyk
description: Snyk cheatsheet covering CLI usage for open source, code, container and IaC scanning, policies, CI/CD integration and triage.
---

# Snyk

Snyk is a developer-first security platform. It finds and helps fix vulnerabilities in dependencies, source code, container images and infrastructure as code.

## 1. Products

| Product | Command | Scans |
|---|---|---|
| Snyk Open Source (SCA) | `snyk test` | Dependencies and licences |
| Snyk Code (SAST) | `snyk code test` | First-party source code |
| Snyk Container | `snyk container test` | Image OS packages and app dependencies |
| Snyk IaC | `snyk iac test` | Terraform, Kubernetes, CloudFormation, Helm |

## 2. Install and authenticate

```bash
npm install -g snyk            # or brew install snyk-cli
snyk auth                      # browser login
export SNYK_TOKEN=<token>      # use this in CI instead
snyk config get api
```

## 3. Everyday commands

```bash
snyk test                                   # dependencies in the current project
snyk test --severity-threshold=high         # fail only on high and critical
snyk test --all-projects                    # monorepos
snyk test --json > snyk.json
snyk monitor                                # snapshot for continuous monitoring
snyk code test
snyk container test myapp:1.0 --file=Dockerfile
snyk container monitor myapp:1.0
snyk iac test ./terraform
snyk iac test k8s/deployment.yaml
snyk sbom --format=cyclonedx1.5+json
```

## 4. Fixing and ignoring

```bash
snyk fix                                    # apply supported automatic fixes
snyk wizard                                 # legacy interactive flow
snyk ignore --id=SNYK-JS-LODASH-567746 \
  --expiry=2026-12-31 --reason="No exploit path, fix scheduled"
```

Ignores are stored in a `.snyk` file. Always set an expiry and a reason, and review them regularly. Prefer upgrading, then patching, then ignoring.

## 5. GitHub Actions

```yaml
name: snyk
on: [push, pull_request]
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: snyk/actions/setup@master
      - run: snyk test --severity-threshold=high
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      - run: snyk code test
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

## 6. GitLab CI

```yaml
snyk:
  image: snyk/snyk:node
  script:
    - snyk test --severity-threshold=high
  variables:
    SNYK_TOKEN: $SNYK_TOKEN
```

## 7. Prioritising findings

- Combine severity with **exploit maturity**, **reachability** and **fixability**.
- Fix issues in direct dependencies first, then transitive ones.
- Block builds on new high and critical issues and track the rest as backlog.
- Rescan images regularly, because new CVEs appear for unchanged code.

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| `Authentication failed` | `SNYK_TOKEN` is set and has access to the organisation |
| No dependencies detected | Lock file present, correct `--file`, build or install step run first |
| Slow scans | Use `--all-projects` selectively, exclude folders with `--exclude` |
| Too many results | Set `--severity-threshold`, use policies and ignores with expiry |
| Container base image advice missing | Pass `--file=Dockerfile` for recommendations |
