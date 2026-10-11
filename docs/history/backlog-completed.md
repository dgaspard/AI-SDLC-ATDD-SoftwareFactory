# Completed backlog items (full history)

Moved verbatim from `BACKLOG.md` on 2026-09-29 so the backlog shows only current
work. Status lines reflect each item's final recorded state; links are rebased.

### SPEC-01 — Agree service boundaries and business decisions

Status: core business decisions recorded and carried into the frozen service
specifications. Decisions D-01–D-38 are in
[SPEC-01](../specs/business-decisions.md); later contract clarifications GAP-01–07
are recorded in the [TEST-01 review](test-slices-5-6.md).

| Service | Owns | Calls |
| --- | --- | --- |
| Customer | Customer/pet profiles, account entries, booking eligibility | None |
| Reservation | Calendar, reservation lifecycle, clinical Visit storage | Customer; Checkout for booking payment |
| VeterinarianServices | Service catalog and USD fees | None |
| Checkout | Bills, promotions, booking and visit payments, cash | Customer, Reservation, VeterinarianServices, fake payment provider |

Settled rules include owner = customer, independent in-memory stores, requested
and accepted reservations without expiry, a non-refundable $20 fee at acceptance,
post-visit completion as CompletedSettled or CompletedOutstanding, and sequential
and concurrent payment replay. Failed booking payment leaves the request open;
failed post-visit payment leaves an outstanding balance. Published contracts
specify unknown entities, conflicts, and failures after successful authorization.
Automatic payment recovery, timeout handling, refunds, and durable idempotency
remain outside the demo scope. Do not reopen historical follow-up lists as new
requirements; consult the current domain model and API contracts first.

### SPEC-02 — Publish the three specification layers

Status: service features, domain schemas, and API contracts complete; cross-service
workflow features and browser tests remain under TEST-02.

The [domain model](../specs/domain-model.md),
[schema decisions](../specs/schema-decisions.md), and
[contract index](../../spec/contracts/README.md) define the reviewed service surfaces.
Schema questions Q-01–Q-05 are approved. Customer and Pet expose profiles/account
data; Reservation owns and serves clinical records (D-38). Integer USD cents,
price snapshots, payment limits (revised for partial payments by SPEC-05), promotion limits, and state transitions
are expressed in the published contracts and service features.

SPEC-04 delivered the per-service and fake-payment contracts. TEST-01 supplied
executable service steps, schema assertions, access checks, and business trace
checks; all 166 service scenarios resolve their steps. The current OBS registry
runs through OBS-042, with retired IDs and uncovered rules explicitly identified.
Completion of these service artifacts does not imply that workflow features,
the frontend, or the application exist.

### SPEC-03 — Trace observability rules to executable tests

Status: stable-ID registry and coverage mapping established; scoped business-trace
checks validated in TEST-01. Broader rule coverage remains incomplete.

Follow the [traceability specification](../specs/observability-traceability.md)
and maintain the rule → test → implementation table in
[observability.md](../observability.md). Existing checks cover service identity,
HTTP/resource conventions, W3C propagation, business outcomes OBS-023–035, and
cross-process evidence OBS-036–040. The latest rehearsal passed 92 business
telemetry/workflow checks; temporary implementations were then removed.

Privacy, exporter failure/lifecycle, eligibility tracing, and broader fault and
concurrency coverage remain explicit gaps. Conditional logs and metrics remain
deferred. Supporting assertions under other IDs are not complete coverage of a
broader rule. OBS-011 is retired; the legacy cancellation example stays at tag
`1.0` and the current cancellation contract is OBS-026.

### ARCH-01 — Repository layout with separate projects

Status: done. Decision A-01. Phase: spec (human-directed).

Result: `spec/` holds features, contracts, seed data, cucumber config, and test tooling
(its own Node project); `services/<name>/` and `frontend/` contain README files only.
Root `npm test` runs the spec project. `npm --prefix spec ci` verified locally
(168 packages, 0 vulnerabilities).

- Create `services/<name>/` for each of the four services, `frontend/`, and `spec/`.
- Move `features/` and `contracts/` under `spec/` and update Cucumber and doc paths.
- Each service project has its own dependency file and `start` script and can be
  deleted without affecting any other project.
- Acceptance: deleting one service folder leaves every other project buildable.

### ARCH-02 — Language-neutral runtime contract

Status: done. Decision A-02. Phase: spec.

Result: [`spec/contracts/runtime-contract.md`](../../spec/contracts/runtime-contract.md) defines
`setup`/`start` scripts, static ports, environment variables (OpenTelemetry standard names
where they exist), frozen `CLINIC_NOW` clock, `GET /health`, `POST /test/reset` behind
`PETCLINIC_TEST_ENDPOINTS=enabled`, and seed files read from `SEED_DATA_DIR`. Added
`spec/seed-data/services.json` (fixed catalog IDs) and `spec/harness/free-port.sh`.
Reference runtimes: Node 22+ (24.21.0 in use), Python 3.12.

Browser access: CORS from `FRONTEND_ORIGIN` (default `http://localhost:3000`); no frontend proxy.

### ARCH-03 — Black-box test harness

Status: done. Decision A-03. Phase: spec.

Result: `spec/harness/` (config, process control, stub server, schema validator,
free-port), `spec/fakes/payment/` with its contract `spec/contracts/payment-provider.openapi.json`,
runtime-contract tests (RT-001..RT-007), domain-example schema tests, Cucumber
lifecycle (`spec/tests/support/world.js`), and `spec/run-all.js` reporting every suite.

Baseline (`npm test`):
- Runtime contract: fake payment provider passes; all four services and the frontend
  fail with "<Project> not implemented: <folder>/start not found".
- Service features: 150 of 150 scenarios fail with the same not-implemented message.
- Schema contracts: 9 of 9 pass after fixing two defects the harness found in
  `domain.openapi.json` (Read schemas rejected their own fields; declined payments could
  carry an authorization reference).

### ARCH-04 — Cross-process telemetry capture

Status: done. Decisions A-03, A-10. Phase: spec.

- OTLP/HTTP test collector in `spec/harness/collector/` (port 4318): protobuf only, rejects
  other formats with 415 and records them; `GET /test/spans`, `POST /test/reset`.
- Vendored OTLP .proto files (opentelemetry-proto, latest release v1.10.0) decoded with protobufjs.
- `spec/harness/traces.js` (wait for spans, find span, parent/child across services, trace tree)
  and `spec/harness/show-trace.js` for the demo.
- Runtime contract: OTLP protobuf env vars, traces only, `OTEL_BSP_SCHEDULE_DELAY=100`, and
  RT-008 [OBS-001]: each service exports protobuf traces under its `service.name`.
- Collector self-check tests in `spec/tests/harness/`.
- Dependency: protobufjs ^8.8.0 (dev, spec project).

Baseline (`npm test`): harness self-checks pass (collector accepts protobuf, rejects JSON
with 415); schema contracts pass; runtime contract: fake payment and collector pass, the
four services (including RT-008) and the frontend fail as not implemented; 150/150
service scenarios fail as not implemented.

### OTEL-01 — OpenTelemetry specification conformance

Status: done. Decision A-08. Phase: spec.

Result: semantic conventions reference v1.44.0 (stable HTTP subset enforced);
auto-instrumentation allowed, not required. New rules OBS-041 (HTTP span names and
attributes, deprecated names forbidden, business spans parented by the SERVER span) and
OBS-042 (`service.name`, `service.version`, `telemetry.sdk.language`). Checks in
`spec/harness/semconv.js`; tests in `spec/tests/observability/otel-conventions.test.js`
(12 failing: services not implemented) and helper self-checks in `spec/tests/harness/`.
Client-span, 5xx `error.type`, business-span parenting, and W3C propagation (OBS-002)
tests move to TEST-01, after SPEC-04 defines endpoints.

