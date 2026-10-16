# Specification-first development workflow

## Purpose

This is the working process for every capability the factory builds, in the
reference project and beyond. Repository artifacts preserve decisions between sessions;
conversation history is helpful context, not the only record of requirements.

The method uses BDD, API contracts, observability contracts and delivery controls to
guide implementation and reconstruction. Keep in-memory storage and the fake payment
boundary unless the user intentionally changes scope. Preserve the `1.0` baseline.

## Domain contract testing

Domain objects exposed across service boundaries are contract surfaces. Test their
serialized schemas, references, state transitions, and invariants. Do not create
tests whose only purpose is to exercise trivial getters, setters, constructors, or
private storage. The service may replace classes with records or reorganize its
internal modules while preserving the published representation and behavior.

When a domain contract changes, update the domain specification, machine-readable
schema, examples, consumer/provider contract tests, and implementation deliberately.
When only implementation changes, preserve those tests. The current schemas are in
`spec/contracts/domain.openapi.json`, with decisions recorded in
`docs/specs/schema-decisions.md`.

## Start each task

Read `AGENTS.md`, this workflow, and the relevant item in [BACKLOG.md](../BACKLOG.md).
Inspect the current files and Git diff before making changes. Read the affected
features, contracts, and tests; do not assume a previous conversation describes
the current checkout. Distinguish approved expectations from proposed designs.
Name the approved objective and backlog item the task serves; if there isn't one, ask.

## Reference-application build sequence (user-directed)

The order PetClinic was built in. The proposed guided product experience (GUIDE-01 in
`BACKLOG.md`) generalizes it for any application; until that is approved, this remains
the sequence used here.

1. Lock business decisions, domain model, and schemas (specs only; no tests or code).
2. Write **service** feature files, one folder per service (D-28).
2a. Set the language-neutral architecture and test protection first: repository
   layout, runtime contract, black-box harness, telemetry collector, guard
   (A-01–A-07 in docs/decisions/architecture.md; BACKLOG ARCH-01..04, GUARD-01).
3. Derive each service's API contract from its features and the domain schemas.
4. Write service and schema contract tests. Every test must fail on creation.
   These tests are protected: the implementing agent may not modify them.
5. Write **workflow** feature files for journeys that span services, then their tests (also red).
6. Ask the agent to build the whole application until every test passes.
7. Final experiment: delete a service and have the agent rebuild it from the specs and tests.

## Delivery sequence for each capability

1. **Specify behavior first.** Write business-readable feature scenarios, including
   important rejection and failure cases. Identify ownership and resolve decisions
   that would change behavior rather than silently guessing.
2. **Design service/API contracts.** Derive operations from those scenarios. Define
   requests, responses, errors, state changes, dependencies, and any retry or
   idempotency semantics. Refine features if design exposes a gap.
3. **Define implementation standards and telemetry obligations.** Reuse the working
   agreement and [observability standard](observability.md). Add explicit telemetry
   contracts and stable OBS IDs according to [SPEC-03](specs/observability-traceability.md).
   Add lint/static checks for coding standards where useful; not every standard
   can be established by a runtime assertion.
4. **Review the specification set.** Check that BDD, API, and observability expectations
   agree. Record the user's accepted decisions in the backlog or a linked specification.
   Resolve outstanding behavior decisions before dependent implementation. Existing
   approval remains valid; do not repeatedly request approval for the same scope.
5. **Create executable checks before application code.** Implement BDD steps, API
   assertions, and observability assertions. Test fixtures, service startup helpers,
   and the deterministic payment fake may be built here. They must not substitute
   for the application behavior being verified.
6. **Establish the intentional failing baseline.** Run each affected suite. Record
   the missing behavior and actual failure. Fix tooling, fixtures, or dependency
   problems so those are not misrepresented as evidence of missing product behavior.
7. **Implement the agreed behavior.** Prompt the agent with the backlog item and
   specification paths. Require all agreed checks to pass without weakening,
   deleting, or skipping tests. Do not implement unrelated proposed items.
8. **Verify and review.** Run `npm test`, inspect the full diff, and exercise the
   relevant workflow. Run remaining suites separately if the aggregate stops early.
   Update telemetry coverage and assess standards not covered by automated checks.

Feature, contract, and rule design is iterative; the ordering does not prevent
clarification. A changed business requirement must be explicit and recorded before
its tests change. Passing checks demonstrate their covered obligations, not every
possible enterprise requirement.

## Feature-file organization

Each service owns its feature files. Start with one capability file per service
and split by business capability as needed; do not force an entire service into
one large file. Cross-service workflows have their own files.

Repository layout (ARCH-01, A-01):

```text
services/customer/  services/reservation/  services/veterinarian-services/  services/checkout/
frontend/
spec/
  features/<service>/  features/workflows/
  contracts/           domain and per-service OpenAPI
  seed-data/           veterinarians.json, later users.json
  tests/               steps, contract, observability, performance, guard
  harness/             starts services, resets state
  fakes/payment/       fake payment provider
docs/                  decisions, design notes, evidence (docs/specs is protected; map in docs/README.md)
```

Service scenarios cover detailed rules owned by that service. Workflow scenarios
cover important user outcomes and cross-service failures without duplicating every
service case. Every scenario establishes independent state. Keep API payload and
span details in dedicated contract/observability tests unless they are themselves
the behavior under specification.

Service-focused tests may use contract-checked dependency fakes. Cross-service
workflow tests run the actual local services together, with payment remaining fake.
Do not claim separate-process trace propagation from an in-process-only test.

## Persistent context and handoff

Use the following sources rather than duplicating changing facts across documents:

| Artifact | Responsibility |
| --- | --- |
| `AGENTS.md` | Agent guardrails and entry points |
| This document | Development sequence and feature organization |
| `BACKLOG.md` and linked specs | Status, prerequisites, stage, next action |
| `docs/decisions/architecture.md`, `docs/specs/business-decisions.md` | Decisions (A-xx, D-xx) |
| `docs/README.md` | Where each kind of document lives |
| `spec/features/` | Business requirements |
| `spec/contracts/` | Published API expectations |
| `docs/observability.md` | Telemetry rule registry and rule-to-test coverage |
| Executable tests | Evidence that the stated expectations hold or fail |

For each active backlog item, record these fields as work progresses:

```text
Stage: proposed | specifications reviewed | tests red | implementing | verified
Scope and acceptance criteria:
Feature/API/observability references:
Accepted decisions and remaining questions:
Last verification: command, result, and expected versus unexpected failures
Next action:
Checkpoint commit/tag: if one exists
```

Do not label an implementation complete when its checks fail. A specification-only
task may finish with documented intentional failures; that is not a green application
milestone. Update the backlog and coverage table when work changes their status.
Commit/tag checkpoints when requested and report uncommitted work clearly.

## Reusable implementation prompt

> Implement backlog item `<ID>` using its reviewed features, API contracts, and
> observability rules. Follow AGENTS.md and docs/development-workflow.md. Preserve
> the agreed expectations and test assertions. Resolve unspecified behavior before
> implementing it. Run all required suites, review the diff, and update the backlog
> and OBS coverage table with results and any remaining gaps.

For reconstruction, retain the specifications and independent verification while
deleting only the explicitly selected implementation. Use a known checkpoint and
the bounded rehearsal described in DEMO-01; planning is not authorization to delete.
