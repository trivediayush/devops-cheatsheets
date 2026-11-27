---
title: JFrog Artifactory
description: JFrog Artifactory and CLI cheatsheet covering repositories, package types, jf CLI, build info, Xray scanning, promotion and CI/CD integration.
---

# JFrog Artifactory

JFrog Artifactory is a universal artifact repository manager for Docker images, Maven, npm, PyPI, Helm, Go, generic files and more. It is often paired with Xray for security scanning and with the `jf` CLI in pipelines.

## 1. Repository types

| Type | Purpose |
|---|---|
| Local | Store artifacts you build and publish |
| Remote | Proxy and cache an upstream such as Docker Hub, npmjs or Maven Central |
| Virtual | One URL that aggregates local and remote repos |
| Federated | Replicate repositories between sites |

Use a virtual repo as the single endpoint developers and CI use, so you can reorganise behind it.

## 2. JFrog CLI (`jf`)

```bash
jf config add prod --url=https://acme.jfrog.io --access-token=$JF_TOKEN --interactive=false
jf config show
jf rt ping

jf rt upload "dist/*.zip" generic-local/myapp/1.0.0/
jf rt download "generic-local/myapp/1.0.0/*.zip" ./out/
jf rt search "generic-local/myapp/*"
jf rt delete "generic-local/myapp/0.9.*"
jf rt set-props "generic-local/myapp/1.0.0/*" "qa=passed;env=staging"
```

## 3. Package manager configuration

```bash
# npm
jf npm-config --repo-resolve=npm-virtual --repo-deploy=npm-local
jf npm install && jf npm publish

# Maven
jf mvn-config --repo-resolve-releases=maven-virtual --repo-deploy-releases=maven-local
jf mvn clean install

# pip
jf pip-config --repo-resolve=pypi-virtual
jf pip install -r requirements.txt

# Docker
docker login acme.jfrog.io
docker tag myapp:1.0 acme.jfrog.io/docker-local/myapp:1.0
docker push acme.jfrog.io/docker-local/myapp:1.0
jf docker push acme.jfrog.io/docker-local/myapp:1.0 --build-name=myapp --build-number=42
```

## 4. Build info and promotion

```bash
export JFROG_CLI_BUILD_NAME=myapp JFROG_CLI_BUILD_NUMBER=42
jf rt build-collect-env
jf rt build-add-git
jf rt build-publish

jf rt build-promote myapp 42 docker-prod-local \
  --status=released --comment="Passed QA" --copy=true
```

Build info records exactly which artifacts, dependencies, environment and commit made up a build. Promote the same artifact between repositories (dev, staging, prod) instead of rebuilding it.

## 5. Xray scanning

```bash
jf audit                                    # scan project dependencies
jf scan ./dist/app.tar.gz                   # scan a file
jf docker scan acme.jfrog.io/docker-local/myapp:1.0
jf build-scan myapp 42                      # scan a published build
```

Use Xray policies and watches to warn or block downloads of artifacts with critical vulnerabilities or licence violations, and to fail the build in CI.

## 6. GitHub Actions

```yaml
- uses: jfrog/setup-jfrog-cli@v4
  env:
    JF_URL: https://acme.jfrog.io
    JF_ACCESS_TOKEN: ${{ secrets.JF_ACCESS_TOKEN }}
- run: |
    jf npm-config --repo-resolve=npm-virtual --repo-deploy=npm-local
    jf npm install
    jf npm publish --build-name=myapp --build-number=${{ github.run_number }}
    jf rt build-publish myapp ${{ github.run_number }}
```

## 7. Best practices

- Use access tokens or OIDC, not passwords, and scope them per project.
- Separate repositories per package type and per environment.
- Configure cleanup policies and retention so storage does not grow without limit.
- Block direct internet access from builds and resolve everything through remote and virtual repos.
- Replicate or federate to regions or edge sites for speed and resilience.

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| `401` or `403` | Token expiry, permission target, repository path |
| Cannot overwrite artifact | Repo layout, handling of releases and snapshots, immutability settings |
| Slow downloads | Remote repo cache, metadata retrieval cache, network location |
| Docker push fails | Repository path method, reverse proxy body size, login to the correct registry host |
| Build info missing | Same build name and number across commands, run `build-publish` |
