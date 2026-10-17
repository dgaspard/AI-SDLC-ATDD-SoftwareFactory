# Project plan: building an AI-SDLC software factory

What this file owns: the product direction and objective, the factory's shape, the
guided product experience, non-goals and success criteria, the ordered roadmap, the
reference application's boundaries, the reconstruction protocol and the risks. Task status
lives in [BACKLOG.md](BACKLOG.md), decisions (A-xx) in
[docs/decisions/architecture.md](docs/decisions/architecture.md), and everything else
where [docs/README.md](docs/README.md) says.

## Objective

Build a **Software Factory** for enterprise and government organizations that
**normalizes platform engineering**: it makes approved engineering practices repeatable
and accessible across teams. That means reusable delivery paths, executable standards,
consistent evidence, clear ownership and governed exceptions. An organization configures
and extends its factory instead of rebuilding the foundation for each application
(A-28).

The factory is the product. It works because

- humans decide and freeze the expectations: business examples (BDD/ATDD), API and
  domain contracts, observability rules, and delivery controls;
- agents build the implementation and the delivery code against those frozen,
  executable expectations, inside enforced boundaries;
- independent evidence (test run records, calibrated review, release records) supports
  every decision to ship.

**Who it's for.** The initial customer is an enterprise or government technology or
platform leader. Product owners and engineering teams use it.

**Target market, not a readiness claim.** Nothing here claims production readiness,
compliance certification or an authorization to operate. The NIST mapping (A-16) makes
controls traceable; it doesn't certify anything. AWS (A-17, A-18) is the current
implementation choice. Portability to other environments is a product goal, not
authorization to build a second cloud implementation.

### Three layers, kept apart

| Reusable factory mechanisms (core, versioned) | Organizational policy and configuration | Application requirements (each application) |
|---|---|---|
| The delivery method, harness, runner, guard and freeze | Approved practices and standards an organization adopts | Business decisions, domain model and invariants |
| Reusable checks, run-record and evidence formats | Which delivery controls are required, risk thresholds, governed exceptions | Domain and API contracts, feature scenarios |
| Agent identity and boundaries; starter template and dev container | Identity, accounts, environments, rulesets, approved tools | Data, privacy and compliance constraints of the application |
| Delivery-control patterns, review checklists, operating guidance | Who approves, who owns releases, who may accept a risk | Integrations, risk acceptance and release decisions |

This is a conceptual separation, not a package plan. The START-02
[design note](docs/design/start-02-factory-core.md) and A-27 settle packages and
repositories. A mechanism that only works for PetClinic belongs in the application
layer until a second application proves it general. Improvements to the core arrive in
applications through a reviewed, versioned release and a freeze, never as diverging
copies (A-15).

### The guided product experience (proposed, not approved)

The intended experience guides a product owner through defining and reviewing, in order:

1. product purpose, users, scope and constraints;
2. domain contracts and business invariants;
3. service boundaries and API contracts;
4. features and acceptance examples;
5. an executable project plan with traceable verification evidence.

AI assists inside each step: it drafts, translates between business and technical
language, merges contributions and flags conflicts. Humans own acceptance criteria,
policy, risk decisions and approved changes to those definitions, through the existing
review and freeze. An unrestricted chat box that generates code is not the product.
Its form is the simplest workflow that works: reviewable documents in the application's
repository, agent prompts, and deterministic checks, with no separate interface (A-28).
Proposed as GUIDE-01 in [BACKLOG.md](BACKLOG.md#guide-01--guided-product-definition-proposed-2026-10-16); START-01 and
ENT-11 cover its first step.

### Non-goals

- A general-purpose code-generation chat or an agent that decides requirements.
- Claims of production readiness, certification or authorization to operate.
- Several cloud implementations, or replacing the AWS choices now.
- A new package architecture or repository migration outside START-02's steps.
- PetClinic features for their own sake: PetClinic work serves a factory capability,
  a regression need or an experiment.
- Automatic merging, or build agents approving or merging (A-22). A separate approver
  identity bound by a protected policy may approve (A-29, REVIEW-02); a human merges.

### How success will be observed

No result here is claimed yet, and no numeric targets are set.

- **A second application adopts the core** (START-02 step 4) and passes its own gate,
  with every change it forced on the core recorded.
- **Evidence repeats.** Each change produces the same evidence shapes (run records,
  change-evidence report, release record) on any application, without hand assembly.
- **Guided completion.** A product owner completes and reviews the five definition
  artifacts above with AI assistance, and every acceptance example traces to a
  reviewed intent.
- **Less project-specific setup.** The setup a new application needs shrinks to its
  configuration and its own requirements, measured against the second application's
  recorded onboarding effort.

## The reference project

This repository's PetClinic is the factory's reference application and proving ground:
four services, a frontend, a black-box harness, and frozen specifications. PetClinic work
must serve a specific factory capability, a regression need or an experiment. Its domain
choices (clinic rules, demo authentication, the `petclinic.*` telemetry namespace) are
application requirements, not factory defaults. It has established, within bounds:

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

### Where the guided experience fits (decided 2026-10-16, A-28)

The order stands. GUIDE-01 starts with START-01 in phase 3, so the guided steps are
designed against a real extracted core and the second application. The cost, accepted:
the product experience waits for cloud delivery and operation. Pulling a
specification-only slice forward alongside phase 1 was considered and not chosen.

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
| PetClinic assumptions leak into reusable mechanisms | The three-layer separation above; START-02 step 1's scan for hard-coded application names; the second application as the test |
| Several AI reviewers agreeing is mistaken for correctness | Approval rests on the required checks and a protected path policy, never on AI verdicts, which stay advisory (proposed REVIEW-02); a human merges |
| Automated approval makes the gates the only defense | The gates' own definitions (the root of trust) always need a human code owner (CTL-062); the guard freeze matters more, not less |
| Build-agent controls and AI inside a generated application get mixed (shared credentials, approvals, evaluations or telemetry) | Keep them as separate trust boundaries: AGENT-01/SUPPLY-01 for build agents, the proposed ENT profiles for application AI |
| Durable state breaks the reconstruction thesis | Phase 4 tests it explicitly before the factory supports stateful or existing applications |
| The core diverges across projects | Ship the core as a versioned package adopted through a freeze, not as copies |
| Documentation drifts from the code | The docs pass in every feature's code review (proposed DOCS-01 makes it executable) |
| Cloud cost grows | $25/month ceiling; ephemeral environments with TTLs (SPEC-08) |
