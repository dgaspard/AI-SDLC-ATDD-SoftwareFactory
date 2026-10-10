# Delivery environments: what runs where

<!-- Generated from spec/delivery/catalog.yaml by `npm --prefix spec/delivery run catalog:render`.
     Do not edit by hand: a delivery scenario fails when this file and the catalog differ. -->

Every tool, service and check used to build, run and govern the system, sorted by environment.
**Required** means new work gets it by default and the pipeline enforces it. **Informational**
means it runs and reports but does not block. Each enforced row names the executable scenarios
(`CTL-xxx` in `spec/delivery/features/`) or existing checks that prove it; a planned row has none yet.
**Specified, awaiting X** means the scenarios exist but the delivery code is built in backlog item X;
until then they run as information only.

Region: `us-east-1`. Monthly budget ceiling: $25.

## Local

The agent's fast loop and the developer's laptop. Same images as the cloud, started with Docker Compose, test endpoints on, OTLP test collector, payment fake. Static and template checks run here; nothing needs AWS credentials.

| Practice | Tools | Use | Why here | Enforced by | Status |
| --- | --- | --- | --- | --- | --- |
| Hardened container images | Docker | required | The same image runs locally and in the cloud, so local results carry over. | CTL-001, CTL-002, CTL-003, CTL-004 | specified, awaiting ENV-01 |
| Local system in one command | Docker Compose | required | Gives agents and developers the whole system without cloud access. | CTL-005 | specified, awaiting ENV-01 |
| Code, secret and dependency scans | Semgrep, detect-secrets, npm audit | informational | Agents see findings while building; SECURITY_GATE unset, so they report only (A-13). | CTL-013 | specified, awaiting CI-02 |
| Pre-push full-suite verification | git hooks, spec/run-all.js | required | Catches failures before they reach CI. | — | planned |
| Human-owned root of trust | guard.yml, CODEOWNERS, spec/guard | required | The protect-paths hook stops agents editing the spec. | CTL-022 | enforced |
| OTLP test collector | spec/harness/collector | required | OBS rules are asserted against real traces. | `spec/tests/observability`, `spec/tests/harness/collector.test.js` | enforced |
| Structured JSON logs | services/platform | required | Same format everywhere. | — | planned |
| Local performance thresholds | spec/tests/performance | required | Agents need the signal while building. | `spec/tests/performance`, `spec/features/performance/local-demo.feature` | enforced |

### Defaults for new work in Local

- [ ] Hardened container images (specified, awaiting ENV-01)
- [ ] Local system in one command (specified, awaiting ENV-01)
- [ ] Pre-push full-suite verification (planned)
- [x] Human-owned root of trust
- [x] OTLP test collector
- [ ] Structured JSON logs (planned)
- [x] Local performance thresholds

### Deliberately not used in Local

- **Least-privilege, pinned workflows**: Workflows run only in CI.
- **Short-lived AWS credentials (OIDC)**: Local never touches AWS.
- **Software bill of materials**: Generated where images are published.
- **Protected main branch**: Enforced by GitHub, not locally.
- **Signed build provenance (SLSA)**: Local images are never promoted.
- **AI provenance attestation**: Local images are never promoted.
- **Human approval to release**: Nothing is released from local.
- **Organization guardrails (SCPs)**: No AWS locally.
- **Audit trail and configuration history**: No AWS locally.
- **Hardened ECS Fargate tasks**: Docker Compose runs the images locally.
- **Secrets from Secrets Manager**: Local uses the harness's demo-only value.
- **Least-privilege IAM**: No AWS locally; the template check still runs offline.
- **Network hardening**: Not applicable.
- **Encrypted, expiring container logs**: Compose shows logs on stdout.
- **Traces in the cloud**: The OTLP test collector covers local.
- **SLOs and alarms**: PERF-01 covers local responsiveness.
- **Deployed load smoke test**: PERF-01 covers local.
- **No NAT gateway**: Not applicable.
- **Budget alarm**: Not applicable.
- **Ephemeral environments with a TTL**: Compose down is enough.

## Non-prod

An ephemeral AWS member account environment created by CI on merge, tested with the live tier, then destroyed when its TTL expires. Test endpoints stay on: this is a test application with no real data.

