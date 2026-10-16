# Project plan: building an AI-SDLC software factory

What this file owns: the objective, the factory's shape, the ordered roadmap, the
reference project's boundaries, the reconstruction protocol and the risks. Task status
lives in [BACKLOG.md](BACKLOG.md), decisions (A-xx) in
[docs/decisions/architecture.md](docs/decisions/architecture.md), and everything else
where [docs/README.md](docs/README.md) says.

## Objective

Build a **software factory**: a repeatable way to deliver software with AI agents, where

- humans decide and freeze the expectations: business examples (BDD/ATDD), API and
  domain contracts, observability rules, and delivery controls;
- agents build the implementation and the delivery code against those frozen,
  executable expectations, inside enforced boundaries;
- independent evidence (test run records, calibrated review, release records) supports
  every decision to ship.

The factory has two layers:

| Factory core (shared, versioned) | Project layer (owned by each project) |
|---|---|
| The delivery method and this repository's conventions | Business decisions and domain model |
| Starter template and dev container | Domain contracts and feature scenarios |
| Reusable checks, harness, run-record and evidence formats | Data, privacy and compliance constraints |
| Guard and freeze, agent identity and boundaries | Integrations, environments and accounts |
| Delivery-control patterns, review checklists, operating guidance | Risk acceptance and release decisions |

Improvements to the core arrive in projects through a reviewed, versioned release and a
freeze, never as diverging copies (A-15).

## The reference project

This repository's PetClinic is the factory's proving ground: four services, a frontend,
a black-box harness, and frozen specifications. It has established, within bounds:

- **Reconstruction.** A fresh agent rebuilt the deleted Checkout service from the frozen
  expectations in another language with zero human interventions, three times
  (r1, r2, r4 in [docs/rehearsals/](docs/rehearsals/)).
- **Independent, calibrated review** (ENG-02), which found what a green suite missed.
  A fresh-session review found the r4 retry double charge; the retry scenario is now a
  required check.
- **Governed specification change:** suppression and retirement through the spec
  (SPEC-07), and delivery controls as frozen, executable scenarios (SPEC-08, SPEC-09).
- **Agent identity:** agents act through their own GitHub App and can't approve, merge or
  bypass.

Its limits are deliberate: in-memory storage, a fake payment provider, demo
authentication with one shared secret, no cloud deployment yet, one maintainer, and no
second project. The roadmap removes them in order.

## Roadmap

Ordered. Each phase finishes before the next starts, and items are in
[BACKLOG.md](BACKLOG.md).

| Phase | Goal | Done when |
|---|---|---|
| 0. Reference project | A small, real, multi-service system built from frozen expectations | Complete (see BACKLOG § Done) |
| 1. Governed delivery | Local, non-prod and prod environments delivered from `spec/delivery`, with evidence produced by delivery itself | Every `@awaiting` delivery control is required and green; a release record exists for a prod promotion; EXP-02 rebuilds the delivery code from the spec |
| 2. Operate it | Production observability and cloud security on the deployed system | OBS rules asserted against the deployed environment; runtime compliance and drift checks in place |
| 3. The factory core | A versioned core that several application repositories consume, configured by one file per application ([design](docs/design/start-02-factory-core.md)) | A second, independent application built on the published core passes its own gate (the ENG-02 graduation test) |
| 4. Durable state | A real database, schema change over time, and reconstruction of a service that owns data; then brownfield adapters for the harness | A stateful service survives the reconstruction protocol, or the limit is documented |

The factory core comes before durable state (A-26, 2026-10-13). Extracting it is
refactoring under full gate coverage and removes the PetClinic coupling that everything
later depends on. This reverses the 2026-10-10 order; adapters for existing applications
still wait for durable state.

### Outside the current scope

Kubernetes, message brokers, real payments, external identity providers, network
hardening (deferred in [BACKLOG.md](BACKLOG.md#network-hardening)), and multi-team
operation before phase 3.

### Enterprise capability profiles (proposed, not approved)

Proposed ENT-01..12 ([BACKLOG.md](BACKLOG.md#enterprise-capability-profiles-intake-2026-10-16))
would add optional profiles that a project enables in its factory configuration: enterprise
identity, restricted networks, ingestion, permission-aware retrieval, governed tools, AI
data handling, human approval, local inference, health and value metrics, AI evaluation,
discovery and operational handoff. They would fit inside the phases above, not as a new
phase: discovery, telemetry and handoff extend phase 1–3 items; the identity, data-handling,
tool and evaluation pilot runs on phase 3's second application; ingestion and durable
approvals follow phase 4; restricted networks and local inference wait for a customer need
and budget. Approving ENT-01 or ENT-02 also changes the out-of-scope list above (external
identity providers, network hardening).

## Working agreements and ownership

Follow [the development workflow](docs/development-workflow.md) for each capability:
features → API contracts → standards/telemetry → specification review → executable
failing checks → implementation → independent verification → docs pass.

The maintainer owns business decisions, acceptance and freezing of specifications, and
release decisions. Agents draft artifacts, identify gaps, build authorized checks and
implementation, and record evidence. Agents never approve, merge or bypass (A-22).
Every feature's code review includes the fresh-session docs pass
([docs/README.md](docs/README.md#the-docs-pass-after-every-feature-commit)).

## Reference project service boundaries

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

The scripted procedure for Checkout is in [tools/demo/](tools/demo/README.md).

## Risks

| Risk | Response |
| --- | --- |
| Specifications omit important behavior | Review concrete counterexamples; independent evaluation cases; calibrated review |
| Agent changes tests or recalls deleted code | Frozen hashes, diff review, clean context, isolated source snapshot |
| A green suite misses a failure mode (as r4's retry did) | Fault injection in the harness; independent review; a found gap becomes a required scenario |
| Two services share the same wrong assumption | Provider/consumer contract assertions and independently verified state |
| Telemetry looks correct while behavior is wrong | Pair trace checks with API, state, and payment call-count checks |
| Governance checks prove less than they claim (text-search proxies, unscheduled live checks) | Calibrate every control with planted defects; behavioral tests for delivery scripts; live tier in CI (proposed BEH-01, LIVE-01) |
| The human freeze becomes the bottleneck | Small protected patches and a freeze checklist (proposed REVIEW-01) |
| The agent boundary is only a convention | Agent identity now; an isolated agent runtime holding only the App's credentials (proposed AGENT-01) |
| Build-agent controls and AI inside a generated application get mixed (shared credentials, approvals, evaluations or telemetry) | Keep them as separate trust boundaries: AGENT-01/SUPPLY-01 for build agents, the proposed ENT profiles for application AI |
| Durable state breaks the reconstruction thesis | Phase 4 tests it explicitly before the factory supports stateful or existing applications |
| The core diverges across projects | Ship the core as a versioned package adopted through a freeze, not as copies |
| Documentation drifts from the code | The docs pass in every feature's code review (proposed DOCS-01 makes it executable) |
| Cloud cost grows | $25/month ceiling; ephemeral environments with TTLs (SPEC-08) |
