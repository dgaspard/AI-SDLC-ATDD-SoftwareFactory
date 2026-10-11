# Delivery contract (SPEC-08)

The delivery equivalent of the [runtime contract](../contracts/runtime-contract.md).
It fixes the few names and entry points the delivery features need, so that whatever
produces the delivery code (CDK in JavaScript, CDK in Python, plain CloudFormation, a
human) can be replaced without changing a feature. Everything not fixed here is the
builder's choice. Protected once frozen; each rule is checked by the features listed.

| Rule | Requirement | Checked by |
| --- | --- | --- |
| DC-001 | Every runnable project (each `services/<name>/` with a `start` script, and `frontend/`) has a `Dockerfile` in its folder. Build context is the repository root, because services read `spec/contracts/` and the frontend serves `spec/frontend/`. | `local/images.feature` (CTL-001) |
| DC-002 | `infra/synth` is an executable that writes CloudFormation JSON to `infra/out/<env>/*.template.json` for `env` in `org`, `nonprod`, `prod`. It needs no AWS credentials and no network. | `infrastructure/`, `cost/`, `organization/` (every `@tier:template` scenario) |
| DC-003 | `infra/deploy <env>` deploys and `infra/destroy <env>` removes one environment (`nonprod` or `prod`). Only CI runs them. | `cost/budget.feature` (CTL-043), `agent-governance/provenance.feature` (CTL-023) |
| DC-004 | In every ECS task definition, each container's `Name` is its project folder name (`customer`, `reservation`, `veterinarian-services`, `checkout`, `frontend`). | `infrastructure/templates.feature` (CTL-033, CTL-034) |
| DC-005 | `compose.yaml` at the repository root starts every runnable project (service name = folder name) plus `payment-fake` and `otel-collector`. | `local/compose.feature` (CTL-005) |
| DC-006 | Workflows that build, deploy or destroy are named `.github/workflows/delivery-*.yml`. Everything else in `.github/` is the human-owned root of trust (`root-of-trust.json`). | `pipeline/`, `agent-governance/` |
| DC-007 | Every image build publishes an AI provenance attestation whose predicate type is `https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/ai-provenance/v1` and whose predicate matches `contracts/ai-provenance.v1.schema.json`. | `agent-governance/provenance.feature` (CTL-021); predicate schema validation is planned with EVID-01 |
| DC-008 | `infra/deploy prod` writes `infra/out/prod/deployed-images.json`: a list of `{ "project": <folder name>, "image": <registry/repo@sha256:digest> }` for every image it deployed. | `agent-governance/live-governance.feature` (CTL-026) |
| DC-009 | A-21 thin workflows: every `run:` step in `.github/workflows/delivery-*.yml` is a single call to an executable under `scripts/ci/` or `infra/` with plain arguments (no `${{ }}`, pipes, `&&`, redirects or multi-line scripts). Values reach scripts through `env:`. | `pipeline/workflows.feature` (CTL-027) |
| DC-010 | A-23: each prod promotion writes a release record matching `contracts/release-record.v1.schema.json` with `scripts/ci/release-record`, publishes it as a GitHub Release, and attests it with predicate type `https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/release-record/v1`. | `evidence/release-record.feature` (CTL-060) |

## Fixed values

| Name | Value | Why |
| --- | --- | --- |
| AWS region | `us-east-1` (`catalog.yaml` → `region`) | One region keeps the cost ceiling and the SCP region allow-list simple |
| Environments | `local`, `nonprod`, `prod` (and `org` for the management account) | A-16..A-20 |
| TTL tag | `petclinic:ttl` = whole minutes after creation; at most 15 in non-prod and 30 in prod (`catalog.yaml` → `ttl_minutes`) | $25/month ceiling. Non-prod lives as long as its tests; prod lives as long as someone is looking at it (decided 2026-10-10) |
| Required checks | `Protected specs and tests unchanged`, `Delivery spec` (`root-of-trust.json` → `requiredChecks`): job names in `guard.yml` and required by the `main` ruleset | CTL-022, CTL-024 |
| Security gate switch | `SECURITY_GATE=fail` makes the portable scan scripts exit non-zero on findings; unset, they report only | Local stays informational, CI is the gate (A-13) |
