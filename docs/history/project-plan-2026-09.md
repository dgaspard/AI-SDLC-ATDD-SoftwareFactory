# Original project plan sections (September–October 2026)

Moved verbatim from `PROJECT-PLAN.md` on 2026-10-11. They describe the original
five-week plan, the pre-specification acceptance targets and the live-demo gate. All
are complete or superseded: the specifications are frozen in `spec/`, and A-24 replaced
the live demo with a recording. Kept for history; don't treat them as current.

## Five-week schedule and exit criteria

| Week | Focus and backlog links | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| 1 | Business decisions and initial specification set: SPEC-01, SPEC-02, SPEC-03 | Decision record; per-service and workflow features; service/payment API contracts; reviewed telemetry obligations and coverage links; cancellation edge-case decisions | Core workflow semantics are explicit, specification layers agree, and the user has reviewed them; unresolved stretch behavior is labeled |
| 2 | Architecture, protection, and protected tests: ARCH-01..04, GUARD-01, SPEC-04, TEST-01 | Repository layout and runtime contract; black-box harness and OTLP collector; test protection; per-service API contracts; service harness and payment fake; service and schema contract tests; access-control and telemetry checks; recorded red baseline and green/mutation rehearsal | Service tests fail on creation for identifiable missing behavior; tests are frozen/hashed so the agent cannot modify them; 310 TEST-01 slice checks pass against temporary services and deliberate defects are caught |
| 3 | Service implementation: IMPL-02, FE-01, PERF-01 | All four services in JavaScript; plain HTML/JS frontend; minimum performance test; success, decline, retries, and rejection paths; completed OBS mappings | All agreed core BDD, API, and observability suites pass against real local services; no weakened assertions; clean startup/reset/teardown |
| 4 | Reconstruction experiments: DEMO-01, DEMO-03, EXP-01 | Isolated experiment workspace; exact deletion manifest; fixed prompt; at least three fresh Checkout reconstructions in Python; evidence log; optional two-service attempt | Each run has recorded timing, interventions, failures, and independent evaluation; decide live feasibility against the agreed time budget |
| 5 | Presentation and reliability: DEMO-02 | Final walkthrough and narrative; known-good checkpoint; bounded reset procedure; representative recording; final rehearsal results | Core scope frozen; three consecutive Checkout rehearsals meet the demo gate below, or presentation switches to a disclosed recorded reconstruction |

These are focus periods, not a large handoff between specification and development
teams. Week 1 establishes the small core set; discoveries later require explicit
specification updates before dependent implementation. Do not defer ambiguous
payment semantics to the coding agent.

## Minimum acceptance portfolio

The following are scenario targets, not yet approved response schemas or business
policies. SPEC-01 resolves semantics and SPEC-02 makes them executable requirements.

| Capability | Required behavior to specify and verify | Independent evidence |
| --- | --- | --- |
| Customer eligibility | Eligible, ineligible, and unknown customer | State/outcome assertions, API response, OBS-012 |
| Reservation | Eligible customer can hold an available appointment; conflicts do not overwrite another reservation | Service feature, API/state assertions, OBS-013 |
| Checkout success | Agreed payment operation succeeds and the held reservation is confirmed | Browser workflow, payment request/count, reservation state, OBS-014–OBS-017 |
| Payment decline | Visible rejection and no confirmation; hold disposition explicitly defined | Workflow and state assertions, payment outcome, OBS-018 |
| Checkout replay | Same valid request/key returns the agreed outcome without another payment or confirmation | Sequential and concurrent tests, fake invocation counts, OBS-019 |
| Unknown reservation | Agreed error and no payment attempt | API/business assertions plus reviewed failure telemetry |
| Conflicting key reuse | Same key with different input yields the agreed rejection and no extra payment | API/state assertions and reviewed rejection telemetry |
| Trace propagation | Correct trace/parent relationships and isolation across real service processes | Shared trace capture, OBS-002, OBS-017, OBS-022 |
| Privacy and failure handling | No forbidden data; spans end with honest outcomes; export failure does not change business results | Captured attributes/events and fault injection, OBS-003–OBS-008, OBS-020–OBS-021 as reviewed |