### AUTH-01 — Simple local authentication and data access

Status: done (specification and failing tests). Decision A-09. Phase: spec.

Result: [`spec/contracts/auth-contract.md`](../../spec/contracts/auth-contract.md) and
`auth.openapi.json`: JWT HS256 with the shared demo secret, 8-hour user tokens on the clinic
clock, identical 401 for unknown user or wrong password, `service` role tokens (5 minutes)
for internal operations, 401/403/404 rules, open endpoints. Seed data: `customers.json`
(Jordan Rivera with Milo and Luna, Sam Lee with Rex) and `users.json` (two veterinarians,
two customers, password `petclinic-demo`). Veterinarians create new customers; only seeded
users log in.

Tests: seed-data schema and reference checks (pass); `spec/tests/auth/login.test.js`
AUTH-001..AUTH-004 (fail: Customer not implemented); `login.feature` and access scenarios
in `customer-profile.feature`. Token rejection and per-endpoint access rules are tested in
TEST-01 once SPEC-04 defines the endpoints and marks internal ones.

### GUARD-01 — Protect specs and tests from agent modification

Status: local protection done; remote branch ruleset and code-owner configuration
remain to be verified/configured. Decision A-07. Phase: spec.

Protected paths (`spec/guard/protected-paths.json`): `spec/`, `docs/specs/`, `.claude/`,
`.github/`, `AGENTS.md`. Humans edit them; agents read them.

- Build agent: `.claude/settings.json` deny rules plus `.claude/hooks/protect-paths.mjs`
  (edit tools and shell commands; blocks `guard:freeze`). The reason is shown to the user.
- Fingerprints: `spec/protected.sha256`, checked by `npm --prefix spec run guard:check`
  (first suite in `npm test`), refrozen only by a human with `guard:freeze`.
- Skip scan: rejects `.skip`/`.only`/`.todo` and `@skip`/`@wip`/`@ignore`/`@only` tags.
- GitHub: `.github/CODEOWNERS` and `.github/workflows/guard.yml` (guard job required; full
  suite informational). The GitHub remote now exists. Verify/configure its branch
  ruleset requiring PR, the guard check, and code-owner review; confirm the
  CODEOWNERS username. This documentation update does not claim remote enforcement.
- Self-checks: `spec/tests/harness/guard.test.js` and `protect-hook.test.js`.

### SPEC-04 — Per-service API contracts

Status: done. Phase: spec. Index: [`spec/contracts/README.md`](../../spec/contracts/README.md).

Decisions: plain REST paths, no version prefix or pagination; RFC 9457 problem details
with a stable `code`; 400 malformed, 401/403/404 per auth contract, 409 state conflicts,
422 business-rule rejections, 502 dependency failures; balance denial is 201 with the
saved Denied reservation; `/internal/` operations are service-only; the acting user comes
from the token, never the body; one OpenAPI file per service reusing domain schemas by
`$ref`; `Idempotency-Key` required on booking-fee, accept, card, and cash payment operations.

Result: `customer` (12 operations, includes login), `reservation` (12), `veterinarian-services`
(3, read-only), `checkout` (8) contracts plus `common.openapi.json`. Customer serves
`CustomerRead`/`PetRead`, which no longer embed reservations, visits, or history (D-38). Every feature
file maps to at least one operation (`x-features`). Structural tests in
`spec/tests/contract/api-contracts.test.js` pass (131 schema checks in total).

### TEST-01 — Service-level executable tests (all red)

Status: done (2026-09-27). Phase: spec. Stage: tests red.
Checkpoint tag: `test-01`.

Completion means the service-level executable specifications and their
green/mutation rehearsals are complete. It does not mean the application passes:
temporary implementations have been removed and missing-service failures are
intentional. Workflow features/browser tests and broader observability coverage
gaps remain outside this task.

Decisions: test clock `POST /test/clock` (RT-009) instead of restarts, so in-memory data
survives a clock change; "Given" state only through published APIs with stubs for
dependencies (no seed backdoors); one step file per service plus shared steps (clock,
login, "refused as <reason>" → problem `code`); access control generated from every
contract operation's `x-roles` (401 missing/bad-signature/`alg: none`/expired, 403 wrong
role, 404 another customer's record); OBS-023..040 in dedicated observability tests,
OBS-002 via `traceparent` recorded by stubs; stubs assert internal calls carry a
`service`-role token and never the user's token (negative check), and internal
operations reject user tokens with 403. Workflow features and Playwright are TEST-02.

Done so far:
- Part 1: test clock (runtime contract, harness, RT-009). Tag `test-01-clock`.
- Slice 1: shared helpers (`clinic-time.js`, `money.js`, `seed.js`), Cucumber world `api()`
  that validates every response against the service contract, `tokenFor()`/`actAs()`
  (real login against Customer; identical locally signed tokens elsewhere), shared steps,
  and VeterinarianServices steps. Validated against a throwaway spike service (9/9 green),
  then with two deliberate faults (wrong fee: 3 scenarios fail; extra field: 2 fail with
  "Contract violation"). Spike deleted; baseline: 9/9 fail as not implemented.
- Slice 2: Customer steps for profile, pets, account, eligibility, login, and access
  scenarios (45 scenarios). Internal operations are called with service-role tokens.
  Validated against a throwaway spike (45/45 green; AUTH-001..004 10/10 green), then with
  three deliberate faults: clamping an over-credit (1 fails), customers reading others'
  profiles (1 fails), login leaking the password (fails widely via the `User` schema).
  Spike deleted; baseline: 45/45 fail as not implemented.
- Slice 3: Reservation steps (73 scenarios incl. outlines) with Customer and Checkout stubs:
  default stub answers per scenario, assertions on what Reservation sent (amounts, method,
  Idempotency-Key, service-role token signed with the shared secret and never the user's
  token). States are reached only through the API; `BeforeStep` records Given/When/Then so
  `the reservation is "<state>"` sets up in a Given and asserts in a Then. Validated against
  a throwaway spike (73/73 green), then five faults: no slot lock during acceptance (race),
  forwarding the vet's token to Checkout, denial amount without the thousands comma, weekend
  slots, past slots offered; each caught by the scenario owning that rule. Spike deleted;
  baseline: 73/73 fail as not implemented.
- Slice 4: Checkout steps (34 scenarios) with Customer, Reservation, and VeterinarianServices
  stubs plus the real fake payment provider, whose call log proves whether a card was charged.
  Assertions cover amounts, billed-line snapshots, account changes, completion requests, and
  service-role tokens (`sub: checkout`). The spike found one step bug (a regex group count),
  fixed before review. Validated against a throwaway spike (34/34 green), then five faults:
  no idempotency (5 fail), concurrent duplicates racing (1), booking fee collected twice (7),
  promotion driving the balance negative (1), reporting settled when completion fails (1).
  Spike deleted; baseline: 161/161 service scenarios fail as not implemented.
