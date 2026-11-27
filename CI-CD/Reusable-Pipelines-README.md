---
title: Reusable CI/CD Pipelines
description: Reusable CI/CD workflow patterns for GitHub Actions, GitLab, Jenkins, and CircleCI, with templates, security practices, versioning, and rollout guidance.
---

# Reusable CI/CD Pipelines

Reusable pipelines let teams define a CI/CD workflow once and call it from many repositories or services. They reduce duplicated YAML, standardize build and release behavior, and make it easier to roll out security, testing, and deployment improvements consistently.

This guide covers reusable workflows and templates in GitHub Actions, GitLab CI/CD, Jenkins, and CircleCI. The examples are standalone patterns: they do not replace or modify the existing pipeline examples in this collection.

Related guides: [GitHub Actions](./GitHub-Actions.md), [GitLab CI](./GitLab-CI.md), [Jenkins](./Jenkins.md), [CircleCI](./CircleCI.md), and [Deployment Strategies](./Deployment-Strategies.md).

---

## 1. When to Reuse a Pipeline

Create a reusable pipeline when multiple projects share most of the same delivery process, for example:

- Checkout, dependency installation, linting, unit tests, and coverage.
- Container builds, image scanning, signing, and registry publishing.
- Infrastructure validation and Terraform plan checks.
- Staging and production deployment with approvals and environment protection.
- Release creation, artifact publishing, and deployment notifications.

Keep application-specific behavior configurable through inputs, variables, parameters, or small extension points. Avoid turning a reusable pipeline into a framework with dozens of optional switches. A pipeline should expose a small, documented interface and own the common delivery policy.

### A practical separation

| Layer | Responsibility | Typical location |
| --- | --- | --- |
| Reusable workflow / template | Orchestrates jobs and policy | Shared workflow or CI template repository |
| Composite action / shared step | Packages a repeated set of steps | GitHub composite action or Jenkins shared-library step |
| Caller pipeline | Supplies project-specific inputs and triggers the workflow | Application repository |
| Environment configuration | Holds deployment-specific variables and approvals | CI/CD environment settings |

---

## 2. GitHub Actions: Reusable Workflows

A reusable workflow is a workflow file that declares `on: workflow_call`. The caller invokes it from a job with `uses`. It can accept typed inputs, receive secrets, and expose outputs.

### 2.1 Create the reusable workflow

Create `.github/workflows/reusable-ci.yml` in the shared repository, or in the same repository if only one repository will consume it.

```yaml
name: Reusable CI

on:
  workflow_call:
    inputs:
      node-version:
        description: Node.js version used by the project
        required: false
        type: string
        default: '22'
      run-build:
        description: Whether to run the production build
        required: false
        type: boolean
        default: true
    secrets:
      REGISTRY_TOKEN:
        description: Optional token for private package or registry access
        required: false
    outputs:
      artifact-name:
        description: Name of the uploaded build artifact
        value: ${{ jobs.build.outputs.artifact-name }}

permissions:
  contents: read

jobs:
  build:
    name: Install, test, and build
    runs-on: ubuntu-latest
    outputs:
      artifact-name: ${{ steps.artifact-name.outputs.value }}
    steps:
      - name: Checkout source
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test -- --ci

      - name: Build application
        if: ${{ inputs.run-build }}
        run: npm run build

      - name: Set artifact name
        id: artifact-name
        shell: bash
        run: echo "value=${GITHUB_REPOSITORY##*/}-build" >> "$GITHUB_OUTPUT"

      - name: Upload build output
        if: ${{ inputs.run-build }}
        uses: actions/upload-artifact@v4
        with:
          name: ${{ steps.artifact-name.outputs.value }}
          path: dist/
          if-no-files-found: error
          retention-days: 7
```

The example is a reusable template. Adjust the package manager, test command, build output directory, and runtime version to the consuming repository. The optional registry secret is declared for repositories that need it; do not pass secrets that the workflow does not use.

### 2.2 Call the reusable workflow

In an application repository, create `.github/workflows/ci.yml`:

