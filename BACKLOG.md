# Product and demonstration backlog

Task status lives here; the plan, decisions, and milestones live in
[PROJECT-PLAN.md](PROJECT-PLAN.md). Follow [the development workflow](docs/development-workflow.md)
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
| 2026-10-14 | Excella leadership visit, DC (PLAY-01, MVP-02A) |
| 2026-11-07 | Black Tech NOLA workshop, one hour |
| 2026-11-13 | NOAI talk, one hour |

## Now

### DEMO-01 — Rehearse deletion and reconstruction

Status: **evidence accepted (2026-10-03, A-14)**. Checkpoint tag
`demo-01-baseline`. Tools, prompts, and the visible journey are in
[tools/demo](tools/demo/README.md). Agent: Claude Code in a fresh session;
disposable workspace with no prior Checkout history; prepared prompt (reading
the shared JavaScript runtime is allowed and disclosed).

| Run | Direction | Rebuild time | Result | Interventions | Record |
| --- | --- | ---: | --- | ---: | --- |
| r1 (2026-09-28) | JavaScript → Python | 25m 49s (agent) | 10/10 suites + visible journey; verification 9m28s | 0 | [r1](docs/rehearsals/r1.md) |
| r2 (2026-09-29) | Python → JavaScript | ≤32m23s | 10/10 suites + visible journey; verification 8m13s | 0 | [r2](docs/rehearsals/r2.md) |
| r3 | JavaScript → Python (optional recorded fallback) | — | not started | — | — |
| r4 (2026-10-07) | JavaScript → Python, against SPEC-06 specs (`exp-01-spec06-baseline`) | 24m03s (agent 14m46s) | 10/10 suites, 977 tests; verification 27m37s total; recorded (DEMO-03 fallback) | 0 | [r4](docs/rehearsals/r4.md) |

Live gate (A-12), revised by A-14 (2026-10-03): r1 and r2 — zero interventions,
both language directions — are sufficient evidence the reconstruction claim
holds. r3's screen recording is no longer a blocking milestone; it's an
optional fallback recording (expected under an hour), done whenever before the
talks. Watch for r1's unreproduced startup hang if/when r3 runs. On stage use
`finish-rehearsal.sh --journey-only`.

### SPEC-06 — Close Checkout specification gaps found in rehearsal

Status: **Done criteria met 2026-10-07: fresh Python rebuild [r4](docs/rehearsals/r4.md) passed every suite against the new specs. ENG-02 on r4 still pending. New gaps GAP-16 and GAP-17 are under open follow-ups.** Earlier: JavaScript fixes verified: D-58–D-65 accepted; specifications frozen; all ten `npm test` suites pass. D-66 was already decided and frozen separately. Phase: build verification. See [SPEC-06 handoff](docs/handoffs/spec-06.md) for gap-to-test coverage, verification and remaining implementation work. Next: independent engineering review and a fresh Python reconstruction against the updated specs. Sources: [rehearsal r1](docs/rehearsals/r1.md),
[rehearsal r2](docs/rehearsals/r2.md). MVP-02A shipped first, so SPEC-06 now
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

## Handled offline by Dustin

Not tracked here (2026-10-05): **DEMO-02** (the speaking outline,
[talk notes](docs/talk-notes.md)) and **PLAY-01** (the Excella playbook package,
due 2026-10-13). Evidence they draw on lives in `docs/engineering-reviews/` and
`docs/rehearsals/`.

## Next — before the talks (2026-11-07)

### EXP-01 — Measure service reconstruction

Status: in progress through DEMO-01 records. Follow the experiment protocol and
run-record template in `PROJECT-PLAN.md`: at least three fresh Checkout
reconstructions with frozen expectations, no access to deleted source/history,
recorded failures, timings, interventions, and specification changes. Apply ENG-02
to each; keep code-review findings separate from behavioral results. Two-service
reconstruction and a prose-versus-executable comparison are stretch experiments.

### DEMO-03 — Language swap demonstration

Status: planned. Decisions A-05, A-12. The on-stage flow:

- Run the FE-002 journey visibly (`npm run demo:journey`) on the all-JavaScript build
  (login → book → vet accepts/records visit → bill → pay; no sign-up screen).
- Timed delete of `services/checkout/`; the agent rebuilds it in Python from the
  unchanged specs and tests while the presenter talks.