- Slices 5–6 completed: contract-generated access assertions for all 34 protected
  operations; business trace assertions for OBS-023–040 and stub-header propagation
  for OBS-002. Real-service trace tests cover cross-process evidence, replay,
  booking acceptance/decline, and promotion to zero. Application services remain absent.
  See [review, outcome coverage, and contract gaps](test-slices-5-6.md).
  Harness fixture/mutation checks pass; full runtime validation remains red.
  Stage: tests red; supplied protected manifest passes guard:check and includes
  these slices and the prior Checkout slice. Checkpoint tag: `test-01-s5-s6`.
  Contract gaps resolved in GAP-01–07 of the linked review: documented 403s,
  missing telemetry outcomes, invalid visit/bill inputs, cash replay and rejection
  precedence, authorized-completion failure status, and veterinarian identity.
  Added BDD cases and trace assertions; the freeze is included in `test-01`.
  Historical verification before that freeze: npm test passes 45 harness and 131 schema checks; application
  assertions remain red because service implementations are absent. BDD dry run
  resolved all 166 scenarios; the guard then reported the unfrozen revisions.
  Those revisions are now frozen and the guard passes.
  Latest verification (2026-09-27): supplied working-tree manifest passes the
  guard and was preserved unchanged. The [green/mutation rehearsal](test-slices-5-6-rehearsal.md)
  passed all 310 slice-5/6 checks (218 access, 92 telemetry/workflow), detected
  13 deliberate implementation defects, and passed all 10 distinct mutation
  targets after restoration. Temporary implementations were removed; final
  `npm test` again passes guard, 45 harness and 131 schema checks, with application
  suites intentionally red because services are absent. No protected files changed.
  Next: define TEST-02 workflow features and browser tests.
  The TEST-01 specification handoff and first green/mutation rehearsal are complete;
  broader privacy/exporter/fault coverage gaps remain outside these slices.

### SPEC-05 — Revise the November MVP domain and contracts

Status: reviewed and frozen (2026-09-27). Phase: spec. Stage: tests red.

User-directed changes after `test-01-docs`: keep exactly two seeded veterinarians,
their independent offices, assigned-veterinarian acceptance/denial/cancellation,
customers canceling only their own appointments before the start, multiple services
per visit, and the non-refundable $20 booking fee paid before acceptance.

Add customer self-registration with a preferred veterinarian and at least one pet;
allow correction of completed clinical records and veterinarian updates to service
types. Revise the domain, API/auth contracts, features, access fixtures, schema
checks, and affected telemetry expectations before building application code.
Add service-level failing tests and cross-service journeys under TEST-02. This is
the same specification-first process used for the original requirements; a prior
freeze remains a historical checkpoint, not a prohibition on reviewed evolution.

Approved correction scope: assigned-veterinarian changes to clinical notes,
diagnoses, medications, and follow-up notes only; preserve services and finalized
bills. Draft service features and PATCH contracts now cover this scope and
catalog name/fee updates. Cross-service assertions must additionally prove that
clinical corrections and catalog updates leave finalized bills and debt unchanged.

Accepted scope clarification (2026-09-27): require all customer information at
registration, including insurance, saved mock payment details, and secondary
contact, plus a veterinarian and at least one pet. Keep one registration flow;
do not introduce additional setup flows for collecting those details later.
Allow multiple smaller payments against one visit, mixing card payments and
veterinarian-recorded cash. Failed payments leave debt unchanged; any outstanding
customer balance continues to block new appointment requests. Each payment targets
one visit. Pet removal and archival are excluded from this demo.

Workflow scope confirmed: retain the existing backend journeys and TEST-02 tests;
avoid additional UI/setup flows for visits, bill payment, or appointment times.
The draft includes coordinated registration/payment schemas, features, fixtures,
and telemetry revisions. Self-registration requires complete information; the
existing veterinarian-assisted profile endpoint retains its frozen input shape.
The full-balance-only payment rule is superseded by the approved partial payments.

Only the human runs `guard:freeze` after reviewing the revised protected files.
Keep the original `test-01` and `test-01-docs` tags intact.

Historical specification handoff (2026-09-27): registration, partial payment, catalog update, and completed
clinical correction contracts/features/steps are frozen, with nine backend
journeys and OBS-043–045. Pet removal is excluded. No business questions remain.
The human reviewed the specification changes and ran `guard:freeze`. `npm test`
passes the guard, harness, and schema suites; runtime, authentication,
observability, service BDD (219 scenarios), and workflow BDD (nine scenarios) are
red because the application services are absent. Cucumber resolves all 219
service scenarios/1685 steps and nine workflow scenarios/58 steps, with no
undefined or ambiguous steps. The new checks have not had a working-implementation
or mutation rehearsal; do not claim implementation verification.
Checkpoint: tag `spec-05-test-02-frozen`. Next: proceed to IMPL-02, coordinating
the application build with FE-01 and PERF-01. Broader
telemetry failure/privacy branches remain explicit gaps in the coverage table.
Current implementation evidence superseding this red baseline is recorded under
IMPL-02 and ENG-01; the frozen expectations are unchanged.

### TEST-02 — Cross-service workflow specifications and API tests

Status: reviewed and frozen (2026-09-27); nine backend journeys pass against the
JavaScript implementation. Phase: spec. Stage: verified for the backend journey
scope. Depends on TEST-01 and SPEC-05. IMPL-02's aggregate gate remains separate.

Scope: specify a small set of user journeys spanning the four services, then
write protected workflow steps using Playwright's HTTP request API without
launching a browser. The fast backend suite does not depend on a frontend design.
Add a small headless browser suite with FE-01 once user interactions are specified.
The existing HTTP telemetry workflows prove selected integration assertions;
they do not replace workflow feature files or browser acceptance tests.

Draft journey selection for review:

- Request and accept an appointment, collect the booking fee, record the visit,
  finalize the bill, and settle the remaining balance.
- Mix partial card payment, decline, and veterinarian-recorded cash; block another
  pet's booking until customer debt is cleared.
- Replay a partial payment after settlement without duplicate authorization or credit.
- Apply a promotion after partial payment without overcrediting or another authorization.
- Preserve finalized bills and debt through clinical corrections and catalog changes.
- Reject one of two competing payments before overcollection.
- Retain the booking fee on customer cancellation and reuse released capacity.
- Accept simultaneous bookings for different pets with the two veterinarians.
- Register a customer with complete information and request their first appointment.

Acceptance criteria: reviewed features live under `spec/features/workflows/`;
steps exercise actual local services with only the payment provider faked;
state, money, payment invocation counts, and the existing trace suites agree.
Keep detailed edge cases in the service suites. Register the HTTP journey suite in the aggregate
runner, record a meaningful red baseline, and have the human review/freeze the
protected changes. Tests must stay unchanged for the JavaScript-to-Python demo.
Browser interaction tests remain with FE-01 once its existing UI is designed;
do not add extra UI/setup flows for this task.

References: D-28/D-35, service features, `spec/contracts/`, OBS-036–040,
A-04/A-05, and `docs/development-workflow.md`.
Next action: carry the frozen expectations into IMPL-02. Run with
`npm --prefix spec run test:workflows`; the aggregate `npm test` includes it.
Processes are reused between scenarios, with deterministic resets and one worker;
there are no browser launches, screenshots, or retries hiding failures. This does not authorize
application implementation or introduce new business behavior.

### IMPL-01 — Legacy visit cancellation (retired)

Status: retired by D-24. The legacy app was removed; its cancellation exercise is
preserved at tag `1.0`. Reservation cancellation is specified in
`spec/features/reservation/cancel-reservation.feature` and is built under IMPL-02.

### IMPL-02 — Build the four-service checkout workflow

Status: verified (2026-09-27); full aggregate and JavaScript ENG-01 pass.
Phase: build. Stage: verified.
Service specifications and TEST-01 are complete; coordinate the JavaScript build
with FE-01 and the agreed PERF-01 checks.