| Practice | Tools | Use | Why here | Enforced by | Status |
| --- | --- | --- | --- | --- | --- |
| Hardened container images | Docker | required | Non-prod tests the exact image prod will run. | CTL-001, CTL-002, CTL-003, CTL-004 | specified, awaiting ENV-01 |
| Least-privilege, pinned workflows | GitHub Actions | required | The pipeline that deploys non-prod is itself supply-chain surface. | CTL-010, CTL-011 | enforced |
| Short-lived AWS credentials (OIDC) | GitHub OIDC, AWS IAM | required | Only CI deploys, and only with short-lived credentials. | CTL-012 | specified, awaiting CI-02 |
| Code, secret and dependency scans | Semgrep, detect-secrets, npm audit | required | SECURITY_GATE=fail; a finding blocks the image from being built. | CTL-013 | specified, awaiting CI-02 |
| Software bill of materials | Syft | required | Generated when the image is built. | CTL-014 | specified, awaiting CI-02 |
| Protected main branch | GitHub rulesets | required | Nothing reaches non-prod except through a reviewed merge. | CTL-024 | enforced |
| Human-owned root of trust | guard.yml, CODEOWNERS, spec/guard | required | CI's own run of the spec is authoritative. | CTL-022 | enforced |
| Signed build provenance (SLSA) | GitHub artifact attestations | required | Created when the image is built. | CTL-020 | specified, awaiting CI-02 |
| AI provenance attestation | GitHub artifact attestations, in-toto | required | Created when the image is built. | CTL-021 | specified, awaiting CI-02 |
| Organization guardrails (SCPs) | AWS Organizations | required | Guardrails apply to every member account. | CTL-050, CTL-051, CTL-052 | specified, awaiting ENV-02 |
| Audit trail and configuration history | AWS CloudTrail, AWS Config | required | Every cloud change is recorded. | — | planned |
| Hardened ECS Fargate tasks | Amazon ECS on AWS Fargate | required | The same task shape as prod, with test endpoints on. | CTL-032, CTL-033 | specified, awaiting ENV-02 |
| Secrets from Secrets Manager | AWS Secrets Manager | required | No secret in templates, images or logs. | CTL-034 | specified, awaiting ENV-02 |
| Least-privilege IAM | AWS IAM, CloudFormation Guard | required | Over-broad roles are the most common cloud finding. | CTL-031 | specified, awaiting ENV-02 |
| Encrypted, expiring container logs | Amazon CloudWatch Logs, AWS KMS | required | Logs are audit information (AU-9). | CTL-030 | specified, awaiting ENV-02 |
| Traces in the cloud | AWS Distro for OpenTelemetry, AWS X-Ray | required | OBS rules run against the deployed environment in the live tier. | — | planned |
| Structured JSON logs | services/platform | required | Same format everywhere. | — | planned |
| SLOs and alarms | Amazon CloudWatch alarms | informational | Tune alarms before they page anyone. | — | planned |
| Deployed load smoke test | spec/tests/performance | required | Finds network and cold-start costs local can't show. | — | planned |
| No NAT gateway | Amazon VPC | required | $25 ceiling. | CTL-040 | specified, awaiting ENV-02 |
| Budget alarm | AWS Budgets | required | Spend is visible before it surprises anyone. | CTL-041 | specified, awaiting ENV-02 |
| Ephemeral environments with a TTL | GitHub Actions schedule, infra/destroy | required | Exists only while it is being tested: 15 minutes. | CTL-042, CTL-043 | specified, awaiting ENV-02 |

### Defaults for new work in Non-prod

- [ ] Hardened container images (specified, awaiting ENV-01)
- [x] Least-privilege, pinned workflows
- [ ] Short-lived AWS credentials (OIDC) (specified, awaiting CI-02)
- [ ] Code, secret and dependency scans (specified, awaiting CI-02)
- [ ] Software bill of materials (specified, awaiting CI-02)
- [x] Protected main branch
- [x] Human-owned root of trust
- [ ] Signed build provenance (SLSA) (specified, awaiting CI-02)
- [ ] AI provenance attestation (specified, awaiting CI-02)
- [ ] Organization guardrails (SCPs) (specified, awaiting ENV-02)
- [ ] Audit trail and configuration history (planned)
- [ ] Hardened ECS Fargate tasks (specified, awaiting ENV-02)
- [ ] Secrets from Secrets Manager (specified, awaiting ENV-02)
- [ ] Least-privilege IAM (specified, awaiting ENV-02)
- [ ] Encrypted, expiring container logs (specified, awaiting ENV-02)
- [ ] Traces in the cloud (planned)
- [ ] Structured JSON logs (planned)
- [ ] Deployed load smoke test (planned)
- [ ] No NAT gateway (specified, awaiting ENV-02)
- [ ] Budget alarm (specified, awaiting ENV-02)
- [ ] Ephemeral environments with a TTL (specified, awaiting ENV-02)