```yaml
name: Application CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  ci:
    uses: your-org/engineering-workflows/.github/workflows/reusable-ci.yml@v1
    with:
      node-version: '22'
      run-build: true
    secrets:
      REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}
```

For a reusable workflow in the same repository, use a local path instead:

```yaml
jobs:
  ci:
    uses: ./.github/workflows/reusable-ci.yml
    with:
      node-version: '22'
```

### 2.3 Reusable deployment workflow

Deployment workflows should accept the target environment as an input and keep credentials in the environment or repository secret store.

```yaml
name: Reusable Deploy

on:
  workflow_call:
    inputs:
      environment:
        description: Deployment environment
        required: true
        type: string
      image:
        description: Container image including its immutable tag or digest
        required: true
        type: string
    secrets:
      DEPLOY_TOKEN:
        required: true

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    permissions:
      contents: read
    steps:
      - name: Authenticate to deployment platform
        env:
          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
        run: |
          test -n "$DEPLOY_TOKEN"
          echo "Deployment authentication is configured"

      - name: Deploy immutable image
        env:
          IMAGE: ${{ inputs.image }}
          TARGET_ENVIRONMENT: ${{ inputs.environment }}
        run: |
          echo "Deploying ${IMAGE} to ${TARGET_ENVIRONMENT}"
          # Replace this line with the platform-specific deployment command.
```

Call it from a release or deployment workflow:

```yaml
name: Deploy to staging

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    uses: your-org/engineering-workflows/.github/workflows/reusable-deploy.yml@v1
    with:
      environment: staging
      image: ghcr.io/your-org/your-app:${{ github.sha }}
    secrets:
      DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
```

Use a full commit SHA for a highly controlled supply chain, or a protected release tag such as `@v1` when your organization has a reviewed versioning policy. A caller cannot elevate the permissions granted by its own workflow; grant only the permissions the reusable workflow needs.

---

## 3. GitHub Actions: Composite Actions

A composite action packages reusable steps. It is not a full pipeline: it runs inside a job and shares that job's runner, workspace, and permissions.

Create `.github/actions/setup-node-project/action.yml`:

```yaml
name: Set up Node project
description: Check out dependencies and prepare a Node.js project
inputs:
  node-version:
    description: Node.js runtime version
    required: false
    default: '22'
runs:
  using: composite
  steps:
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
        cache: npm

    - name: Install dependencies
      shell: bash
      run: npm ci
```

Call the composite action from a regular workflow:

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v4

  - name: Prepare project
    uses: ./.github/actions/setup-node-project
    with:
      node-version: '22'

  - name: Test
    run: npm test
```

### Reusable workflow vs. composite action

| Capability | Reusable workflow | Composite action |
| --- | --- | --- |
| Reuses multiple jobs | Yes | No; runs inside one job |
| Defines runners and job dependencies | Yes | No |
| Defines workflow triggers | Caller does | Caller does |
| Accepts typed workflow inputs | Yes | Action inputs are strings |
| Best for | Shared CI/CD orchestration | Shared step sequences |

---

## 4. GitLab CI/CD: `include` and `extends`

GitLab pipelines can include a shared YAML file from another project. The shared file defines hidden jobs (names beginning with a dot) and common defaults. Consumer projects extend those jobs and override only what is project-specific.

### 4.1 Shared template repository

In the shared repository, create `templates/node-ci.yml`:

```yaml
stages:
  - validate
  - test
  - build

.node_defaults:
  image: node:22-alpine
  interruptible: true
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/
  before_script:
    - npm ci --cache .npm --prefer-offline

.node_lint:
  extends: .node_defaults
  stage: validate
  script:
    - npm run lint

.node_test:
  extends: .node_defaults
  stage: test
  script:
    - npm test -- --ci
  artifacts:
    when: always
    reports:
      junit: reports/junit.xml

.node_build:
  extends: .node_defaults
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 7 days
```

### 4.2 Consume the shared template

In the application repository's `.gitlab-ci.yml`:

```yaml
include:
  - project: platform/ci-templates
    ref: v1.2.0
    file: /templates/node-ci.yml

lint:
  extends: .node_lint

test:
  extends: .node_test

build:
  extends: .node_build