Handoff: the four JavaScript services and shared HTTP/authentication/OTLP runtime
are checkpointed at tag `impl-02`. Local networking permission is available. All 52
runtime checks and 219 service scenarios pass when service groups run separately;
five additional engineering checks pass. The initial aggregate passed guard,
harness, schemas, authentication, and nine backend journeys. Its implementation
failures were corrected. The protected Cucumber lifecycle retained a stub
in the runner when switching services; freeing that port terminated Cucumber.
The correction (patch retrievable from commit `25ca13e`) is now authorized and
human-frozen, and all 219 scenarios pass in one run. Final `npm test` exits zero:
guard, 45 harness checks, 157 schemas, 52 runtime checks, 242 authentication checks,
113 observability checks, 219 service scenarios, and nine backend journeys pass.
RT-009 remains human-frozen and the guard passes. See the
[engineering review](../engineering-reviews/impl-02-javascript.md) and
[handoff](../handoffs/impl-02.md) for final rerun evidence and next actions.
Post-fix reruns also pass all 242 authentication checks, 113 observability checks,
and nine Playwright HTTP journeys. Formatting/lint pass and the implementation
dependency audit reports zero vulnerabilities. Checkpoint: tag `impl-02`.

[ENG-01](#eng-01--review-implementation-quality-across-the-language-swap) is complete
for this JavaScript backend workspace, with its review record retained alongside
the test results at tag `impl-02`. Next: FE-01 and
PERF-01 before reconstruction/demo readiness.

Implement successful checkout, declined payment, and idempotent retries against
the agreed expectations. Run real local service dependencies in integration tests;
fake only the payment boundary. Keep stores independent and in memory. Document
that restarting a process loses state and idempotency protection.

### FE-01 — Frontend project

Status: verified. Phase: implementation. Stage: verified; user-approved design,
browser checks, and visual references are human-frozen. Decision A-04.
Checkpoint: `fe-01`.

Accepted scope: vanilla JavaScript; login, customer appointment request, assigned
vet acceptance and visit recording, bill finalization, and customer card payment.
Keep wider business-rule coverage in backend suites. One fixed desktop viewport
and headless Chromium; no mobile/browser matrix or extra product workflows.

Preserve appearance and behavior across reconstruction without requiring identical
source. Retain approved CSS, local fonts/license, logo/images, design instructions,
tests, and approved visual references under `spec/`. Delete only frontend application
code in a later authorized experiment after Checkout reconstruction (DEMO-04).

Approved and frozen: [design contract](../../spec/frontend/design.md), [screen contract](../../spec/frontend/screens.md),
[browser coverage plan](../../spec/tests/browser/README.md), and
[visual-reference policy](../../spec/frontend/visual-baselines/README.md).
Approved identity: Cedar & Paw Veterinary; evergreen/ivory, local Inter, original
SVG paw mark, minimal imagery. [Static review preview](../design/fe-01-design-preview.html)
supports `#login`, `#appointments`, and `#bill`; it is not the application.

Five executable Playwright checks now accompany the frontend feature scenarios;
`npm --prefix spec run test:browser` runs them and `npm test` includes them.
Last verification: `npm test` passes all nine suites, including five browser checks
and three visual comparisons in 10.2 seconds. All nine supplemental engineering
checks, lint/formatting, and connected payment-trace verification pass. The status
announcement race was fixed in the implementation without changing frozen tests.
See [FE-01 handoff](../handoffs/fe-01.md) for verification and calibration evidence.
The [frontend ENG-01 review](../engineering-reviews/fe-01-javascript.md) passes.
Next: PERF-01 thresholds/specifications, then reconstruction rehearsals. The browser
timing is measured evidence, not a substitute for the planned performance gate.

### PERF-01 — Minimum performance test

Status: verified (2026-09-28); human-frozen; full aggregate passes. Decision A-06.
Phase: spec. Stage: verified. Checkpoint: tag `perf-01`.

Purpose: one representative performance test so the project covers every major
enterprise test type. It is a base for later expansion and experiments, not a
capacity study; the 200 ms budget is intentionally generous.

- Five paced concurrent workers, two-second warm-up, ten-second measurement window;
  target roughly 20–30 seconds total, including setup and cleanup.
- Each worker books independent future appointments and settles prepared historical
  visits, avoiding clock changes or scheduling conflicts during measurement.
- Request, acceptance, finalization, and payment each require p95 below 200 ms,
  at least 20 samples, zero unexpected errors, and correct financial outcomes.
- Same frozen workload and thresholds for JavaScript and Python on the same host;
  real services and fake payments, telemetry enabled, no browser.
- `npm --prefix spec run test:performance`; included in `npm test`.

Specification and workload details: [PERF-01 contract](../../spec/tests/performance/README.md).
Initial baseline: 100 samples per operation, p95 6.5–16.9 ms; full performance command
17.4 seconds. Deliberate slow HTTP responses and incorrect financial outcomes were
rejected. See [PERF-01 handoff](../handoffs/perf-01.md) for evidence and next steps.
The human reviewed and ran `guard:freeze` and `guard:check`; `npm test` passes all
ten suites, including the guard and local performance. Next: use the unchanged
check in reconstruction (DEMO-03).

### ENG-01 — Review implementation quality across the language swap

Status: JavaScript review complete and passed (2026-09-27), including final
aggregate validation after the authorized harness correction and human freeze.
Python reviews remain planned.
Applies to the all-JavaScript implementation and each Python Checkout
reconstruction. Phase: implementation and demo review. Fourth pillar:
**Engineering Discipline**. See the
[JavaScript review record](../engineering-reviews/impl-02-javascript.md) for
findings, fixes, test results, connected trace, and limitations.

Purpose: passing BDD, API, observability, and browser checks establishes the
behavior they cover. Review the implementation separately to determine whether
its boundaries, payment handling, and structure are sound enough to maintain.
Apply the same review criteria to both languages. An agent must perform this
review after generating code and fixing test failures, before declaring the
implementation or reconstruction checkpoint ready.

Review tasks:

- **Inspect the complete implementation diff.** Identify Checkout behavior,
  dependencies, startup configuration, and telemetry. Confirm the rebuilt service
  has not changed protected specifications, tests, or surviving services to pass.
- **Check service ownership.** Checkout uses published APIs, owns its state, and
  neither reads another service's store nor copies its business logic. Keep the
  payment fake outside Checkout.
- **Trace one payment from request to outcome.** Locate the idempotency check,
  provider call, recorded result, and Reservation/Customer updates. Verify
  sequential and concurrent retries cause no duplicate provider calls or credits.
- **Review money and state transitions.** Use integer cents; require the $20
  booking fee before acceptance. A booking decline leaves the request Requested.
  Partial and full visit payments produce the specified CompletedOutstanding or
  CompletedSettled state without overcollection or cross-visit allocation.
- **Inspect partial failures.** Provider success followed by downstream failure
  must be reported accurately in the response and trace. A retry must not silently
  charge again. Record limitations outside the agreed in-memory demo scope.
- **Review access and telemetry.** Inspect service-token use, ownership checks,
  trace propagation, and sensitive customer/payment information in spans or errors.
- **Review code structure.** Look for hardcoded scenario values, duplicate payment
  paths, unnecessary coupling, and control flow that obscures payment outcomes.
- **Run language-appropriate code checks.** Add and run formatting, lint, and
  useful static checks. Record exact commands, versions, and results for JavaScript
  and Python; equivalent criteria do not require identical tools.
- **Verify and record the result.** Run frozen suites, backend journeys, and the
  same browser journey once available; inspect the diff and a connected trace.
  Record findings, fixes, remaining limitations, and the final commit/workspace.

Acceptance criteria: frozen behavioral suites and configured code checks pass;
the review record separates test results from code-review findings. Resolve
payment-safety and service-boundary concerns before demo readiness. Record each
other finding's disposition and remaining limitations. Judge JavaScript and Python
by the same criteria; green tests alone do not establish production readiness.

Record each review under `docs/engineering-reviews/` with checkpoint/language,
reviewed diff and files, test/check commands and results, payment/trace evidence,
findings with fixes and dispositions, limitations, and a pass/blocked decision.
Add targeted regression checks for concrete uncovered behavior through the normal
specification-first process; proposed checks under protected paths need explicit
specification authorization and human review/freeze before implementation.
Do not modify frozen tests merely to pass this gate.

Next action: retain this JavaScript review as the baseline for reconstruction.
Reuse this gate at every DEMO-01/DEMO-03/EXP-01 checkpoint, with equivalent Python
code checks and payment/service-boundary review.

### ENG-02 — Independent, calibrated engineering review

**Final status (2026-10-05): complete.** All five components built and applied to the JavaScript build. Calibration round 1: blind reviewer 13/13, automated gates 5/13 after Semgrep hardening, frozen tests 4/13 ([record](../engineering-reviews/eng-02-calibration-2026-10-05.md)). Every real finding is triaged there: fixed, disclosed as THREAT-03/04/05, or carried to the backlog. Remaining: connected-trace capture and an ENG-02 review on the next Python rehearsal (r3).

Status: planned (2026-09-29). Build in parallel with DEMO-01; run before MVP-02A.
Phase: review tooling (unprotected `tools/review/`), then apply. Supersedes
[ENG-01](#eng-01--review-implementation-quality-across-the-language-swap)'s
self-review as the demo-readiness and playbook gate, reusing its checklist.

Why: ENG-01 was written by the same agent that built the code, largely as a
narrative checklist, and was never tested. The Python rebuild (r1) has no review.
Passing tests say nothing about behavior the tests don't cover.

**Target architecture (2026-10-03 design decision, physically implemented for
security checks per A-15 — `tools/review/` should adopt the same
`portable/`/`project-specific/` folder split once it's built):** build the
reference implementation in this repo now (there is no Excella platform team
yet to own a shared version), but author it as a liftable, versioned unit from
day one, split by portability — the same split that cut the auth-suite
redundancy, applied to *review* instead of tests:

- **Portable (candidate for a future org-level, centrally curated GitHub Actions
  check, run from every repo's CI, not forked and maintained per repo):**
  duplicate-code detection, security scanning (Semgrep/Bandit/secret scan),
  dependency audit, the import-boundary check's *engine*, the independent-reviewer
  *process* (fresh session, checklist-driven, cite file/line, human sign-off), and
  the calibration *methodology* (plant defects, measure catch rate). A generic
  defect like "non-constant-time secret comparison" is reusable across any
  project's auth check; it doesn't belong reinvented, or worse not invented, per repo.
- **Project-specific (stays in this repo, frozen like everything else):** the
  import-boundary *rules* (which folders map to which service), the observability
  rule audit (petclinic's own OBS registry), service-boundary/payment-safety
  checklist content, the threat-model note, and which defects get planted for
  calibration (though the defect *types* can seed a shared library).

**Long term:** `/harness` (and `tools/review/`) in each repo narrows to (a) the
project's own frozen contract/business checks, (b) a declared "already covered
here" manifest so the central service doesn't re-check what a repo already proves,
and (c) a feed of new recurring findings upward. A platform/security team curates
the central library and promotes a repo-level finding into it once it recurs
across multiple projects and has its own calibration case — the same reification
discipline this project already uses for specs (a gap an agent surfaces doesn't
matter until it's written into a frozen, re-checkable artifact). A shared,
mandatory check also needs its own versioning/rollout discipline (semantic
versions, staged rollout, a pin-and-upgrade path) and clear ownership, since a bad
update now breaks every consuming repo's CI at once — a GUARD-01 for the org.
This long-term piece is a design note for the playbook, not built here.

1. **Automated gates (tool-judged, same for every language):**
   - Duplicate-code detection across services (e.g. jscpd, which reads JS and Python).
   - Import-boundary check: no service imports another service's code or a store;
     shared infrastructure (`services/platform/`) is allowed and listed. **Built
     2026-10-04** — `tools/review/portable/check-import-boundaries.mjs` +
     `tools/review/project-specific/import-boundaries.json`, wired into
     `npm run test:engineering`; zero violations on the current baseline, and
     verified to catch a planted cross-service import. Note
     `tools/review/project-specific/ownership.test.mjs` (moved 2026-10-04 from
     `tools/ownership.test.mjs`) is a resource-ownership access-control test
     despite its name, not this check. See `tools/review/README.md`.
   - Security scanning: Semgrep (both languages) plus Bandit for Python; secret scan.
   - Dependency audit: `npm audit` and `pip-audit`.
   - Connected-trace capture (`npm run trace:payment`) against every build,
     including Python. **Run 2026-10-05**: PASS on `main` and the `r2` JS
     rebuild; `r1`/`r3` Python rebuilds need a local run (sandbox can't run
     their `.venv`) — see `docs/engineering-reviews/eng-02-connected-trace.md`.
2. **Observability rule audit:** list every OBS rule without a test and have the
   reviewer check each against the code, recording followed / not followed / N/A.
   **Done 2026-10-05** — see `docs/engineering-reviews/eng-02-observability-audit.md`
   and the updated status column in `docs/observability.md`'s traceability table.
   Two concrete follow-ups found: OBS-008 (exporter failure can crash a service
   in production — the mitigation is test-harness-only) needs its own BACKLOG
   item, and OBS-046/047/048 still have no dedicated observability test.
3. **Independent reviewer agent:** a fresh session that never saw the build,
   driven by a written checklist prompt (`tools/review/review-prompt.md`) covering
   service boundaries, payment safety, inter-service auth (including hand-written
   token signing/verification), privacy in telemetry and errors, and structure.
   Every finding cites file and line. A human signs off security and boundary findings.
   **Built and run 2026-10-05** — see `tools/review/review-prompt.md` and the
   first real review,
   `docs/engineering-reviews/eng-02-review-impl-02-2026-10-05.md`. Five
   findings (REV-001–005), **all fixed and verified same day** (see that
   doc's "Disposition" section; D-57 records REV-003's fix). Note:
   `isolation: "worktree"` (the confirmed fresh-agent mechanism) isn't
   available in this Cowork environment — see the amendment in
   `docs/design/eng-02-review.md`.
4. **Threat-model note:** record known architectural risks, starting with the single
   shared HS256 secret (any compromised service can forge user tokens); disclose
   as a demo limitation.
5. **Calibration:** a set of planted defects applied to a scratch copy (copied
   business logic across services, payment reference leaked into a span, token
   check that skips signature or uses non-constant-time compare, cross-service
   store access, missing OBS attribute on an untested rule). The review passes
   calibration when it catches every planted defect; record the catch rate.
   **Round 1 run 2026-10-05.** 13 defects planted (the six above, plus the
   REV-003 write-only-flag shape, SEC-01's three misses, a removed
   double-charge guard, a timing-unsafe compare, and a logged bearer token)
   in a throwaway copy of `main`. Blind fresh reviewer: **13/13**. Frozen
   tests: 4/13, plus one side effect. Automated gates: 3/13 (jscpd, Semgrep
   regexp, engineering test). Both custom SEC-01 Semgrep rules missed their
   own defect class because they matched only on variable names. Hardened
   with structural rules (`52252a6`), they now catch both, raising the
   automated gates to 5/13. See
   `docs/engineering-reviews/eng-02-calibration-2026-10-05.md`. It also
   lists 11 real findings on `main` awaiting triage, including **guard red
   on `main`** (protected files edited by the REV fixes, never re-frozen)
   and **2 failing OBS-043 tests**.

Apply to: the JavaScript baseline (`impl-02`), r1 Python, r2 JavaScript, r3 Python.
Record under `docs/engineering-reviews/` with gate output, findings, sign-off, and
calibration score. Feeds PLAY-01.

### SEC-01 — Security spike: calibrate automated gates against AI-generated code

**Final status (2026-10-05):** the 5/8 headline was later shown to be inflated. Two of its catches came from name-matching custom rules that missed ENG-02's realistic plants; both rules were hardened (`52252a6`). See the ENG-02 calibration record.

Status: **complete (2026-10-04).** Run locally (network access the dev
sandbox doesn't have) via `tools/security/run-sec01-spike.sh` plus standalone
reruns of the calibration snippets with realistic variable names. Full
write-up: [`docs/engineering-reviews/sec-01-spike.md`](../engineering-reviews/sec-01-spike.md).

Headline result: **5 of 8 planted defects caught (62.5%)** by Semgrep
(default registry + two custom rules) + Bandit (Python) + dependency audit
(`npm audit`/`pip-audit`). Real remaining gaps: the JS injection shape (#3),
overly broad CORS (#4) — both need new custom Semgrep rules — and the route
skipping the auth hook (#5), which needs a route-vs-contract cross-check, not
a scanner. One methodology finding not yet fixed: Bandit's default recursive
scan includes `.venv`/vendored deps and needs an exclude pattern before its
real-world output is usable without manual filtering. Feeds ENG-02 item 1
(automated gates, now has a measured floor) and item 4 (threat-model note,
via the misses). Recommendation section is written to be lifted directly
into PLAY-01's playbook.

<details>
<summary>Original scope (time-boxed spike, prepared 2026-10-03)</summary>

Time-boxed spike (target: 2 days), run in parallel with DEMO-01/ENG-02, before MVP-02A
build. Not a shipped feature — a research exploration whose output is a
written recommendation, feeding ENG-02's security gate and PLAY-01's playbook.

Tooling is ready in `tools/security/`, split per A-15 into `portable/`
(generic checks: `run-sast.sh`, `run-dependency-audit.sh`,
`run-secret-scan.sh`, two custom Semgrep rules — CODEOWNERS-protected) and
`project-specific/` (this app's real CORS policy, auth-coverage notes), plus
`run-sec01-spike.sh` (orchestrates the portable scripts against both real
builds and a calibration copy), `calibration-defects.md` (now cross-
referencing each defect's classification), and a fill-in template at
`docs/engineering-reviews/sec-01-spike.md`. It has not been executed yet:
Semgrep/Bandit/pip-audit/detect-secrets/`npm audit` all need real network
access to install and query vulnerability databases, which the environment
this was prepared in doesn't have (same restriction as the earlier GitHub
push issue). Run it via Claude Code locally or a normal terminal — see
`tools/security/README.md` for the exact command.

Why now: published benchmarks put LLM-generated code's vulnerability rate at
roughly 9.8–42.1%, and AI-introduced issues surviving in public repos passed
100,000 by February 2026 (see chat log 2026-10-03 for sources). Spec-first reduces
*wrong* behavior; it does not by itself reduce *insecure* behavior — the contracts
and BDD scenarios in this project assert business outcomes, not security
properties, so a correct-and-insecure implementation can pass every frozen test.
ENG-02 currently lists "Semgrep + Bandit + secret scan + dependency audit" as one
line item; this spike finds out whether that's actually sufficient, before it's
load-bearing.

Questions this spike answers:
- Run Semgrep/Bandit/secret-scan/`npm audit`/`pip-audit` against the existing
  JavaScript Checkout (`impl-02`) and the Python rebuild (r1). What do they
  actually flag? Any true positives already present (e.g. the known single shared
  HS256 secret)?
- Calibrate: plant 5–8 realistic AI-introduced vulnerabilities in a scratch copy
  (non-constant-time secret comparison, a secret logged at error level, an
  injection-shaped string concatenation, a dependency with a known CVE, overly
  broad CORS, a path that skips the auth hook). What fraction do the chosen tools
  actually catch? This is the same calibration discipline already used for TEST-01
  and planned for ENG-02, applied specifically to the security tier.
- Where tools miss, decide: add a tool, add a targeted scenario-level check
  (business-observable security properties, e.g. "a declined payment's card
  reference never appears in telemetry," already partly covered), or accept and
  disclose the residual gap.
- Recommendation: a short written practice — which scanners, at what gate, with
  what measured catch rate — specific enough to go in the Excella playbook as
  "the minimum automated security floor for AI-generated service code," distinct
  from ENG-02's broader review (which also covers boundaries, payment safety, and
  structure, not just security-tool output). Classify each finding/tool as
  portable (candidate for ENG-02's future central service) or project-specific,
  per ENG-02's target architecture.

Record under `docs/engineering-reviews/sec-01-spike.md`: tools run, versions,
findings against both real builds, the calibration table (planted defect → caught
y/n → by which tool), and the resulting recommendation. Feeds directly into
ENG-02 item 1 (automated gates) and item 4 (threat-model note).

</details>

### MVP-02A — Administrator role and veterinarian roster

**Final status (2026-10-05): built and frozen.** Built in `04d383f`, frontend frozen in `162e29d`; ENG-02 review and calibration ran against it. GAP-08a was resolved by D-41 (administrator bypass). GAP-08 (`not_assigned_veterinarian` missing from the OBS-030/033 outcome lists) remains open and moved to SPEC-06. A pre-existing AUTH-006 test bug from this item (the dual-role actor masked the admin-only check) was fixed in `e199212`.

Status: planned (re-prioritized 2026-09-29). Starts after DEMO-01. Phase: spec,
then build. Target: verified by 2026-10-13 for PLAY-01. Purpose: prove the method on
*adding* functionality to a tested system, the common enterprise case.

Scope:

- Administrator role distinct from veterinarian (auth contract, users seed, tokens).
- Admin can add and deactivate veterinarians (new API, domain contract changes).
- Admin can view all appointments; veterinarian privileges narrow to their own work.
- Frontend admin screen with accessible labels and a browser check.
- Fold in [SPEC-06](backlog-completed.md#spec-06--close-checkout-specification-gaps-found-in-rehearsal)
  (GAP-09–15) in the same spec review and freeze cycle.

Veterinarian and administrator test scenarios to add (found in rehearsals):

| Gap | Question to decide | Likely artifacts |
| --- | --- | --- |
| GAP-08 | A veterinarian who did not perform the visit applies a promotion or records cash and gets 403 `not_assigned_veterinarian`, but that outcome is missing from the OBS-030 / OBS-033 closed outcome lists. Found independently by r1 (Python) and r2 (JavaScript); no test covers it. | OBS-030/OBS-033 outcome lists; observability test; Checkout scenarios |
| GAP-08a | After the role split, may an administrator apply a promotion or record cash on any visit, or only the assigned veterinarian? What outcome is recorded when an admin is refused? | auth contract; Checkout scenarios; OBS outcomes |

Sequence: business decisions (human answers) → contracts, features, OBS rules →
protected tests red → human freeze → JavaScript build → `npm test` green → ENG-02.
Record spec effort, agent time, interventions, and gaps found for PLAY-01.
After it lands, rerun one fresh Python Checkout rehearsal before 2026-11-07.

Out of scope (remain in MVP-02): office capacity, reassigning other veterinarians'
appointments, departure policies for future appointments and history, multi-visit
payments.

## Moved 2026-10-11

Moved verbatim from `BACKLOG.md` on 2026-10-11. Status lines are as last recorded;
the items are merged or frozen.

### DEMO-01 — Rehearse deletion and reconstruction

Status: **evidence accepted (2026-10-03, A-14)**. Checkpoint tag
`demo-01-baseline`. Tools, prompts, and the visible journey are in
[tools/demo](../../tools/demo/README.md). Agent: Claude Code in a fresh session;
disposable workspace with no prior Checkout history; prepared prompt (reading
the shared JavaScript runtime is allowed and disclosed).

| Run | Direction | Rebuild time | Result | Interventions | Record |
| --- | --- | ---: | --- | ---: | --- |
| r1 (2026-09-28) | JavaScript → Python | 25m 49s (agent) | 10/10 suites + visible journey; verification 9m28s | 0 | [r1](../rehearsals/r1.md) |
| r2 (2026-09-29) | Python → JavaScript | ≤32m23s | 10/10 suites + visible journey; verification 8m13s | 0 | [r2](../rehearsals/r2.md) |
| r3 | JavaScript → Python (optional recorded fallback) | — | not started | — | — |
| r4 (2026-10-07) | JavaScript → Python, against SPEC-06 specs (`exp-01-spec06-baseline`) | 24m03s (agent 14m46s) | 10/10 suites, 977 tests; verification 27m37s total; recorded (DEMO-03 fallback) | 0 | [r4](../rehearsals/r4.md) |

Live gate (A-12), revised by A-14 (2026-10-03): r1 and r2 — zero interventions,
both language directions — are sufficient evidence the reconstruction claim
holds. r3's screen recording is no longer a blocking milestone; it's an
optional fallback recording (expected under an hour), done whenever before the
talks. Watch for r1's unreproduced startup hang if/when r3 runs. On stage use
`finish-rehearsal.sh --journey-only`.

### SPEC-06 — Close Checkout specification gaps found in rehearsal

Status: **Done criteria met 2026-10-07: fresh Python rebuild [r4](../rehearsals/r4.md) passed every suite against the new specs. ENG-02 on r4 still pending. New gaps GAP-16 and GAP-17 are under open follow-ups.** Earlier: JavaScript fixes verified: D-58–D-65 accepted; specifications frozen; all ten `npm test` suites pass. D-66 was already decided and frozen separately. Phase: build verification. See [SPEC-06 handoff](../handoffs/spec-06.md) for gap-to-test coverage, verification and remaining implementation work. Next: independent engineering review and a fresh Python reconstruction against the updated specs. Sources: [rehearsal r1](../rehearsals/r1.md),
[rehearsal r2](../rehearsals/r2.md). MVP-02A shipped first, so SPEC-06 now
runs its own review-and-freeze cycle. r3 (DEMO-01) should run against the
specs it produces.

The rebuilds passed every test but reported behavior the contracts leave silent or
inconsistent. For each gap: decide the intended behavior, then add or amend the
contract, OBS rule, and scenario so a test pins it down.

| Gap | Question to decide | Likely artifacts |
| --- | --- | --- |
| GAP-08 | (Carried over from MVP-02A.) Promotion and cash return 403 `not_assigned_veterinarian`, but OBS-030/033's closed outcome lists don't include it, so the trace tests can't assert it. Add it? | OBS-030/033 outcome lists; trace tests |
| GAP-09 | What does promotion/cash return when Reservation cannot record completion (502 `dependency_failed`)? | `checkout.openapi.json` responses; scenario |
| GAP-10 | Is there an internal-error problem code, or is 500 `dependency_failed` intended? | common problem codes; runtime/contract note |
| GAP-11 | Confirm the agents' guesses: $0 bill completes as settled; booking fee excluded from `paymentAttempts` but counted in `previouslyPaidAmount` (r1 Python and r2 JavaScript chose this independently); same-key retry after payment returns current state plus original attempt | business decision entry; scenarios |
| GAP-12 | Idempotency key scopes (r2): booking fee keyed per reservation; card and cash keyed per checkout. Is reusing one key across booking and visit payment, or across card and cash, two separate requests or a conflict? | D-12 clarification; scenarios for cross-scope key reuse |
| GAP-13 | Card approved but follow-up fails: the same-key retry returns the same 502 `authorized_completion_failed` without re-charging or retrying the follow-up. Covered only by unprotected engineering checks today; should a frozen scenario pin it? | scenario; possibly OBS rule |
| GAP-14 | Completion and account-change repeats (r2): Checkout skips re-sending an identical completion and treats Reservation `already_completed` / Customer `already_applied` as success. Intended? | contract note; scenarios with downstream "already done" replies |
| GAP-15 | A $0 promotion is stored but sends no discount to Customer (r2). Intended, and should it appear in the bill and trace? | scenario; OBS-030 attribute note |

Done when: decisions recorded, protected changes human-reviewed and frozen, the
JavaScript Checkout updated so `npm test` passes, and one fresh Python rehearsal
passes against the new specs (earlier rehearsal evidence predates them).

### SPEC-07 — Suppressing tests and retiring features through the spec

Status: **next, before CI-01** (decided 2026-10-07: this could make or break the
process). Design discussion first; no protected change until Dustin approves the
approach. Captured 2026-10-07 after r4/ENG-02.

The problem: today there is no sanctioned way to say "this check is knowingly
suppressed" or "this feature is gone." Both happen informally, and an agent can't
tell an intentional retirement from a gap to fill.

- **Suppression.** The REV-003 skip in
  `tools/review/project-specific/engineering-review.test.mjs` is a code comment plus
  a conditional `skip:`. The guard (`spec/guard/guard.js`, `SKIP_CODE` and
  `SKIP_TAG`) blocks skips only under `spec/`, and only in literal forms such as
  `.skip(` or `{ skip: true }`. A conditional `skip: cond && "reason"` would get
  past it even under `spec/`. The guard works on syntax, not on intent.
- **Retirement.** IMPL-01 (legacy visit cancellation, retired by D-24) was
  removed by deleting it. Nothing stops a rebuild from bringing back a
  decommissioned feature, or building from an old spec, if it finds traces in
  docs, history or an earlier tag.

Goal: suppressing a check and retiring a feature both go through the protected
spec layer and human freeze, and the harness catches anything built that
shouldn't be.

Options to weigh (not decisions):

- **Feature-file tags with a required reason.** For example `@accepted-risk(REV-003)`
  or `@retired(D-24)`, where the guard requires a reference to a decision or review
  record and rejects bare `@skip`. A suppression list frozen with the specs, which
  the runner reads, instead of skips inside test code.
- **Retired behavior as a negative scenario.** "Given D-24, when a client calls the
  old cancellation endpoint, then it gets 404 and no trace is emitted." This turns a
  decommissioned feature into an executable "must not exist" check, so a rebuild
  that brings it back fails.
- **Contract-level allowlist.** The harness fails if a service exposes any route or
  span not in the current OpenAPI or OBS registry, catching old-spec or invented
  endpoints in general, not just known retirements.
- **Spec version pinning.** Each run record names the spec freeze it was built
  against, so a build from a stale spec is detectable (the runner already records
  the policy sha256).
- **Expiry.** An accepted risk carries an owner and a review date, so suppression
  isn't permanent by default. This fits the regulated-audience framing.

Decided (Dustin, 2026-10-07):

- **Detection: negative scenarios.** Each retired feature gets an executable
  "must not exist" scenario. A contract allowlist and spec pinning are not
  chosen for now.
- **Suppression: feature-file tags** (for example `@accepted-risk(REV-003)`), with
  the guard requiring a reference to a decision or review record.
- **Scope: `spec/` only.** Engineering checks in `tools/review/` stay advisory and
  can be skipped with a comment (as REV-003 was).
- **`@accepted-risk` scenarios still run and are expected to fail.** A failure is
  reported as "accepted." A pass is flagged so someone removes the tag. The risk
  stays visible on every run.
- **Only BDD scenarios can be suppressed.** Contract, OBS, auth, schema and runtime
  tests (`node:test`) are hard gates with no suppression mechanism. If one is
  wrong, the contract changes through freeze.
- **Retirement scenarios live in the owning service's feature folder** (for
  example `reservation/retired.feature`, tagged `@retired(D-24)`).
- **Retirement covers only features that once shipped,** meaning they existed in a
  tagged build or frozen spec and a decision later decommissioned them. Proposals
  that never shipped are not included.
- **Accepted risk expires.** The tag carries an owner and a review date, for
  example `@accepted-risk(REV-003, owner=dustin, review=2027-01-31)`. The guard
  fails after the review date, so an accepted risk is never permanent by default.

**Frozen and verified 2026-10-07 (`03b374b`): full gate complete, 11/11 suites on
tree `650e97bee43a`. REV-001 reports STATE CHANGE failing → passing on JavaScript, as
expected. Still to confirm: ACCEPTED on a Python Checkout build.** Earlier: drafted in
protected files and reviewed by Dustin.
Includes stub transport faults and the REV-001 accepted risk. Seven calibration
plants were all caught. See [docs/design/spec-07-suppression-and-retirement.md](../design/spec-07-suppression-and-retirement.md),
"Implementation (as drafted)". Original next step: draft the design. This means the tag grammar, the guard changes (reject
bare `@skip`, close the conditional-`skip:` hole, validate references and dates),
expected-failure handling in the Cucumber runner, and one worked example of each
(a retired IMPL-01 cancellation under D-24, and one accepted risk). Then Dustin
reviews it before anything protected changes.

### SPEC-08 — Delivery as an executable specification

Status: **frozen 2026-10-10; follow-up patch awaiting review and freeze.**
- Design: [docs/design/spec-08-delivery.md](../design/spec-08-delivery.md).
- Spec: [spec/delivery/](../../spec/delivery/README.md).
- Human guide (generated): [docs/delivery/environments.md](../delivery/environments.md).

29 control scenarios plus 4 catalog checks, calibrated with 27 plants (all caught).
Since the freeze:
- **Done:** cfn-guard 3.2.1 policies calibrated (12/12); A-20 boundary; `guard.yml`
  actions pinned, with the `Delivery spec` job; `delivery` suite in the gate; `main`
  rulesets and the `prod` environment configured (CTL-024 passes live).
- **Problem found:** red controls in a required check blocked every merge and
  `test:verify`.
- **Decided 2026-10-10:** tag them `@awaiting:<backlog ID>` (information only until a
  human removes the tag), and rewrite CTL-025 around a separate agent GitHub identity,
  since a single maintainer is allowed to self-review.
- **Next:** apply `docs/spec-drafts/spec-08-awaiting-and-agent-identity.patch`, add the
  `AGENTS.md` rule, and freeze. Expected: required 7/7 green.

### ENV-01 — Local environment as a by-product

Status: **built 2026-10-10; awaiting freeze.** Dockerfiles for the four services and
the frontend (`node:24-bookworm-slim` pinned by digest, non-root, permissions normalized,
built from the repository root), a local-only `docker/spec-tools` image for the payment
fake and collector, and `compose.yaml` (127.0.0.1-only ports, read-only file systems,
all capabilities dropped, health checks). `tools/compose-smoke.mjs` passes 13/13. CTL-001..005
pass. The patch `docs/spec-drafts/env-01-docker-and-browser-container.patch` removes the
`@awaiting:ENV-01` tags. It also fixes a spec bug: the compose reader ignored YAML merge
keys, which Compose honors. And it moves the browser suite into the pinned Playwright
container, with re-rendered baselines, because Mac-rendered baselines failed on Linux CI
by about 1% of pixels. Original scope: an agent builds the Dockerfiles and `compose.yaml`
until the `local` and `pipeline` static scenarios pass. The existing harness must
still pass unchanged (the runtime contract is unaffected). Closes ARCH-05 (A-17).

### SPEC-09 — Continuous delivery controls (A-21..A-23)

Status: **drafted 2026-10-10; awaiting review and freeze.** Patch:
`docs/spec-drafts/spec-09-continuous-delivery.patch`. Spec work only, no AWS.
- New controls: CTL-015 (pull requests deploy to non-prod; only `main` deploys to prod),
  CTL-027 (thin workflows), CTL-028 (no agent merges), CTL-035 (OIDC trust pinned),
  CTL-060 (release record). Rewritten: CTL-023 and CTL-025.
- New contract rules: DC-009 (thin workflows) and DC-010 (release record), with
  `contracts/release-record.v1.schema.json`.
- Static checks now follow each run step into the script it calls, so the existing
  controls keep working with thin workflows.
- Calibrated with 19 plants, all caught.
- Against this repository: the required tier passes, the new controls await their
  backlog items, and CTL-028 passes live.
- CTL-025 fails live until the `main` ruleset requires up-to-date branches and approval
  of the most recent push. That's a settings change for Dustin before the freeze.
- Preventive half of "agents never merge": `tools/github/agent.mjs` now refuses to merge,
  approve, approve deployments, change rules or push to `main`.
Original plan:
- **Rewrite CTL-023:** the prod deploy runs only on push to `main`, in the `prod`
  environment (protected branches, no required reviewer). It verifies both attestations,
  and that the attested tree hash equals `main`'s tree.
- **Rewrite CTL-025:** the agent identity can't approve, merge or bypass: it isn't a
  code owner, a ruleset bypass actor or a reviewer. The `main` ruleset requires
  code-owner approval or a human admin bypass, approval of the last push (so nobody can
  push after approval), and branches up to date before merging (a merge queue later).
  The prod reviewer clause is dropped.
- **New, static, CI-02 (A-21):** every `run:` step in `delivery-*.yml` calls one script
  under `scripts/ci/` or `infra/`. Privileges live only in workflow YAML.
- **New, template, ENV-02:** every IAM role that trusts GitHub's OIDC provider pins
  `aud` to `sts.amazonaws.com` and `sub` to this repo plus one environment (`nonprod` or
  `prod`), with no wildcards. The non-prod role lives only in the non-prod account.
- **New, static, ENV-03:** non-prod deploys run on same-repo `pull_request`, never
  `pull_request_target`. Prod deploys run on push to `main` and need non-prod evidence
  for the same tree.
- **New, live, ENV-03:** a change promotes only if a human approved it or merged it.
  A merge through the human admin bypass counts and is recorded as a self-merge. Anything
  merged by the agent identity does not promote.
- **New, EVID-01 (A-23):** every prod promotion publishes a release record with the
  required fields as a GitHub Release, plus an attestation. Later (ENV-02/03): the record
  is copied to an S3 Object Lock bucket in the log-archive account.