### Deliberately not used in Non-prod

- **Local system in one command**: ECS runs the images in the cloud.
- **Pre-push full-suite verification**: CI reruns everything independently.
- **Human approval to release**: Non-prod deploys automatically on merge so it gives fast feedback.
- **Network hardening**: Deferred 2026-10-10: test application, no data to protect. See PROJECT-PLAN deferred items.
- **OTLP test collector**: Replaced by the AWS collector.
- **Local performance thresholds**: Replaced by the deployed load smoke test.

## Prod

A production-shaped AWS member account environment. It runs only images already proven in non-prod, after a human approves, for a short promotion window before teardown. Test endpoints are off.

| Practice | Tools | Use | Why here | Enforced by | Status |
| --- | --- | --- | --- | --- | --- |
| Hardened container images | Docker | required | Prod runs only images built and tested earlier. | CTL-001, CTL-002, CTL-003, CTL-004 | specified, awaiting ENV-01 |
| Least-privilege, pinned workflows | GitHub Actions | required | The pipeline that deploys prod is itself supply-chain surface. | CTL-010, CTL-011 | enforced |
| Short-lived AWS credentials (OIDC) | GitHub OIDC, AWS IAM | required | Only CI deploys, and only with short-lived credentials. | CTL-012 | specified, awaiting CI-02 |
| Code, secret and dependency scans | Semgrep, detect-secrets, npm audit | required | Prod promotes only images that passed the non-prod gate. | CTL-013 | specified, awaiting CI-02 |
| Software bill of materials | Syft | required | The same SBOM travels with the promoted image. | CTL-014 | specified, awaiting CI-02 |
| Protected main branch | GitHub rulesets | required | Nothing reaches prod except through a reviewed merge. | CTL-024 | enforced |
| Human-owned root of trust | guard.yml, CODEOWNERS, spec/guard | required | CI's own run of the spec is authoritative. | CTL-022 | enforced |
| Signed build provenance (SLSA) | GitHub artifact attestations | required | Verified before deploying. | CTL-020 | specified, awaiting CI-02 |
| AI provenance attestation | GitHub artifact attestations, in-toto | required | Verified before deploying. | CTL-021 | specified, awaiting CI-02 |
| Human approval to release | GitHub Environments | required | An agent can build and test, but only a human can release. | CTL-023, CTL-025, CTL-026 | partly enforced, awaiting ENV-03 |
| Organization guardrails (SCPs) | AWS Organizations | required | Guardrails apply to every member account. | CTL-050, CTL-051, CTL-052 | specified, awaiting ENV-02 |
| Audit trail and configuration history | AWS CloudTrail, AWS Config | required | Every cloud change is recorded. | — | planned |
| Hardened ECS Fargate tasks | Amazon ECS on AWS Fargate | required | Test endpoints off. | CTL-032, CTL-033 | specified, awaiting ENV-02 |
| Secrets from Secrets Manager | AWS Secrets Manager | required | No secret in templates, images or logs. | CTL-034 | specified, awaiting ENV-02 |
| Least-privilege IAM | AWS IAM, CloudFormation Guard | required | Over-broad roles are the most common cloud finding. | CTL-031 | specified, awaiting ENV-02 |
| Encrypted, expiring container logs | Amazon CloudWatch Logs, AWS KMS | required | Logs are audit information (AU-9). | CTL-030 | specified, awaiting ENV-02 |
| Traces in the cloud | AWS Distro for OpenTelemetry, AWS X-Ray | required | Production telemetry. | — | planned |
| Structured JSON logs | services/platform | required | Same format everywhere. | — | planned |
| SLOs and alarms | Amazon CloudWatch alarms | required | Prod must say when it is unhealthy. | — | planned |
| No NAT gateway | Amazon VPC | required | $25 ceiling. | CTL-040 | specified, awaiting ENV-02 |
| Budget alarm | AWS Budgets | required | Spend is visible before it surprises anyone. | CTL-041 | specified, awaiting ENV-02 |
| Ephemeral environments with a TTL | GitHub Actions schedule, infra/destroy | required | Up only for a 30-minute promotion window. If nobody is looking at it, it doesn't need to be up. | CTL-042, CTL-043 | specified, awaiting ENV-02 |

