# START-02 design: a factory core that many applications use

Status and scope: [START-02 in BACKLOG](../../BACKLOG.md#start-02--software-factory-template-repo-dev-container-and-organization-layer).

## Goal

Create and maintain several applications with the same factory. The method, harness,
gates, evidence and delivery controls live in one versioned **factory core**. Each
application owns only its business rules, specifications, code and configuration, and
adopts core upgrades through its own reviewed freeze.

## Decisions

| Status | Decision |
|---|---|
| Decided | [A-26](../decisions/architecture.md): the core comes before durable state. |
| Proposed | **One repository per application, one for the core.** Each application (or client agency) owns its access, code owners, approvals and rules, which matches the core-versus-project split. A monorepo would make cross-app changes easier but blurs ownership. |
| Proposed | **The runtime contract (A-02) is the harness's interface, versioned as runtime contract v1.** Applications conform natively or through an adapter. |
| Proposed | **`factory.config.json` is each application's single project config**, validated by a schema the core owns. Nothing in the core names an application. |
| Proposed | **Core packages are released as pinned versions** (GitHub Packages, npm), and each application pins exact versions. |
| Proposed | **Each application keeps a small, human-owned `guard.yml`** that calls the core's reusable workflow, pinned by SHA. The root of trust stays per repository (A-20). |
| Proposed | **Organization rulesets** apply to every factory repository through a repository property, replacing the per-repository CI-02 checklist. |
| Proposed | **A core release must pass the full gate of PetClinic (the reference application) and at least one other application** (the ENG-02 graduation test, made routine). |

## Three layers

1. **Factory core** (one repository, released as packages).
2. **Application repositories** (one per application): `factory.config.json`, decisions,
   domain model, contracts, feature files, step definitions, delivery-control adoption,
   code, and pinned core versions.
3. **Organization layer:** the agent GitHub App installed across the organization,
   organization rulesets, the reusable workflows, and cloud accounts.

## Core packages, mapped from today's files

| Package | Contents today | Notes |
|---|---|---|
| `runner` | `spec/run-all.js`, the test-policy format | The policy's `{service}` rules are generated from the config's services |
| `guard` | `spec/guard/`, the protected manifest, `.claude/hooks/protect-paths.mjs`, deny rules, an `AGENTS.md` template | Protected paths come from the config |
| `harness` | `spec/harness/` (starting services, reset, clock, OTLP collector), `spec/fakes/`, HTTP, auth and schema helpers | Reads services from the config instead of the hard-coded project list |
| `delivery-spec` | `spec/delivery/` | Already portable (A-19); the catalog's names, region and budget move to the config |
| `evidence` | `tools/evidence/`, the change-evidence contract and its tests | Its contract and tests move out of `spec/delivery/contracts/` and `spec/tests/evidence/` into this package (step 2) |
| `dora` | `tools/dora/`, the counting rules, contracts and tests | Same: they leave `spec/delivery/` and `spec/tests/dora/` for this package (step 2) |
| `review`, `security` | `tools/review/portable/`, `tools/security/portable/`, the reviewer prompt | Already split portable from project-specific (A-15) |
| `github` | `tools/github/agent.mjs` | App identity and repository come from the config |
| workflow | the gate job in `guard.yml` | Becomes a reusable workflow |

Stays in each application: features, contracts, seed data, step definitions, application
tests that are domain-specific (auth rules, observability rules, browser journeys,
performance workload), decisions, and the code.

## `factory.config.json` (sketch)

A partial sketch. The harness also needs each service's dependencies, telemetry name,
contract file and URL variable names, and the fakes (payment on 4010); step 1 settles the
full schema.

```json
{
  "factoryVersion": "1.x",
  "application": { "id": "petclinic", "repository": "dgaspard/AI-SDLC-ATDD-SoftwareFactory" },
  "agentApp": { "id": 5265528, "slug": "ai-sdlc-bdd-agent" },
  "runtimeContract": 1,
  "services": [
    { "id": "customer", "dir": "services/customer", "port": 4001, "health": "/health", "reset": "/test/reset" }
  ],
  "frontend": { "dir": "frontend", "port": 3000 },
  "telemetry": { "namespace": "petclinic", "collectorPort": 4318 },
  "clock": { "env": "CLINIC_NOW", "endpoint": "/test/clock", "timeZone": "America/Chicago" },
  "delivery": { "region": "us-east-1", "budgetUsd": 25, "ttlTag": "petclinic:ttl" }
}
```

## The harness across applications

- **Interface:** runtime contract v1 (today's RT-001..RT-009 in
  `spec/contracts/runtime-contract.md`). Each service has `setup` and `start` scripts, reads
  its configuration from environment variables, answers `/health`, exposes
  `/test/reset` and `/test/clock` when test endpoints are on, and exports OTLP traces. Tests stay black-box over HTTP, so
  applications can be written in any language.
- **Configuration, not code:** the harness starts and resets whatever services the config
  lists. Step definitions stay in each application but are built from core helpers.
- **Brownfield adapter (after durable state):** an application that can't adopt the
  contract gets a companion container that provides reset (for example, database snapshot
  and restore) and clock control.

## Maintaining many applications

- **Upgrades are pull requests.** A new core version arrives in each application as a pull
  request. Adopting it, especially new delivery controls, goes through that application's
  human freeze.
- **Versioned contracts stay compatible.** Reports (`change-evidence` v1, `dora-1`) and the
  config schema are versioned, so a portfolio view can read every application.
- **Starting an application:** `factory init` creates a repository from the template and
  dev container. Its delivery controls start as `@awaiting`, and its red checks are the
  onboarding checklist (START-01).

## Steps

START-02 closes after step 4. Brownfield adapters are phase 4 work, after DATA-01.

| Step | Work | Done when |
|---|---|---|
| 1. One project config | Add `factory.config.json` and its schema; the harness, test policy, root of trust, catalog, wrapper and tools read it. Renaming `PETCLINIC_TEST_ENDPOINTS` changes the runtime contract, a protected freeze | Nothing in the core names PetClinic; the full gate passes unchanged; a scan finds no hard-coded application names in core paths |
| 2. Packages inside this repository | Split the core into packages under one folder; PetClinic consumes them through package interfaces only | The full gate passes; each package has its own tests |
| 3. Core repository | Move the core to its own repository; publish pinned versions; the reusable workflow; organization rulesets | PetClinic runs on published versions with the same gate result |
| 4. Second application | A small greenfield application in a different domain, built on the core | Its own gate and evidence pass; onboarding effort and every change it forced are recorded |

## Risks

- **Over-generalizing from one application.** Mitigation: keep the core small; step 4 is
  the real test, and anything it doesn't need stays out.
- **Core upgrades become a burden.** Mitigation: semantic versions, small releases, and a
  compatibility rule that contract versions never change meaning.
- **Protected-file boundaries move.** Splitting packages changes what the guard protects.
  Each move is a reviewed freeze, and the gate must pass before and after.
- **The runtime contract is too strict for real applications.** Mitigation: the adapter
  route, and measuring it on the second application before brownfield work.

## Open questions

- Which domain makes the best second application?
- Who owns core releases once more than one person maintains applications?
- Package registry: GitHub Packages, or a private registry on the client's side?