Do not implement every proposed OBS outcome merely because it appears in a draft
table. Review the required subset and mark deferred obligations explicitly. Logs
and metrics remain conditional. A trace alone cannot prove business state or
exactly-once payment behavior; assert the state and payment calls separately.

## Decisions required before implementation

SPEC-01 must settle ownership of price/currency and payment authorization versus
charge, reservation lifecycle/expiry, decline behavior, and idempotency scope,
retention, replay, and concurrency. Also settle unknown reservation and conflicting
key responses, timeout behavior, and preservation of the original visit workflow.

Payment-success/confirmation-failure must have an honest observable outcome even
if automated recovery is excluded. Never imply confirmed booking or declined
payment when the actual outcome is incomplete or unknown. Advanced retries/refunds
are stretch scope after the core milestone.

## Live-demo gate and fallback

There is no fixed time budget (A-12); the rebuild must comfortably fit in the
one-hour talk. Proceed live
only after three consecutive clean Checkout rehearsals fit that window, pass all
required checks, preserve frozen expectations, and need no unplanned human code
repair. Disclose any prepared scaffolding and rehearsed prompt.

Each rehearsal must also pass
[ENG-02](backlog-completed.md#eng-02--independent-calibrated-engineering-review):
automated gates, the connected trace, an independent review with human sign-off
on security and boundary findings, and a calibrated reviewer. Retain a review
record for the JavaScript baseline and each Python reconstruction. This is a
demo-readiness gate, not a production-readiness claim.

Suggested sequence: explain one business scenario, show its API and OBS obligations,
show the working workflow, remove Checkout in the disposable workspace, show red
checks, reconstruct, then show green checks, browser outcome, and connected trace.

If time expires, preserve the result as an incomplete run and switch to a clearly
labeled recording or separate known-good workspace. Do not present restored code
as an agent-generated success. Reinstalling dependencies and debugging the venue's
network should not consume the demonstration: preinstall runtime/browser assets
and have an offline recording available; live agent access may still require network.

Only attempt two-service reconstruction after the one-service gate is met. Preserve
Customer, the payment fake, independent tests, and published interfaces. Evaluate
Reservation and Checkout separately as well as together, so matching errors cannot
pass solely through mutual agreement. Prefer a recorded result if timing is unstable.

## Revised schedule (2026-09-29, re-revised 2026-10-03 per A-14)

Ahead of schedule, so the plan adds MVP-02A (administrator role and veterinarian
roster, with SPEC-06 folded in), ENG-02 (independent, calibrated review), and
PLAY-01 (Excella playbook, evidence, short recording) for the 2026-10-14 Excella
leadership visit.

Per A-14 (2026-10-03): DEMO-01's r1 and r2 are accepted as sufficient
rehearsal evidence; r3's recording is no longer a blocking milestone and is
dropped from this table (fallback recording happens whenever before the
talks). The capacity that freed up goes to drafting and rehearsing the
DEMO-02 speaking outline this week, ahead of SEC-01.

| By | Milestone |
| --- | --- |
| 2026-10-02 | ~~DEMO-01 rehearsals complete; fallback recorded~~ — superseded by A-14: r1 + r2 accepted, r3 is non-blocking |
| 2026-10-03–10-04 | DEMO-02 speaking outline drafted (problem / process / findings) and read through once against the one-hour budget |
| 2026-10-05 | SEC-01 security spike complete (calibration + recommendation, feeds ENG-02) |
| 2026-10-07 | MVP-02A and SPEC-06 decisions, specs, and red tests frozen; ENG-02 tooling built |
| 2026-10-10 | MVP-02A JavaScript build green; ENG-02 passes |
| 2026-10-13 | PLAY-01 package ready |
| before 2026-11-07 | Fresh Python rehearsal against the new specs; DEMO-02 narrative and final recording |