```

Pin `ref` to a release tag or commit SHA. Do not use an unreviewed moving branch for production templates. Keep deployment credentials in protected/masked CI/CD variables and protect production environments with the platform's approval and branch policies.

### 4.3 Parameterize a shared GitLab template

Use CI/CD inputs when the GitLab version and template context support them. For broadly compatible templates, define variables with documented defaults and interpolate them in supported YAML fields:

```yaml
variables:
  NODE_VERSION: '22'

.node_build:
  stage: build
  image: "node:${NODE_VERSION}-alpine"
  script:
    - npm ci
    - npm run build
```

The caller can set `NODE_VERSION` in project or group CI/CD variables. Avoid allowing arbitrary shell fragments to be injected through template variables.

---

## 5. Jenkins: Shared Libraries

Jenkins Shared Libraries move common pipeline logic into version-controlled Groovy code. A library can provide standard pipeline entry points, deployment helpers, and organization-wide defaults.

### 5.1 Shared library structure

A typical library repository uses this structure:

```text
jenkins-shared-library/
├── vars/
│   └── standardPipeline.groovy
└── src/
    └── com/example/ci/
        └── BuildMetadata.groovy
```

Create `vars/standardPipeline.groovy`:

```groovy
def call(Map config = [:]) {
    def appName = config.get('appName', env.JOB_NAME)
    def buildCommand = config.get('buildCommand', 'make build')
    def testCommand = config.get('testCommand', 'make test')

    pipeline {
        agent any

        options {
            timestamps()
            disableConcurrentBuilds()
            timeout(time: 30, unit: 'MINUTES')
        }

        stages {
            stage('Checkout') {
                steps {
                    checkout scm
                }
            }

            stage('Test') {
                steps {
                    sh testCommand
                }
            }

            stage('Build') {
                steps {
                    sh buildCommand
                }
            }

            stage('Publish metadata') {
                steps {
                    echo "Completed standard pipeline for ${appName}"
                }
            }
        }
    }
}
```

### 5.2 Configure the library

In Jenkins, configure the shared library under **Manage Jenkins → System → Global Pipeline Libraries**. Give it a stable name, such as `platform-pipelines`, and configure a default version that points to a protected release tag.

### 5.3 Call the library from a Jenkinsfile

```groovy
@Library('platform-pipelines@v1.2.0') _

standardPipeline(
    appName: 'payments-api',
    testCommand: 'make test-ci',
    buildCommand: 'make package'
)
```

For production environments, keep credentials in Jenkins Credentials and retrieve them using scoped `withCredentials` blocks. Do not put credentials in library source code, parameters, or logs. Review changes to shared libraries as carefully as changes to production pipeline code because one library update can affect many repositories.

---

## 6. CircleCI: Orbs and Reusable Commands

CircleCI Orbs package reusable commands, executors, and jobs. Use a small internal orb for workflows shared across multiple repositories, then reference a pinned orb version from consumer configurations.

### 6.1 Define a reusable orb

A simplified orb definition might look like this:

```yaml
version: 2.1

commands:
  install-and-test:
    description: Install dependencies and run the test suite
    steps:
      - run:
          name: Install dependencies
          command: npm ci
      - run:
          name: Run tests
          command: npm test -- --ci

jobs:
  build-and-test:
    parameters:
      node-version:
        type: string
        default: '22.0'
    docker:
      - image: cimg/node:<< parameters.node-version >>
    steps:
      - checkout
      - install-and-test
      - run:
          name: Build
          command: npm run build
```

The snippet illustrates the structure; a published orb must declare its orb dependencies and pass CircleCI's orb validation. Keep the orb source in a controlled repository and publish reviewed semantic versions.

### 6.2 Consume a published orb

```yaml
version: 2.1

orbs:
  platform-ci: your-org/platform-ci@1.2.0

workflows:
  validate:
    jobs:
      - platform-ci/build-and-test:
          node-version: '22.0'
