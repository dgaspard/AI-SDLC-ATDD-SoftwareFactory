# Five-week project plan: rebuilding a service from executable expectations

> Current business direction: see [SPEC-01 decisions](docs/specs/business-decisions.md).
> The user has specified four services, including VeterinarianServices, and checkout
> after a documented visit. Earlier held/pay-to-confirm targets below are historical
> proposals superseded by the published contracts.

## Objective and scope

Prepare a November presentation demonstrating that reviewed BDD scenarios, API
contracts, and observability contracts can guide an AI agent to recreate a deleted
service that interoperates with existing services.

The fourth pillar is **Engineering Discipline**: passing behavioral specifications,
API contracts, and observability checks is followed by an implementation review of
service boundaries, payment safety, and maintainability. The required gate is
[ENG-02](BACKLOG.md#eng-02--independent-calibrated-engineering-review), which
supersedes the self-review in
[ENG-01](docs/history/backlog-completed.md#eng-01--review-implementation-quality-across-the-language-swap).
Apply it after code generation at the all-JavaScript implementation checkpoint
and every Python Checkout reconstruction. Record test results separately from
review findings; both the automated checks and engineering review must pass.

Primary demonstration: build all services in JavaScript, show the Playwright workflow
passing, delete Checkout, have the agent rebuild it **in Python** from the unchanged
tests, then rerun the same Playwright workflow and performance check (A-05). Stretch:
a recorded rebuild of the whole backend in Python. The evidence supports this bounded example,
not a claim that arbitrary enterprise systems can be reconstructed from tests.

Two one-hour talks: a workshop for Black Tech NOLA on 2026-11-07 and a talk for
NOAI on 2026-11-13. Both are a general tour of the test types, with no slides
during the rebuild: the presenter talks while the agent rebuilds Checkout in the
background. There is no fixed rebuild time budget; the rebuild must fit inside the
hour, and its elapsed time is recorded and shown. The schedule is a planning
target, not a delivery guarantee.

Demo flow (A-12, agreed 2026-09-28):
1. Run the frozen FE-002 browser journey headed and visibly: customer logs in,
   books, veterinarian accepts and records the visit, customer is billed and pays.
   It starts at login; customers are seeded, and no sign-up screen is added.
2. The agent prompts the presenter to delete `services/checkout/`; time the deletion.
3. The agent rebuilds Checkout in Python from the unchanged specs and tests.
4. Rerun the same headed journey, then the full aggregate, and show elapsed time.
Fallback: a pre-recorded screen capture of a successful rehearsal rebuild.

### In scope

- Customer, Reservation, VeterinarianServices, and Checkout as separate local HTTP processes,
  each its own project in one repo (A-01), able to use different languages.
- A separate plain HTML/JS frontend project (A-04) and a minimum performance test (A-06).
- Independent in-memory stores and a deterministic fake payment boundary.
- A small browser workflow for appointment reservation and checkout.
- Service-owned feature files, separate cross-service workflow feature files,
  published API contracts, and executable telemetry requirements.
- Independent verification, repeatable reconstruction experiments, and demo recovery.
- Preserve tag `1.0` as history. The new four-service application replaces the legacy
  app; no migration is required (D-24).

### Outside the initial scope

Persistent databases, durable idempotency, cloud deployment, Docker/containers
(decided against for the November demo: added complexity, little value for an unshared project;
revisited for the post-November delivery initiative by A-17), Kubernetes, message
brokers, real payments, authentication infrastructure, production monitoring, and
automatic refund/reconciliation systems. Their absence must be explicit in the talk.
No new feature beyond the core demonstration is required to prove the hypothesis.

## Current position

Status is tracked in [BACKLOG.md](BACKLOG.md) (Now / Next / Done); this plan does
not repeat it. As of 2026-10-07 the project is ahead of the revised schedule
below. Complete: specification, architecture, JavaScript implementation,
frontend, performance, SEC-01, MVP-02A, ENG-02, and the SPEC-06 freeze (all ten
suites pass on JavaScript). r1 and r2 are accepted as reconstruction evidence.
r4, a fresh JavaScript → Python Checkout rebuild against the SPEC-06 specs,
passed with zero interventions, and ENG-02 has reviewed it. That closes SPEC-06
and gives EXP-01 its third reconstruction. Next: SPEC-07 (suppressing tests and
retiring features through the spec), ahead of CI-01. PLAY-01 (due 2026-10-13)
and DEMO-02 are handled offline. 2026-10-10: SPEC-08 (delivery as an executable
specification) drafted for after the talks; decisions A-16..A-20.

## Working agreements and ownership

Follow [the development workflow](docs/development-workflow.md) for each capability:
features → API contracts → standards/telemetry → specification review → executable
failing checks → implementation → independent verification.

The presenter owns business decisions, acceptance of specifications, and the final
presentation scope. The agent drafts artifacts, identifies gaps, builds authorized
checks and implementation, and records evidence. Review expectations independently
of generated code; a separate human review is useful where available, not assumed.

The plan owns milestones and experiment criteria. [BACKLOG.md](BACKLOG.md) owns task
status and unresolved decisions. [Observability documentation](docs/observability.md)
owns telemetry definitions and coverage. Do not turn this plan into a second copy of
the requirements. Review and test each bounded slice before moving to the next.

## Target service boundaries

| Service | Owns | Dependencies |
| --- | --- | --- |
| Customer | Profiles, pets, account balance, booking eligibility | None |
| Reservation | Calendar, reservation lifecycle, clinical Visit storage | Customer; Checkout (booking fee, D-32) |
| VeterinarianServices | Service catalog and fees in USD | None |
| Checkout | Bills, promotions, all payments, cash | Customer, Reservation, VeterinarianServices, fake payment provider |

Services communicate through their published interfaces, never shared store access.
Resolve the mapping from existing pets/owners/visits before changing current APIs.
Keep the fake payment implementation outside any deleted service and independently
inspect its requests and invocation counts.

## Architecture decisions for a language-neutral demo

| ID | Decision |
| --- | --- |
| A-01 | One repository with separate projects: `services/customer/`, `services/reservation/`, `services/veterinarian-services/`, `services/checkout/`, `frontend/`, and `spec/` (features, contracts, tests, harness, payment fake, telemetry collector). Each service has its own dependency file and builds, starts, and is deleted independently. |
| A-02 | Language-neutral runtime contract: every service starts with `services/<name>/start`, reads configuration only from environment variables (port, dependency URLs, `CLINIC_NOW`, telemetry endpoint), and exposes a health endpoint and a test-only reset endpoint. Static ports: frontend 3000, Customer 4001, Reservation 4002, VeterinarianServices 4003, Checkout 4004, payment fake 4010, OTLP collector 4318. A port-freeing script clears a port before a service starts or is rebuilt. Full contract: `spec/contracts/runtime-contract.md`. |
| A-03 | Tests are black-box: they reach services only over HTTP, validate responses against the published schemas, and never import application code. Telemetry is exported over OTLP to a test collector so OBS rules work in any language. |
| A-04 | The frontend is its own plain HTML/JS project. It calls services only through their published APIs and uses accessible labels for Playwright. |
| A-11 | FE-01 uses vanilla JavaScript, a fixed desktop viewport, and a small headless Chromium suite. Preserve branding, layout, wording, and interactions across reconstruction with a small reviewed visual tolerance. Retain approved CSS, local fonts/images, design instructions, tests, and visual baselines under `spec/frontend/` and `spec/tests/browser/`; regenerate frontend application code. The separate frontend experiment follows the Checkout experiment (DEMO-04). |
| A-05 | Final demo: all services built in JavaScript; Checkout rebuilt live in Python against unchanged tests; Playwright and performance rerun. A whole-backend Python rebuild is a recorded stretch. |
| A-06 | Local performance defaults approved: five paced workers, 2 s warm-up and 10 s measured traffic; each key operation requires p95 below 200 ms, at least 20 samples, zero unexpected errors, and correct financial outcomes. Target roughly 20–30 s total. Same frozen workload/thresholds for every language. See PERF-01 for fixture and measurement details. |
| A-07 | Protection of `spec/**`, `docs/specs/**`, `.github/**`, `.claude/**`, `AGENTS.md` (humans edit, agents read; build-phase tasks never touch them): `.claude/settings.json` deny rules plus a PreToolUse hook (edit tools and shell), `CODEOWNERS`, and a required `guard` workflow that checks the human-frozen `spec/protected.sha256` manifest and rejects skipped or focused tests. |
| A-08 | Observability follows OpenTelemetry specifications. Each service uses the official OpenTelemetry SDK for its language (allowed dependency), exports over OTLP, propagates W3C Trace Context, sets standard resource attributes (`service.name`, `service.version`), and uses OpenTelemetry semantic conventions (reference v1.44.0, stable HTTP subset enforced; OBS-041, OBS-042) for HTTP spans and errors. Only business-specific attributes use the `petclinic.*` namespace. |
| A-09 | Simple local authentication, no cloud dependency. Users are defined in `spec/seed-data/users.json` with plain-text demo passwords (clearly non-production). The Customer service exposes login and returns a JWT signed with HS256 (shared demo secret in an environment variable), lasting 8 hours of clinic time. Every service verifies tokens locally, so no service calls another to authenticate. Roles: `veterinarian` sees all data; `customer` sees only their own records (others return 404); `service` tokens, signed by the calling service, are the only way to call internal operations. Full rules: `spec/contracts/auth-contract.md`. |

| A-10 | Traces are exported only as OTLP/HTTP **protobuf** (`OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`), in every language. It is the one format both the Node and Python SDKs support, so a single standard applies to any rebuild. The test collector (`spec/harness/collector`, port 4318) accepts only protobuf and rejects anything else with 415; RT-008 fails a service that exports the wrong format. JSON and gRPC are not used; traces only (no metrics or logs). Tests shorten batching with `OTEL_BSP_SCHEDULE_DELAY=100` and wait up to 5 seconds for spans. A terminal trace-tree printer (`npm --prefix spec run trace`) shows traces in the demo. |
| A-12 | Two one-hour talks (Black Tech NOLA workshop 2026-11-07; NOAI 2026-11-13). Demo: headed FE-002 journey starting at login (no sign-up screen), timed deletion of `services/checkout/`, live Python rebuild of Checkout only while the presenter talks, then the same headed journey and full aggregate. No fixed time budget beyond fitting the hour; elapsed time is shown. Fallback: pre-recorded rehearsal rebuild. |
| A-13 | CI/CD placement decision framework (2026-10-03, branch `ci/perf-01-required-check`, tag `ci-perf-01-required`): a check belongs in the agent's local loop only if the agent needs the signal while building to converge; it belongs in CI, least-privilege and CI's-copy-authoritative, if it needs infrastructure/credentials/live external data unsuitable for an autonomous local session, or if the agent could make it pass dishonestly without independent detection (needs an independent CI rerun, or a tamper-evident/frozen definition CI can cheaply verify, as GUARD-01 already does). Composed with a second axis — portable (candidate for a future org-owned, centrally curated check, per ENG-02) vs. project-specific (stays local to this repo) — into a 2x2 that any new check is sorted into before it's added anywhere. First applied action: promote PERF-01 from the informational `suite` job to its own required `performance` job in `.github/workflows/guard.yml`, since it is cheap (~15s), tamper-evident, and a final gate rather than something the agent needs mid-build. Full framework: `docs/ci-cd-placement.md`. |
| A-14 | Demo evidence-sufficiency decision (2026-10-03): r1 and r2 (DEMO-01) each showed zero interventions, in both language directions (JS→Python and Python→JS). Rather than hold to "three consecutive clean runs" as a fixed numeric gate, the live-readiness bar is explicitly relaxed to "two clean rehearsals, covering both directions, are sufficient evidence the reconstruction claim holds." r3's screen recording is reclassified from a blocking rehearsal to an optional fallback-recording task (expected under an hour), completed whenever before the talks rather than gating MVP-02A/SEC-01/ENG-02 work. Freed near-term capacity is reprioritized to DEMO-02 (the presentation speaking outline), on the reasoning that the outline needs to exist and be rehearsed before further rehearsal reps add marginal value. Not separately tagged; recorded here and in `docs/talk-notes.md` so the reasoning is referenceable when discussing the project's own decision-making process. |
| A-15 | Portable-vs-project-specific physical split for the review/security library (2026-10-03): `tools/security/` is split into `portable/` (generic checks — Semgrep, Bandit, pip-audit/npm audit, detect-secrets, plus two custom Semgrep rules — that take no petclinic-specific knowledge to run) and `project-specific/` (this app's own config and findings, e.g. its real CORS policy, its auth-coverage architecture notes). The sorting test: if running the same mechanism against a different project would need only new parameters, it's portable; if it needs rewritten logic, it's project-specific — the same engine/parameters distinction ENG-02 already uses for the import-boundary check, now confirmed to generalize to security checks too. `.github/CODEOWNERS` requires review on `tools/security/portable/`, mirroring GUARD-01's protection model but lighter: mandatory review, not a hash freeze, since portable checks are meant to evolve. `tools/review/` (ENG-02) should adopt the same physical split once it's built. Intent: `portable/` is written with zero petclinic-specific references, so it doubles as a ready starting security baseline for a brand-new project, and is the literal staging ground for whatever eventually gets lifted out into a shared, centrally-maintained repo once proven on a second real project (ENG-02's graduation criterion). |
| A-16 | Delivery compliance anchor (2026-10-10, SPEC-08): NIST SP 800-53 Rev 5 (Moderate baseline) plus NIST SP 800-218 (SSDF). Every delivery control is a scenario tagged `@CTL-NNN @nist:<control> @ssdf:<practice>`, so the compliance mapping is executable and queryable rather than a separate document. Cost controls are tagged `@nist:none @ssdf:none` explicitly. |
| A-17 | Containers in every environment (2026-10-10): one image per runnable project, Docker Compose locally, Amazon ECS on AWS Fargate in non-prod and prod. Resolves ARCH-05 and supersedes the initial-scope "Docker/containers (decided against)" note, which was right for the November demo and is revisited for the delivery initiative. |
| A-18 | AWS-native infrastructure as a by-product (2026-10-10): AWS CDK synthesized to CloudFormation, with AWS CloudFormation Guard policies, and GitHub Actions with OIDC into AWS. Supersedes "Terraform on AWS" (2026-10-04). The synthesized template plus deployed behavior is the contract, not the CDK code, mirroring A-02: an agent may rebuild `infra/` in CDK-JS, CDK-Python or plain CloudFormation without a spec change. |
| A-19 | Delivery specs live in `spec/delivery/` (2026-10-10): inside the protected tree, so the guard hash, CODEOWNERS and run-all tiers apply, but with their own `package.json` and lockfile and no imports from `spec/harness`, so the package is portable to another repository. A human-readable catalog (`catalog.yaml`) renders `docs/delivery/environments.md` (Local / Non-prod / Prod), and scenarios keep the two from drifting. |
| A-20 | Narrower root of trust (2026-10-10, applied at the SPEC-08 freeze): delivery workflows become agent-built by-products, so the protected `.github/` path narrows to `.github/workflows/guard.yml` and `.github/CODEOWNERS`. Delivery workflows are `.github/workflows/delivery-*.yml` (DC-006) and are checked by `spec/delivery` scenarios. CI's own run of the suite is authoritative (A-13). |
| A-21 | Thin workflows, thick scripts (2026-10-10, CI/CD option C): delivery workflow files are small and human-owned. They decide privilege only: triggers, `permissions`, `id-token`, GitHub environment, which AWS role. Every step calls an agent-built script (`scripts/ci/*`, `infra/*`), so agents change what the pipeline does with their existing `contents` permission, and a human edits YAML only when a job's privileges change. The agent App keeps no `workflows` permission. Chosen over granting it because GitHub's workflow permission covers the whole folder, including the root of trust, and a pushed branch can request OIDC tokens. |
| A-22 | Continuous delivery with the human gate at PR approval (2026-10-10, long-term target): a pull request deploys to an ephemeral non-prod environment and runs the live tier there. After a human approves and merges, the same images promote to prod automatically once non-prod evidence exists for the same git tree. Identity is the tree hash the repo already uses: PRs must be up to date with `main`, so the merged tree equals the tested tree. This supersedes the prod-environment reviewer (CTL-023/025 as frozen 2026-10-10). Separation of duties is "agents never approve, merge or bypass". With one maintainer, a human merge through the admin bypass (for PRs the maintainer authored) is a human decision: it promotes normally, and the release record shows it as a self-merge. Merge-time freshness uses "require branches to be up to date" for now, and a GitHub merge queue once several agents open PRs in parallel. |
| A-23 | Governance record per change (2026-10-10): each prod promotion produces a release record assembled by the pipeline (EVID-01): PR, agent and model, human approver, spec tree hash, test run records, non-prod live results, SBOM, both attestations, deploy and teardown times. It's published first as a GitHub Release with an attestation, and from ENV-02 also copied to S3 with Object Lock (write-once retention) in a log-archive account, because the repo admin can delete GitHub Releases. |

These architecture tasks (ARCH-01..04, OTEL-01, AUTH-01, GUARD-01) take priority over designing the
per-service API contracts (SPEC-04), because the contracts and tests must follow them.

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

## Reconstruction experiment protocol

1. Establish a known-good checkpoint: all required suites green, browser workflow
   demonstrated, and OBS coverage accurately recorded. Keep recovery files outside
   the experiment workspace. Do not alter the original `1.0` tag.
2. Prepare a reviewed manifest of Checkout application files, including adapters
   or generated copies that contain its logic. Retain only explicit service launch
   conventions; do not conceal Checkout behavior in shared helpers or fixtures.
3. Create a fresh workspace and fresh agent context with the service implementation
   removed. Exclude Git history containing the solution, compiled artifacts, old
   source copies, and conversations containing that implementation. Record exactly
   what specifications, scaffolding, dependencies, and surviving services are provided.
4. Freeze and hash the retained tests/specifications and fixed reconstruction prompt.
   Use independently authored evaluation cases exercising published requirements;
   do not introduce undisclosed business rules as surprise acceptance criteria.
5. Show the missing service and failing checks, then ask the agent to rebuild it.
   Capture wall-clock time, commands, test iterations, model/settings as reported
   by the tool or operator, and every human intervention. Never invent unavailable data.
6. Run all three verification layers and the independent cases. Check retained
   artifact hashes and service diffs, inspect the browser, and capture a trace.
   Report regressions or infrastructure failures separately from missing behavior.
7. Repeat from clean state at least three times, including unsuccessful runs in
   the result record. A successful repair in an implementation-aware conversation
   is useful development evidence but is not a fresh reconstruction experiment.

No deletion is performed as part of adopting this plan. Future deletion applies
only to the agreed disposable experiment workspace and explicit manifest.

### What the experiment can establish

Track time to green, completed versus attempted runs, specification corrections,
human interventions, forbidden test/spec changes, independent-check failures, and
review findings. Preserve run commands and artifacts, not just a success percentage.

This can demonstrate feasibility and repeatability for the example. It cannot by
itself prove that BDD causes better AI results. If time permits, compare fresh runs
using prose requirements with runs using the full executable specification set,
holding service scope, environment, evaluation suite, model/settings, and time
budget constant. Report the small sample and differing inputs; do not claim a
controlled industry-wide result or that such a comparison isolates BDD alone.

### Run record template

```text
Run ID / date:
Deleted service(s) and manifest:
Starting checkpoint / retained artifact hashes:
Provided context and prompt:
Agent model/settings (if known):
Environment and dependency versions:
Time budget / elapsed time:
Test iterations and suite results:
Human interventions / specification corrections:
Independent evaluation and diff review:
ENG-02 review record, automated gate results, findings and dispositions:
Evidence paths:
Outcome and next action:
```

## Live-demo gate and fallback

There is no fixed time budget (A-12); the rebuild must comfortably fit in the
one-hour talk. Proceed live
only after three consecutive clean Checkout rehearsals fit that window, pass all
required checks, preserve frozen expectations, and need no unplanned human code
repair. Disclose any prepared scaffolding and rehearsed prompt.

Each rehearsal must also pass
[ENG-02](BACKLOG.md#eng-02--independent-calibrated-engineering-review):
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

## Risks and scope decisions

| Risk | Response |
| --- | --- |
| Specifications omit important behavior | Review concrete counterexamples and use independent evaluation cases |
| Agent changes tests or recalls deleted code | Frozen hashes, diff review, clean context, isolated source snapshot |
| Slow/flaky browser tests obscure business logic | Small browser workflow set; detailed checks at service/API level |
| Two services share the same wrong assumption | Provider/consumer contract assertions and independently verified state |
| Telemetry looks correct while behavior is wrong | Pair trace checks with API, state, and payment call-count checks |
| In-memory state is mistaken for production resilience | Explain restart data/idempotency loss; exclude durability claims |
| Five-week scope grows | Drop two-service and recovery stretch work first; retain core correctness |
| Reconstruction is too slow live | Use rehearsal gate and a disclosed recording; report actual timings |
| Language swap exposes hidden JavaScript assumptions in tests | Black-box HTTP tests only (A-03); exact specs for money format, time zone, IDs; rehearse the Python rebuild early |
| Python environment fails at the venue | Preinstall runtime and dependencies; pin versions; keep a recording |
| Performance results vary by machine | Modest thresholds; same machine for both runs; report actual numbers |

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

## Deferred: network hardening (decided 2026-10-10)

Out of scope for the delivery initiative until a real data or exposure need appears.
This is a test application with no real data, and its non-prod environment
deliberately exposes test endpoints. The deferred work covers private subnets for tasks,
AWS WAF on the load balancer, restricted ingress, VPC endpoints instead of public
egress, and a boundary for non-prod test endpoints. Most of it also needs a NAT gateway
or interface endpoints, which the $25/month ceiling rules out (SPEC-08 cost
analysis). Tracked as the `network-hardening` catalog entry with status `deferred`.