- Rerun the visible journey (`finish-rehearsal.sh --journey-only`); show the agent's
  `npm test` summary, the elapsed time, and the connected trace.
- Fallback: the recorded r3 rehearsal. Stretch (recorded): whole backend in Python.

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
plants were all caught. See [docs/spec-07-design.md](docs/spec-07-design.md),
"Implementation (as drafted)". Original next step: draft the design. This means the tag grammar, the guard changes (reject
bare `@skip`, close the conditional-`skip:` hole, validate references and dates),
expected-failure handling in the Cucumber runner, and one worked example of each
(a retired IMPL-01 cancellation under D-24, and one accepted risk). Then Dustin
reviews it before anything protected changes.

## After the talks (2026-11-13) — governed delivery

The first post-November initiative ([learning plan](docs/post-november-learning-plan.md)):
CI/CD with local, cloud non-prod and cloud prod environments, governed the same way
as application behavior. Delivery code is an agent-built by-product of a frozen,
executable spec, and evidence is a by-product of delivery. Decisions A-16..A-20 are in
`PROJECT-PLAN.md`. Items are in order, and each follows the delivery sequence: spec,
red checks, build, ENG review, freeze. No AWS spend before SPEC-08 is frozen.

### SPEC-08 — Delivery as an executable specification

Status: **frozen 2026-10-10; follow-up patch awaiting review and freeze.**
- Design: [docs/spec-08-delivery-design.md](docs/spec-08-delivery-design.md).
- Spec: [spec/delivery/](spec/delivery/README.md).
- Human guide (generated): [docs/delivery/environments.md](docs/delivery/environments.md).

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

Status: planned; spec work only, no AWS. Rewrites and adds delivery controls for the
decisions of 2026-10-10. Drafted as a patch and frozen by Dustin, like SPEC-08.
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

### CI-02 — Delivery pipeline as a by-product

Status: planned. Done when every `@awaiting:CI-02` tag is removed at a freeze. That
includes CTL-025, which needs the agent's own GitHub identity: a separate account or app
with write access, not an admin, not a `prod` reviewer, and listed in
`root-of-trust.json` → `agentIdentities`. Agent sessions use its credentials, never
the maintainer's. Thin workflows (A-21): Dustin owns the small `.github/workflows/delivery-*.yml` files,
which grant privileges; an agent builds the `scripts/ci/` and `infra/` scripts they call,
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
(it's a portable package), plus lessons in the `docs/talk-notes.md` format: the AWS
Organizations and SCP learning, ephemeral environments under a fixed budget, and the
moved root of trust.

## Open follow-ups on completed work

- **GUARD-01 remote:** configure and verify the GitHub branch ruleset (PR required,
  guard check required, code-owner review) and confirm the CODEOWNERS username.
- **SPEC-03 coverage:** ENG-02's observability rule audit (2026-10-05, see
  `docs/engineering-reviews/eng-02-observability-audit.md`) reviewed privacy,
  exporter failure/lifecycle, eligibility tracing, and the broader
  fault/concurrency OBS rules against the actual code (not just "untested").
  Most are followed by construction; two concrete gaps remain, not yet fixed:
  - **OBS-008 production exporter-crash risk:** a dependency/collector
    failure during span export can surface as an uncaught exception that
    crashes the whole service; the only existing mitigation is scoped to
    `PETCLINIC_TEST_ENDPOINTS=enabled` (test harness only — see
    `services/platform/runtime.js:117-133`). Needs a real fix before this is
    called production-ready telemetry.
  - ~~OBS-046/047/048 had no dedicated test.~~ **Closed 2026-10-05**
    (`d8db757` red, `5e6f51d` green).
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

Status: **superseded 2026-10-10 by [SPEC-08](#spec-08--delivery-as-an-executable-specification)
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

Status: deferred until after CI/CD-to-cloud ([CI-01](#ci-01--wire-sec-01s-security-gates-into-cicd-on-push-to-main))
and data persistence, which closes the
[post-November learning sequence](docs/post-november-learning-plan.md).
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

### ARCH-05 — Evaluate Docker Compose isolation

Status: **decided 2026-10-10 (A-17): containers everywhere, Compose locally.** The work
moves to [ENV-01](#env-01--local-environment-as-a-by-product). Original note: evaluate Compose for the services,
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
is captured; ENG-02 passes; known in-memory limitations are documented.
Documentation of a proposed feature or an intentionally failing baseline does not
mean that feature is complete.