```

Use restricted contexts for secrets. Do not expose production contexts to pull requests from untrusted forks. Pin orb versions and make changes through release notes and compatibility testing.

---

## 7. Design Rules for Production Reuse

### Interface design

1. **Keep inputs explicit.** Declare supported inputs, types, defaults, and required values.
2. **Use stable outputs.** Give outputs predictable names and document their meaning.
3. **Fail early.** Validate required inputs and configuration before running expensive jobs.
4. **Keep a narrow scope.** One reusable pipeline should solve one coherent delivery problem.
5. **Preserve useful logs.** Shared abstractions should improve consistency without hiding the underlying command output.

### Security and supply-chain controls

1. **Least privilege:** grant the minimum repository, cloud, and deployment permissions needed by the workflow.
2. **Pin dependencies:** use release tags or immutable commit SHAs for shared workflows, actions, orbs, and templates.
3. **Protect secrets:** pass credentials through the CI platform's secret store; never echo them or bake them into artifacts.
4. **Separate trust zones:** do not send production secrets to untrusted pull requests or forked code.
5. **Verify artifacts:** prefer immutable image digests, signed artifacts, provenance, and vulnerability scanning before deployment.
6. **Require protected approvals:** production deployment should use protected environments and an auditable approval path.

### Versioning and compatibility

Use semantic versioning for shared pipeline libraries where practical:

- **Patch:** backwards-compatible fixes, safe defaults, or documentation corrections.
- **Minor:** backwards-compatible inputs or capabilities.
- **Major:** removed inputs, changed behavior, or other breaking changes.

Publish release notes and test new versions against representative consumer repositories. Avoid changing a shared default in a way that unexpectedly changes production deployment behavior.

### Rollout strategy

1. Create the shared workflow in a dedicated location with a clear owner.
2. Validate it in a sandbox repository using non-production credentials.
3. Pin a release and migrate one low-risk service first.
4. Compare logs, artifacts, permissions, duration, and deployment behavior with the previous pipeline.
5. Roll out to additional repositories in batches.
6. Keep a rollback path to the previous known-good version.

---

## 8. Troubleshooting Reusable Pipelines

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| GitHub workflow is not callable | `workflow_call` is missing or in the wrong file | Confirm the reusable workflow is under `.github/workflows/` and declares `on: workflow_call` |
| Caller cannot access a secret | Secret is not declared or passed | Declare it under `workflow_call.secrets` and map it in the caller |
| Permission denied in reusable job | Caller permissions are too restrictive or token scope is missing | Review caller and job-level `permissions`; grant only what is required |
| GitLab include cannot be resolved | Wrong project, ref, or file path | Check project visibility, pinned ref, and absolute template path |
| GitLab job configuration conflicts | Incompatible keys merged through `extends` | Inspect the merged configuration and simplify parent templates |
| Jenkins library step is not found | Library name or `vars` filename does not match | Check the configured library name and Groovy file capitalization |
| CircleCI orb cannot be resolved | Incorrect namespace, version, or unpublished orb | Validate orb publication and run the configuration validator |
| Shared change breaks many services | A breaking change was released under a floating version | Pin consumers, add compatibility tests, and publish a new major version |

---

## 9. Validation Checklist

Before adopting a reusable pipeline in production, verify that:

- [ ] The callable workflow/template is stored in a controlled, reviewable repository.
- [ ] Inputs, outputs, secrets, and required permissions are documented.
- [ ] The consuming pipeline pins a reviewed version.
- [ ] Build, tests, artifacts, and failure paths work in a sandbox repository.
- [ ] Production credentials are unavailable to untrusted code.
- [ ] Deployment approvals and environment protections are enabled.
- [ ] Logs do not expose secrets or sensitive deployment data.
- [ ] A rollback path exists for the shared workflow or template.

---

## Learning Resources

- [GitHub Actions — Reusing Workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [GitHub Actions — Creating Composite Actions](https://docs.github.com/en/actions/tutorials/creating-a-composite-action)
- [GitLab CI/CD — Reuse and Include](https://docs.gitlab.com/ci/yaml/includes/)
- [Jenkins — Shared Libraries](https://www.jenkins.io/doc/book/pipeline/shared-libraries/)
- [CircleCI — Orbs](https://circleci.com/docs/orbs/)
