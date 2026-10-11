# Product and demonstration backlog

Task status lives here. The plan and experiment criteria live in
[PROJECT-PLAN.md](PROJECT-PLAN.md), architecture decisions in
[docs/decisions/architecture.md](docs/decisions/architecture.md), and design notes per
item in [docs/design/](docs/README.md#current-design-notes). Where everything else goes: [docs/README.md](docs/README.md). Follow [the development workflow](docs/development-workflow.md)
for every item. Finished items keep their full history in
[docs/history/backlog-completed.md](docs/history/backlog-completed.md).

## Purpose and agreed direction

Demonstrate that business behavior (BDD), service/API contracts, and observability
contracts can guide an agent to implement, reconstruct, and extend software.
Passing checks establish the specified behavior, not complete enterprise
correctness or identical source code.

- Preserve Git tag `1.0` (commit `897c9e4`) as the original baseline.
- Keep storage in memory. Restart recovery and durable transactions are out of scope.
- Four services (Customer, Reservation, VeterinarianServices, Checkout) in one
  repository, running as separate local processes communicating over HTTP.
- Deterministic fake payment provider; no real charges or payment credentials.
- Specify contracts, observability rules, and BDD features before implementation;
  the human reviews and freezes; then build against the frozen checks.
- No implementation is authorized merely by adding an item here.

## Key dates

| Date | Event |
| --- | --- |
| 2026-10-14 | Excella leadership visit, DC: honest status + Excella software factory proposal (assumed 30 min + 15 discussion) |
| 2026-11-07 | Black Tech NOLA workshop, 45 min (12:15–1:00): separate reservation starter, no PetClinic demo |
| 2026-11-13 | NOAI talk, 50 min + 10 Q&A: rebuild shown as a recording |

Talk formats follow A-24 in [docs/decisions/architecture.md](docs/decisions/architecture.md). The source of truth is Dustin's
`three-talk-outlines.md` and draft decks, kept outside this repo.

## Handled outside this repo

- **DEMO-02** (talk scripts and decks): Dustin's talk outline and draft decks, kept
  outside the repository (A-24). Evidence they draw on lives in `docs/rehearsals/` and
  `docs/engineering-reviews/`.
- **PLAY-01** (Excella playbook package): superseded 2026-10-11. The Excella visit
  presents the current state honestly and proposes an Excella software factory: Excella
  owns the core, and each agency or project owns its own rules. Dustin continues the
  factory work either way ([START-02](#start-02--software-factory-template-repo-dev-container-and-organization-layer)).

## Now — before the talks (2026-11-13)

### EXP-01 — Measure service reconstruction

Status: in progress through DEMO-01 records. Follow the experiment protocol and
run-record template in [PROJECT-PLAN.md](PROJECT-PLAN.md#reconstruction-experiment-protocol): at least three fresh Checkout
reconstructions with frozen expectations, no access to deleted source/history,
recorded failures, timings, interventions, and specification changes. Apply ENG-02
to each; keep code-review findings separate from behavioral results. Two-service
reconstruction and a prose-versus-executable comparison are stretch experiments.

### DEMO-03 — Language swap demonstration

Status: **shown as a recording at NOAI (A-24)**, not run live. The r4 recording
(2026-10-07) is the candidate. No Checkout rebuild appears at Black Tech NOLA. The flow
below describes what the recording shows. Decisions A-05, A-12. The original on-stage flow:

- Run the FE-002 journey visibly (`npm run demo:journey`) on the all-JavaScript build
  (login → book → vet accepts/records visit → bill → pay; no sign-up screen).
- Timed delete of `services/checkout/`; the agent rebuilds it in Python from the
  unchanged specs and tests while the presenter talks.
- Rerun the visible journey (`finish-rehearsal.sh --journey-only`); show the agent's
  `npm test` summary, the elapsed time, and the connected trace.
- Fallback: the recorded r3 rehearsal. Stretch (recorded): whole backend in Python.

## After the talks (2026-11-13) — governed delivery

**Sequence after the talks** (decided 2026-10-04, refined 2026-10-10). This phase is a
personal learning exercise: depth over breadth, no audience or deadline.

1. Governed delivery to the cloud (the items below), the first deep-dive.
2. Cloud and infrastructure security, and production observability, on the deployed system.
3. Data persistence ([DATA-01](#data-01--personal-historical-data-and-archival-learning-demo)).
   Open: whether reconstruction must survive a service that owns durable state.
4. The factory: [START-01](#start-01--the-first-15-minutes) and
   [START-02](#start-02--software-factory-template-repo-dev-container-and-organization-layer),
   only after persistence, so every layer of an application is understood first.

Stack and scope decisions are A-16..A-23 in
[docs/decisions/architecture.md](docs/decisions/architecture.md). Answers recorded
2026-10-10: specs now, build after the talks; deploy the whole system, but only into
ephemeral environments; persistence questions stay open until DATA-01.

The first initiative:
CI/CD with local, cloud non-prod and cloud prod environments, governed the same way
as application behavior. Delivery code is an agent-built by-product of a frozen,
executable spec, and evidence is a by-product of delivery. Items are in order, and each
follows the delivery sequence: spec, red checks, build, ENG review, freeze. No AWS spend before SPEC-08 is frozen.

### CI-02 — Delivery pipeline as a by-product

Status: planned. Done when every `@awaiting:CI-02` tag is removed at a freeze. Thin
workflows (A-21): Dustin owns the small `.github/workflows/delivery-*.yml` files, which
grant privileges; an agent builds the `scripts/ci/` and `infra/` scripts they call,
until the `pipeline/` and `agent-governance/` scenarios pass:
- scans gate with `SECURITY_GATE=fail`
- SBOM via Syft
- SLSA and AI provenance attestations
- OIDC only
- pinned actions

The CI-01 scope moves here, expressed as scenarios rather than prose. Also: the
branch ruleset (GUARD-01 remote) and the pre-push `test:verify` hook, both planned
catalog entries that need live-tier scenarios.

### ENV-02 — AWS organization and non-prod

Status: planned. Done when every `@awaiting:ENV-02` tag is removed at a freeze. An agent builds `infra/` (CDK synthesized to CloudFormation) until
the `template` tier passes. That covers the organization with SCPs, the budget, the
non-prod stack, no NAT gateway and TTL tags. Then the first `live` scenarios run in CI
against an ephemeral non-prod environment. Dustin creates the AWS Organization
and the management account by hand; that bootstrap can't be a by-product.

### ENV-03 — Prod promotion

Status: planned. Done when every `@awaiting:ENV-03` tag is removed at a freeze. Revised
2026-10-10 (A-22): merging to `main` promotes the PR's tested images to prod
automatically, with no second click. Before deploying it verifies both attestations and
that non-prod evidence exists for the same tree. Prod runs with test endpoints off,
inside a short promotion window, with a rollback runbook. The `promotion/` and
`operations/` features are drafted with this item. Also fix OBS-008 (an exporter
crash can take a service down) before prod.

### OBS-P1 — Production observability

Status: planned. Cloud tracing (ADOT to X-Ray) with the OBS rules asserted against the
deployed environment, structured JSON logs, SLO alarms, and the deployed load smoke
test. All are planned catalog entries today.

### EVID-01 — Evidence bundle

Status: planned. Generate the control coverage matrix and a per-run evidence bundle
from the Cucumber JSON output (CTL, NIST and SSDF tags), the run record, the image
digest, the SBOM, both attestations and the approver. Fail when a binding control has
no evidence. Per prod promotion (A-23), publish a release record: a readable summary
plus JSON for reporting. It goes to a GitHub Release with an attestation now, and to
S3 Object Lock in the log-archive account once ENV-02 exists.

### EXP-02 — Rebuild the delivery code from the spec

Status: planned. The DEMO-01 experiment applied to delivery. Delete the Dockerfiles,
`compose.yaml`, `infra/` and the delivery workflows, then have a fresh agent rebuild
them from `spec/delivery` until every tier passes. Optionally switch from CDK-JS to
CDK-Python. Record it with the rehearsal template: time, interventions, and spec gaps
(GAP-xx → D-xx).

### PLAY-02 — Delivery playbook from the evidence

Status: planned. A short adoption guide for `spec/delivery` in another repository
(it's a portable package), plus lessons for the talks: the AWS
Organizations and SCP learning, ephemeral environments under a fixed budget, and the
moved root of trust.

## Proposed (not approved)

Candidates from the 2026-10-10 delivery-governance review. Per `AGENTS.md`, a proposal
isn't a requirement until Dustin moves it into an item above. "Fits under" names the
existing item each could join.

| Candidate | What | Why | Fits under |
|---|---|---|---|
| **LIVE-01** Continuous live tier | Scheduled CI job, plus one on every PR, running `test:live` with a read-only token able to read rulesets and environments | The ruleset gap went undetected until someone ran the live tier by hand | CI-02 |
| **BEH-01** Behavioral tests for delivery scripts | Run `scripts/ci/verify-promotion` and `release-record` against fixtures in the template tier, replacing text-search checks inside CTL-023/060 | A text search proves a word appears, not that the check works | SPEC-09 follow-up |
| **AGENT-01** Isolate the agent runtime | Run agents in a container or cloud sandbox holding only the App's credentials | Makes "agents never approve or merge" an enforced boundary, not a convention | CI-02 |
| **SUPPLY-01** The agent as part of the supply chain | Pin model versions; change-control agent configuration (`AGENTS.md`, hooks, skills, MCP servers); record it in AI provenance (DC-007) | The agent is now part of the toolchain | SPEC-09 / EVID-01 |
| **RUNTIME-01** Runtime compliance | AWS Config with a NIST 800-53 conformance pack, plus drift detection | Templates don't prove the running state | ENV-02 / OBS-P1 |
| **DORA-01** Delivery metrics from release records | Lead time, deployment frequency, change failure rate; rollback by redeploying the previous digest | The metrics fall out of evidence already produced | EVID-01 / ENV-03 |
| **OSCAL-01** Machine-readable compliance | Export the control catalog and per-release evidence as OSCAL | Toward continuous authorization to operate | EVID-01 |
| **DEPS-01** Dependency-update policy | Bot-authored dependency PRs wait for a human under "agents never merge"; accept that or define a narrow, tested exception | An explicit decision instead of a surprise | CI-02 |
| **MQ-01** Merge queue | Replace "require branches to be up to date" once several agents open PRs in parallel | Keeps tested tree = merged tree (A-22) | Later |
| **DOCS-01** Executable docs pass | Make the mechanical half of the docs pass a check: links and repository paths resolve, files exist only in the homes `docs/README.md` allows, and finished items are out of the active backlog | Today the pass is a checklist; the repo's own pattern is to make a rule executable once it matters | CI-02 |
| **REVIEW-01** Make freezes reviewable | Small protected patches (one control per patch) and a freeze review checklist | The human freeze is the bottleneck and the main risk | Process |

Known weaknesses these address (same review): some static checks are text-search
proxies; the live tier isn't in CI; the agent boundary is a convention; the sole
maintainer self-merges; freezes of ~380-line patches are hard to review; template
checks don't prove what's running.

## Open follow-ups on completed work

- **GUARD-01 remote:** configure and verify the GitHub branch ruleset (PR required,
  guard check required, code-owner review) and confirm the CODEOWNERS username.
- **SPEC-03 coverage:** ENG-02's observability rule audit (2026-10-05, see
  `docs/engineering-reviews/eng-02-observability-audit.md`) reviewed privacy,
  exporter failure/lifecycle, eligibility tracing, and the broader
  fault/concurrency OBS rules against the actual code (not just "untested").
  Most are followed by construction; one concrete gap remains, not yet fixed:
  - **OBS-008 production exporter-crash risk:** a dependency/collector
    failure during span export can surface as an uncaught exception that
    crashes the whole service; the only existing mitigation is scoped to
    `PETCLINIC_TEST_ENDPOINTS=enabled` (test harness only — see
    `services/platform/runtime.js:117-133`). Needs a real fix before this is
    called production-ready telemetry.
- **From ENG-02 calibration (2026-10-05), spec additions (protected, Dustin's call):**
  - AUTH-005 case: forge a `role: "service"` token with a bad signature
    against each internal operation (would have caught CAL-03 at L0).
  - Runtime/auth case: a non-UUID path ID returns 404 with no downstream
    call, so a rebuild can't reintroduce THREAT-04 (PRE-02).
- **From ENG-02 calibration, low-priority code items:** REV-017 (the `roles`
  claim accepts `"service"`) and REV-018 (`dependency()` passes downstream 4xx
  codes through to callers).
- **Post-November candidate:** open the business span before schema
  validation, so every rejected attempt gets one (full OBS-003). Deferred
  2026-10-05 in favour of dropping the unreachable `validation_error` from
  OBS-046/047.
- **From r4 (2026-10-07), spec gaps (protected, Dustin's call):**
  - GAP-16: if the charge reaches Customer but the booking-fee credit fails, no
    bill is saved and every retry fails on `already_applied`, so recovery is
    manual. Untested. Linked to GAP-14: r2 treated `already_applied` as success
    and r4 treated it as failure; both pass.
  - GAP-17: Checkout attribution for administrator-only accounts (promotion
    `appliedByVeterinarianId`, cash `recordedByVeterinarianId`). Already noted as
    open in `visit-payment.feature`; the demo never reaches it.
- **ENG-02 carry-over:** `tools/review/project-specific/ownership.test.mjs` is a
  resource-ownership access-control test, not an import-boundary check. Rename or
  reclassify it once the import-boundary engine exists.
- **Test-run hygiene:** the full auth suite (~10 min) wasn't being run, which
  hid a two-week-old AUTH-006 failure. Run the whole `npm test` before
  declaring any item done.

## Done

Full history: [docs/history/backlog-completed.md](docs/history/backlog-completed.md).

| Item | Result | Checkpoint |
| --- | --- | --- |
| [SPEC-01](docs/history/backlog-completed.md#spec-01--agree-service-boundaries-and-business-decisions) | Service boundaries; decisions D-01–D-38 ([record](docs/specs/business-decisions.md)) | `spec-schema-complete` |
| [SPEC-02](docs/history/backlog-completed.md#spec-02--publish-the-three-specification-layers) | Domain model, schemas, service features | `spec-schema-complete` |
| [SPEC-03](docs/history/backlog-completed.md#spec-03--trace-observability-rules-to-executable-tests) | OBS registry and coverage table (gaps above) | `test-01` |
| [ARCH-01](docs/history/backlog-completed.md#arch-01--repository-layout-with-separate-projects) | Repository layout, separate projects | `arch` |
| [ARCH-02](docs/history/backlog-completed.md#arch-02--language-neutral-runtime-contract) | Language-neutral runtime contract | `arch-02` |
| [ARCH-03](docs/history/backlog-completed.md#arch-03--black-box-test-harness) | Black-box harness, payment fake | `arch-03` |
| [ARCH-04](docs/history/backlog-completed.md#arch-04--cross-process-telemetry-capture) | OTLP test collector, trace helpers | `arch-04` |
| [OTEL-01](docs/history/backlog-completed.md#otel-01--opentelemetry-specification-conformance) | Semantic conventions OBS-041/042 | `otel-01` |
| [AUTH-01](docs/history/backlog-completed.md#auth-01--simple-local-authentication-and-data-access) | Local JWT auth and access rules | `auth-01` |
| [GUARD-01](docs/history/backlog-completed.md#guard-01--protect-specs-and-tests-from-agent-modification) | Local spec/test protection (remote follow-up above) | `guard-01` |
| [SPEC-04](docs/history/backlog-completed.md#spec-04--per-service-api-contracts) | Per-service API contracts | `spec-04` |
| [TEST-01](docs/history/backlog-completed.md#test-01--service-level-executable-tests-all-red) | Service-level executable tests, mutation-rehearsed | `test-01` |
| [SPEC-05](docs/history/backlog-completed.md#spec-05--revise-the-november-mvp-domain-and-contracts) | November MVP revisions (registration, partial payments) | `spec-05-test-02-frozen` |
| [TEST-02](docs/history/backlog-completed.md#test-02--cross-service-workflow-specifications-and-api-tests) | Nine cross-service backend journeys | `spec-05-test-02-frozen` |
| [IMPL-02](docs/history/backlog-completed.md#impl-02--build-the-four-service-checkout-workflow) | Four JavaScript services ([handoff](docs/handoffs/impl-02.md)) | `impl-02` |
| [ENG-01](docs/history/backlog-completed.md#eng-01--review-implementation-quality-across-the-language-swap) | JavaScript self-review ([record](docs/engineering-reviews/impl-02-javascript.md)); superseded by ENG-02 | `impl-02` |
| [FE-01](docs/history/backlog-completed.md#fe-01--frontend-project) | Frontend, five browser checks ([handoff](docs/handoffs/fe-01.md)) | `fe-01` |
| [PERF-01](docs/history/backlog-completed.md#perf-01--minimum-performance-test) | Local performance test ([handoff](docs/handoffs/perf-01.md)) | `perf-01` |
| [SEC-01](docs/history/backlog-completed.md#sec-01--security-spike-calibrate-automated-gates-against-ai-generated-code) | Security spike; rules later hardened ([record](docs/engineering-reviews/sec-01-spike.md)) | `52252a6` |
| [MVP-02A](docs/history/backlog-completed.md#mvp-02a--administrator-role-and-veterinarian-roster) | Administrator role, roster, reassignment, admin UI | `162e29d` |
| [ENG-02](docs/history/backlog-completed.md#eng-02--independent-calibrated-engineering-review) | Independent calibrated review; reviewer 13/13 ([record](docs/engineering-reviews/eng-02-calibration-2026-10-05.md)) | `e6e169f` |
| [DEMO-01](docs/history/backlog-completed.md#demo-01--rehearse-deletion-and-reconstruction) | Two clean rehearsals (r1, r2) accepted by A-14; r4 adds a third and is the NOAI recording | `demo-01-baseline` |
| [SPEC-06](docs/history/backlog-completed.md#spec-06--close-checkout-specification-gaps-found-in-rehearsal) | Checkout gaps GAP-08..15 decided and frozen; r4 passed against the new specs | `exp-01-spec06-baseline` |
| [SPEC-07](docs/history/backlog-completed.md#spec-07--suppressing-tests-and-retiring-features-through-the-spec) | `@retired` and `@accepted-risk` tags with owner and review date; accepted-risks suite | `03b374b` |
| [SPEC-08](docs/history/backlog-completed.md#spec-08--delivery-as-an-executable-specification) | Delivery controls as tagged scenarios in `spec/delivery/`; `@awaiting` tags; agent identity (CTL-025) | PR #1–#2 |
| [ENV-01](docs/history/backlog-completed.md#env-01--local-environment-as-a-by-product) | Containers and Compose locally; browser suite in the pinned Playwright container | PR #3–#4 |
| [SPEC-09](docs/history/backlog-completed.md#spec-09--continuous-delivery-controls-a-21a-23) | Continuous delivery controls (A-21..A-23); wrapper refuses merge and approve | PR #6 |
| [IMPL-01](docs/history/backlog-completed.md#impl-01--legacy-visit-cancellation-retired) | Retired by D-24 | `1.0` |

## Deferred

### MVP-02 — Clinic growth and administration

Status: deferred except the MVP-02A slice; possible 2027 workshop. Office capacity,
reassigning other veterinarians' appointments, departure policies for future
appointments and historical records, and payments allocated across multiple visits.

### DEMO-04 — Reconstruct the frontend from retained design assets

Status: planned after DEMO-03. In an isolated workspace, keep the protected design
instructions, CSS, fonts/license, logo, browser tests, and visual baselines plus the
backend; delete only `frontend/` application code via a reviewed manifest; exclude
prior frontend source/history and the static design preview; rebuild in vanilla
JavaScript. Require the frozen appearance tolerance, identical text/interactions,
and ENG-02. Record time, interventions, failures, and retained scaffolding.

### CI-01 — Wire SEC-01's security gates into CI/CD on push to main

Status: **superseded 2026-10-10 by [SPEC-08](docs/history/backlog-completed.md#spec-08--delivery-as-an-executable-specification)
and [CI-02](#ci-02--delivery-pipeline-as-a-by-product).** Each scope bullet below is
now a scenario: scans gate delivery (CTL-013), the root of trust runs guard and the
delivery suite (CTL-022). The branch ruleset and the pre-push hook are planned catalog
entries. Kept for history.

Correction (2026-10-10): `.github/workflows/guard.yml` exists. It runs a required
guard job and an informational full-suite job. Neither runs SEC-01's scanners, which
still only run locally via `tools/security/run-sec01-spike.sh` and
`tools/security/portable/run-*.sh`. The original text follows.
Nothing currently stops an insecure change from reaching `main` through a
normal push or merge. Related open gap: the "GUARD-01 remote" follow-up
(branch ruleset: PR required, guard check required, code-owner review) is
also still unconfigured — this item should close both at once rather than
wiring security scanning into CI without branch protection to enforce it.

Why this order: per the A-13 CI/CD placement framework, these checks belong
in the agent's local loop *and* as a required remote gate, not one or the
other — local catches issues before commit, CI catches anything that
slipped through or came from a push outside the usual agent loop. Placed
after the November MVP (DEMO-01/02/03, MVP-02A, PLAY-01) so it doesn't
compete with talk-prep time, and explicitly before any database/persistence
work ([DATA-01](#data-01--personal-historical-data-and-archival-learning-demo))
so that work lands on a repo that already enforces its security floor,
rather than retrofitting the gate after data-handling code exists.

Scope (sketch, to be specced properly when picked up):

- `.github/workflows/security.yml` (or equivalent) running
  `portable/run-sast.sh`, `portable/run-secret-scan.sh`,
  `portable/run-dependency-audit.sh` on every push/PR to `main`; add Bandit
  for Python once its `.venv`/vendor exclusion (flagged in the SEC-01
  write-up) is fixed, so CI doesn't choke on noise.
- Configure the branch ruleset: PR required, the guard check (`guard:check`)
  required, code-owner review required (closes "GUARD-01 remote").
- Pre-push git hook running `npm run test:verify` (PERF-03): blocks a push
  unless every full-tier suite passed on the exact tree being pushed. Pre-push,
  not pre-commit, so red checkpoint commits stay allowed. Decide how the hook
  is installed (`core.hooksPath` vs a setup script) and whether `--no-verify`
  is acceptable when CI is the backstop.
- Promote the "Full test suite (informational)" job in `guard.yml` to a
  required check running `npm test` (full tier, no cache); upload
  `test-results/runs/` as the run-record artifact.
- Decide fail-vs-warn per check to start (SEC-01's 62.5% catch rate argues
  for treating these as a floor, not a perfect gate, at least initially).
- `.github/` is CODEOWNERS-protected — any workflow file change here needs
  human review and a `guard:freeze` run before merge, same as other
  protected paths.

### DATA-01 — Personal historical-data and archival learning demo

Status: deferred until explicitly requested. Pet removal, historical-data
preservation, governance, archival, retrieval, and reporting as a separate learning
exercise with deeper architecture. Nothing for it belongs in the November demo.

### START-01 — The first 15 minutes

Status: deferred until after CI/CD-to-cloud ([CI-02](#ci-02--delivery-pipeline-as-a-by-product))
and data persistence, which closes the
[sequence after the talks](#after-the-talks-2026-11-13--governed-delivery).
Idea captured 2026-10-07; not scoped.

Make the start of a project easy with this workflow. The audience is a remote,
multi-role group in a large, regulated organization, not a solo developer.

The problem it targets is the enterprise requirements deadlock. Every role waits on
the role upstream: "I can't make a domain model / API contract / use case /
workflow until I understand what we're building." This project broke the deadlock
by making decisions directly, but only for a low-risk POC. START-01 asks how a
group gets there.

Working ideas from discussion (not decisions):

- Reversibility makes commitment safe. A wrong decision costs a scenario edit and
  a rebuild (about 27 minutes in this project), not a rewrite. Ask for
  provisional decisions with an owner and a revisit trigger, in the shape of the
  existing D-xx decision log, instead of asking for "requirements."
- Remote calls let the loudest voice win. Collect input in parallel and
  attributed (everyone writes examples), let the AI merge them and flag
  conflicts, then spend the call on the conflicts.
- Concrete examples bridge the technical/functional divide. The AI translates
  both ways: a functional example becomes a scenario and contract; a technical
  constraint becomes a readable scenario. Both sides review the same artifact.
- Regulatory constraints (access control, audit logging, data handling) become
  executable scenarios from the first session, not a late review gate.
- Assume restricted tooling: plain text in git plus already-approved tools. Keep
  enforcement in the pipeline (`guard:check`, CI), so the method doesn't depend
  on which agent a client has approved (Claude and Codex today).

Open questions:

- What roles are typically in the room, and who is hardest to get to commit?
- Is the deliverable a facilitation guide, agent prompts/skills, a starter repo
  template, or a mix?
- How do participants contribute in parallel when tool approval differs by client?
- Has the workflow been proven with Codex? A rehearsal build with Codex would test
  the agent-neutral claim.

### START-02 — Software factory: template repo, dev container and organization layer

Status: **committed direction, sequenced after persistence** (DATA-01; decided
2026-10-10, confirmed 2026-10-11). Implements START-01. Dustin develops this whether or
not Excella sponsors it; the Excella proposal is that Excella owns the core and each
agency or project owns its own rules.

Productize the method so a new project starts with the tools, checks and governance
from day one. Three layers: (1) a dev container with pinned tools; (2) a template repo
with the guard, test policy, portable `spec/delivery` controls and catalog, `AGENTS.md`,
hooks and a hello-world service; (3) organization setup (rulesets, agent App, AWS
accounts with SCPs, OIDC roles, central reusable workflows). A new repo starts with
controls `@awaiting`, and failing live checks act as the onboarding checklist.

Outline for when it's picked up:
- **Prerequisite: one project config.** Move what's hardcoded into one file: the repo
  slug in predicate-type URIs and `root-of-trust.json`, the App ID and slug in
  `tools/github/agent.mjs`, the region and budget in the catalog, container names in DC-004.
- **Split portable from project-specific (A-15).** Petclinic-only controls and data
  leave the template.
- **Ship controls as a versioned package**, not a copy: `spec/delivery` as a pinned
  package or git ref, reusable workflows as SHA-pinned references to a central repo.
  Projects adopt new control versions through a freeze.
- **The dev container as the agent sandbox**, holding only the App's credentials
  (closes AGENT-01). Compose and the browser container need Docker-in-Docker or the
  host's Docker socket; Codespaces is an option.
- **The first 15 minutes, made executable:** clone the template and the red checks list
  what's missing; `npm --prefix spec/delivery run test:awaiting` shows progress.
- **Graduation test (ENG-02):** the hello-world repo is the second project that proves
  the portable kit.
- **Naming:** "software factory" is reportedly the US DoD term (Kessel Run, Platform One)
  for a secured, compliant pipeline under continuous authorization to operate; verify
  before quoting. Relatives: golden path or paved road (template layer), internal
  developer platform (organization layer), platform engineering (the discipline).

### Network hardening

Status: deferred (decided 2026-10-10) until a real data or exposure need appears. This
is a test application with no real data, and its non-prod environment deliberately
exposes test endpoints. The deferred work covers private subnets for tasks, AWS WAF on
the load balancer, restricted ingress, VPC endpoints instead of public egress, and a
boundary for non-prod test endpoints. Most of it also needs a NAT gateway or interface
endpoints, which the $25/month ceiling rules out (SPEC-08 cost analysis). Tracked as the
`network-hardening` catalog entry with status `deferred`.

### ARCH-05 — Evaluate Docker Compose isolation

Status: **decided 2026-10-10 (A-17): containers everywhere, Compose locally.** The work
moves to [ENV-01](docs/history/backlog-completed.md#env-01--local-environment-as-a-by-product). Original note: evaluate Compose for the services,
collector, and payment fake: startup/shutdown, health checks, isolated networks,
port ownership, reproducibility, and safer human control over AI-driven process
management. No Docker files before an explicit review.

### Optional feature candidates

- Reschedule appointments: preserve ID, reject date conflicts, record success/conflict.
- Filter upcoming visits: define date range boundaries, ordering, and query outcomes.
- Complete visits: define allowed transitions and trace previous/new states.
- Recover payment-success/confirmation-failure cases using an agreed retry or refund policy.

## Definition of done for implementation

Reviewed requirements are implemented without weakening their checks; all BDD,
contract, and observability suites pass; the browser workflow works; trace evidence
is captured; ENG-02 passes; known in-memory limitations are documented. A fresh
session has run the docs pass ([docs/README.md](docs/README.md#the-docs-pass-after-every-feature-commit)).
Documentation of a proposed feature or an intentionally failing baseline does not
mean that feature is complete.