### Defaults for new work in Prod

- [ ] Hardened container images (specified, awaiting ENV-01)
- [x] Least-privilege, pinned workflows
- [ ] Short-lived AWS credentials (OIDC) (specified, awaiting CI-02)
- [ ] Code, secret and dependency scans (specified, awaiting CI-02)
- [ ] Software bill of materials (specified, awaiting CI-02)
- [x] Protected main branch
- [x] Human-owned root of trust
- [ ] Signed build provenance (SLSA) (specified, awaiting CI-02)
- [ ] AI provenance attestation (specified, awaiting CI-02)
- [ ] Human approval to release (partly enforced, awaiting ENV-03)
- [ ] Organization guardrails (SCPs) (specified, awaiting ENV-02)
- [ ] Audit trail and configuration history (planned)
- [ ] Hardened ECS Fargate tasks (specified, awaiting ENV-02)
- [ ] Secrets from Secrets Manager (specified, awaiting ENV-02)
- [ ] Least-privilege IAM (specified, awaiting ENV-02)
- [ ] Encrypted, expiring container logs (specified, awaiting ENV-02)
- [ ] Traces in the cloud (planned)
- [ ] Structured JSON logs (planned)
- [ ] SLOs and alarms (planned)
- [ ] No NAT gateway (specified, awaiting ENV-02)
- [ ] Budget alarm (specified, awaiting ENV-02)
- [ ] Ephemeral environments with a TTL (specified, awaiting ENV-02)

### Deliberately not used in Prod

- **Local system in one command**: ECS runs the images in the cloud.
- **Pre-push full-suite verification**: CI reruns everything independently.
- **Network hardening**: Deferred 2026-10-10: test application, no data to protect; would also need a NAT gateway or VPC endpoints, which breaks the budget.
- **OTLP test collector**: Replaced by the AWS collector.
- **Local performance thresholds**: SLOs replace load tests in prod.
- **Deployed load smoke test**: No synthetic load in prod.

## Cost notes

| Practice | Cost |
| --- | --- |
| Hardened container images | Free to build; ECR storage costs cents per month. |
| Local system in one command | Free. |
| Least-privilege, pinned workflows | Free. |
| Short-lived AWS credentials (OIDC) | Free. |
| Code, secret and dependency scans | Free. |
| Software bill of materials | Free. |
| Pre-push full-suite verification | Free. |
| Protected main branch | Free. |
| Human-owned root of trust | Free. |
| Signed build provenance (SLSA) | Free. |
| AI provenance attestation | Free. |
| Human approval to release | Free. |
| Organization guardrails (SCPs) | Free. |
| Audit trail and configuration history | One CloudTrail trail is free; AWS Config costs about $0.003 per recorded item. Limit recording to the resource types we use. |
| Hardened ECS Fargate tasks | About $9 per task per month at the smallest size if always on; ephemeral environments are why the system fits the budget. |
| Secrets from Secrets Manager | $0.40 per secret per month. |
| Least-privilege IAM | Free. |
| OTLP test collector | Free. |
| Encrypted, expiring container logs | $0.50 per GB ingested; a KMS key costs $1 per month. |
| Traces in the cloud | X-Ray: 100,000 traces per month free. |
| Structured JSON logs | Free. |
| SLOs and alarms | $0.10 per alarm per month. |
| Local performance thresholds | Free. |
| Deployed load smoke test | A few minutes of task time per run. |
| No NAT gateway | Saves about $32 per month per environment. |
| Budget alarm | The first two budgets are free. |
| Ephemeral environments with a TTL | Turns a fixed monthly bill into cents per test run (about $0.04 for 15 minutes). |
