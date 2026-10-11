# Project plan: rebuilding a service from executable expectations

What this file owns: the objective and scope, service boundaries, the reconstruction
experiment protocol, and risks. Task status lives in [BACKLOG.md](BACKLOG.md),
architecture decisions (A-xx) in [docs/decisions/architecture.md](docs/decisions/architecture.md),
and deferred work in [BACKLOG.md § Deferred](BACKLOG.md#deferred). The original
five-week schedule and live-demo gate are in
[docs/history/project-plan-2026-09.md](docs/history/project-plan-2026-09.md).

> Current business direction: see [SPEC-01 decisions](docs/specs/business-decisions.md).
> The user has specified four services, including VeterinarianServices, and checkout
> after a documented visit.

## Objective and scope

Prepare a November presentation demonstrating that reviewed BDD scenarios, API
contracts, and observability contracts can guide an AI agent to recreate a deleted
service that interoperates with existing services.

The fourth pillar is **Engineering Discipline**: passing behavioral specifications,
API contracts, and observability checks is followed by an implementation review of
service boundaries, payment safety, and maintainability. The required gate is
[ENG-02](docs/history/backlog-completed.md#eng-02--independent-calibrated-engineering-review), which
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

**Talk formats (A-24, 2026-10-11, supersedes A-12's talk format).** The source of
truth is Dustin's outline and decks in `~/Documents/Talks/Software Factory/`
(`three-talk-outlines.md`). Where anything in this repository disagrees, follow the
outline.

- Excella leadership (2026-10-14): an honest status report and a proposal for an Excella
  software factory, a consistent playbook for the AI incubator across projects. Excella
  owns the core, and each agency or project owns its own rules. PLAY-01 is superseded.
  Assumed 30 minutes plus 15 of discussion.
- Black Tech NOLA (2026-11-07): a **45-minute** hands-on workshop, 12:15–1:00, with up
  to 30 attendees. One shared build of a small reservation app from a separate
  Cucumber starter. No PetClinic tour, CI/CD or guards.
- NOAI (2026-11-13): **50 minutes plus 10 of Q&A**. The Checkout rebuild is shown as a
  **recording**, not run live.

The original A-12 plan, kept for history: two one-hour talks, each a general tour of
the test types, with the agent rebuilding Checkout live while the presenter talks.
The demo flow below still describes the rebuild that the recording shows.

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

Status is tracked in [BACKLOG.md](BACKLOG.md); this plan doesn't repeat it. As of
2026-10-11: the four JavaScript services, the frontend, performance, security (SEC-01),
the admin role (MVP-02A), independent review (ENG-02), suppression and retirement
(SPEC-07), and the delivery specification with local containers (SPEC-08, ENV-01,
SPEC-09) are complete. Reconstruction evidence: r1, r2 and r4, all with zero
interventions; r4 is the NOAI recording. Next: talk preparation, then the sequence in
[BACKLOG.md § After the talks](BACKLOG.md#after-the-talks-2026-11-13--governed-delivery).

## Working agreements and ownership

Follow [the development workflow](docs/development-workflow.md) for each capability:
features → API contracts → standards/telemetry → specification review → executable
failing checks → implementation → independent verification.

The presenter owns business decisions, acceptance of specifications, and the final
presentation scope. The agent drafts artifacts, identifies gaps, builds authorized
checks and implementation, and records evidence. Review expectations independently
of generated code; a separate human review is useful where available, not assumed.

The plan owns scope and experiment criteria. [BACKLOG.md](BACKLOG.md) owns task
status and unresolved decisions. [docs/README.md](docs/README.md) says where every
other kind of document belongs. [Observability documentation](docs/observability.md)
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

