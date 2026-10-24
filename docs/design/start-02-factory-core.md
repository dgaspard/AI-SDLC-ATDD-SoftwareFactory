# START-02 design: factory repository and independent consumers

Milestone status lives only in [BACKLOG.md](../../BACKLOG.md#start-02--software-factory-template-repo-dev-container-and-organization-layer).
Direction: [A-30](../decisions/architecture.md). This design defines ownership and
acceptance; verified capabilities and freeze evidence are recorded in BACKLOG.md.

## Repository and ownership contract

`dgaspard/AI-SDLC-ATDD-SoftwareFactory` remains the factory. PetClinic becomes an
independent consumer, provisionally `dgaspard/ai-sdlc-petclinic`. On 2026-10-24 an
authenticated repository lookup could not resolve that name; this is not a reservation
or proof of absence under every identity. Recheck existence and access using the
approved GitHub App immediately before creation. If a project exists, stop creation
and choose an unused destination with the owner; never replace its contents/history.

Consumers own their domain and API contracts, BDD requirements and tests, performance
requirements/workloads, application code, policies, fixtures, fakes and data. The
factory owns reusable implementation orchestration, verification mechanisms, and
evidence generation. Organizational rules remain separately adopted policy; reusable
enforcement does not confer authority to set a consumer's requirements or permissions.
Non-prod and production delivery are future factory capabilities.

## Inspected ownership and migration map

Based on tracked files at `a08fe0d866c699c99999ccaf0c6ec5fa3700a378`.
Paths below are current source paths, not instructions to move entire directories.
“Split” means specify an interface, retain consumer semantics, then review the exact
file manifest before moving anything. Candidate reusable code is not yet proven portable.

| Actual source files | Destination owner / migration treatment | Boundary and proof needed |
|---|---|---|
| `services/customer/`, `services/reservation/`, `services/veterinarian-services/`, `services/checkout/`, `frontend/` | PetClinic, preserve relative layout | All application code, launch scripts and Dockerfiles |
| `services/platform/runtime.js` and its package files | PetClinic | Shared application runtime contains auth/domain conventions; “platform” does not make it factory code |
| `spec/contracts/` (all OpenAPI files, `auth-contract.md`, `runtime-contract.md`) | PetClinic | Domain/API/auth/runtime expectations remain consumer contracts; derive a separate generic harness interface rather than appropriating these contracts |
| `docs/specs/business-decisions.md`, `domain-model.md`, `schema-decisions.md`, `observability-traceability.md`; `docs/observability.md` | PetClinic binding rules and coverage; split reusable guidance from the last file | Preserve D/OBS IDs, decisions and coverage; no silent rewriting of clinic telemetry |
| `spec/features/`, `spec/tests/steps/`, `spec/tests/workflows/`, `spec/tests/support/`, `spec/cucumber.cjs` | PetClinic | BDD, workflow assertions, service fixtures, access cases and world bindings are application-owned |
| `spec/tests/auth/`, `spec/tests/contract/`, `spec/tests/observability/`, `spec/tests/runtime/` | PetClinic assertions | Runtime/OTel tests bind the current service list and contracts; generic assertion functions may be extracted separately |
| `spec/seed-data/`, `spec/fakes/payment/` | PetClinic | Demo data and deterministic payment behavior belong to the consumer, including fake setup/start scripts |
| `spec/frontend/`, `spec/tests/browser/` | PetClinic | Assets, baselines, journeys, viewport and browser configuration stay together; a generic container launcher can be extracted only after removing these bindings |
| `spec/features/performance/local-demo.feature`, `spec/tests/performance/local.test.js`, `gate.js`, `gate.test.js`, `README.md` | PetClinic; optional later split of measurement helpers | `gate.js` contains operation names, thresholds, worker timing and financial assertions (`assertPaid`); only parameterized timing/statistics machinery is a factory candidate |
| `spec/harness/config.js`, `auth.js`, `clinic-time.js`, `money.js`, `seed.js` | PetClinic bindings/helpers | Clinic clock, demo JWT, service URLs, contracts and seed locations are not generic defaults |
| `spec/harness/processes.js`, `free-port.sh`, `schema.js`, `stub-server.js`, `traces.js`, `show-trace.js`, `semconv.js` | Split: factory mechanisms, consumer adapters/configuration | Remove assumed repository root, contract URI base and clinic semantics; keep consumer fixtures and business-span obligations outside core |
| `spec/harness/collector/` | Factory collector candidate plus consumer launch configuration | OTLP/protobuf machinery is reusable; package name and `PETCLINIC_TEST_ENDPOINTS` in `server.js` need parameterization without changing consumer behavior |
| `spec/tests/harness/` | Split factory self-tests from consumer integration checks | `run-all.test.js`, `guard.test.js`, `protect-hook.test.js`, `collector.test.js` test mechanisms; `assertion-slices.test.js` imports PetClinic service/access/business fixtures and stays consumer-owned; inspect `semconv.test.js` and `stub-faults.test.js` fixtures before extraction; neutral synthetic fixtures may be factory-owned |
| `spec/run-all.js` | Factory runner candidate | Explicit consumer root, policy and output paths; verification must cover both consumer tree and factory commit |
| `spec/test-policy.json`, `spec/package.json`, `spec/package-lock.json`, root `package.json`, `eslint.config.mjs` | Split | Consumer suite selection, commands and app dependencies stay consumer-owned; factory schema/runner and its dependencies remain factory-owned; split lockfiles deliberately |
| `spec/guard/guard.js`, `check.js`, `freeze.js`, `accepted-risks.js`, `accepted-risks.cucumber.cjs` | Factory guard/accepted-risk mechanism candidates | Preserve human-only freeze and consumer risk semantics; no core default may activate, retire or waive consumer tests |
| `spec/guard/protected-paths.json`, `spec/protected.sha256`, `.claude/settings.json`, `.claude/hooks/protect-paths.mjs`, `.github/CODEOWNERS`, `.github/workflows/guard.yml`, `AGENTS.md`, `CLAUDE.md` | Split mechanisms/templates from independently owned per-repository controls | Neither frozen manifests nor App installations/rulesets can simply be copied as authority. Each repository needs human review/freeze; hooks and required checks must protect the actual new paths |
| `spec/delivery/catalog.yaml`, `root-of-trust.json`, `review-policy.json`, `contract.md` | Consumer/organization adoption and policy; split generic interface definitions | Current repository identity, App installation, budgets, service catalog and approval classes are bindings, not universal factory policy |
| `spec/delivery/features/`, `steps/`, `policy/`, `tools/`, package files | Split reusable checks from consumer adoption | Infrastructure/local feature steps name `PETCLINIC_TEST_ENDPOINTS`; cost features name `petclinic:ttl`. Parameterize without weakening controls. CloudFormation policy mechanisms may stay factory-owned; adoption/thresholds are consumer/organization-owned |
| `tools/evidence/change-evidence.mjs`, `spec/tests/evidence/change-evidence.test.js`, `spec/delivery/contracts/change-evidence.v1.schema.json` | Factory evidence mechanism/contract/self-tests | Preserve v1 meaning; define explicit compatible extension or new version for dual-repository identity |
| `tools/dora/dora-metrics.mjs`, `spec/tests/dora/` including `fixtures/golden.json`, `spec/delivery/dora.md`, `spec/delivery/contracts/dora-*.schema.json` | Factory counting rules, self-tests and synthetic fixture | Real deployment/incident events stay consumer-owned; synthetic goldens are not application data or real metrics |
| `spec/delivery/contracts/ai-provenance.v1.schema.json`, `release-record.v1.schema.json`, `review-facts.v1.schema.json`, `review-decision.v1.schema.json`; `spec/tests/review-policy/` | Factory contract/evaluator-test candidates; split repository-specific fixtures | Retain IDs and schema meaning; evaluator tests are not proof of an implemented approver; do not activate approval |
| `tools/review/portable/`, `tools/security/portable/`, `tools/review/review-prompt.md` | Factory mechanisms; inspect prompt for consumer references | Parameterize consumer rules; scanner fixtures testing generic rules may stay factory-owned |
| `tools/review/project-specific/`, `tools/security/project-specific/`, `tools/security/run-sec01-spike.sh`, `tools/security/calibration-defects.md` | PetClinic | CORS/import policy, threat model, auth notes and planted domain defects stay with application; split generic calibration guidance only |
| `tools/github/agent.mjs`, `tools/github/README.md` | Factory identity mechanism, per-repository App configuration | Consumer installation/permissions are explicit; no fallback to personal identity |
| `tools/demo/`, `tools/capture-payment-trace.mjs`, `tools/compose-smoke.mjs`, `compose.yaml` | PetClinic experiment/orchestration bindings | Checkout deletion prompts and clinic smoke journeys are not generic lifecycle implementations |
| `docker/spec-tools/Dockerfile`, `.dockerignore`, `.gitignore` | Split reusable tool image from each repository's paths | Preserve reproducible tooling and prevent consumer artifacts leaking into factory build context |
| `docs/rehearsals/`, `docs/engineering-reviews/`, `docs/handoffs/`, `docs/history/` | Retain historical records in factory with source provenance; consumer links to relevant records | Do not rewrite evidence as if generated after the split. Preserve original repository/tag/commit references including `1.0` (`897c9e4`) |
| `BACKLOG.md`, `PROJECT-PLAN.md`, `docs/README.md`, `docs/development-workflow.md`, `docs/decisions/architecture.md`, `docs/design/`, root `README.md` | Factory canonical direction/history; separate consumer operating documentation | Move future PetClinic-only work tracking to consumer with ID/provenance links; do not duplicate current milestone status |
| `docs/delivery/environments.md` | Consumer generated catalog view | Regenerate from reviewed consumer catalog later; do not hand-edit generated output |

## Consumer-contract specification

The versioned boundary is specified in
[consumer-contract.v1.md](../../spec/factory/consumer-contract.v1.md), with behavioral
checks in [consumer-boundary.test.js](../../spec/tests/factory/consumer-boundary.test.js).
This replaces the earlier interface sketch. One config contains the immutable Git pin;
a separate lock file is unnecessary in v1. The trusted human/CI policy binds that pin
and config hash independently. The config schema is a closed vocabulary specified in
the contract; its implementation entry point is `tools/factory/consumer.mjs`.
Implementation presence alone does not establish PetClinic adoption or verification.

Compatibility choices for review: interface/schema v1; factory version is the full Git
SHA; a separate evidence envelope preserves change-evidence.v1 semantics; explicit
consumer-root path resolution; runtime dependency cycles separate from startup groups;
Node tooling does not constrain consumer implementation languages. PetClinic runtime,
performance, auth and assertions remain consumer-owned and unchanged.

Initial consumption uses a separate checkout fetched from the factory repository at
the locked SHA and passed explicitly to a thin consumer entry point. Verify the fetched
HEAD matches the lock and install from that revision's lockfiles. This avoids a package
registry and makes clean-checkout proof possible. Proposed upgrade flow: change the
pin in a reviewed consumer change, inspect upstream changes and compatibility, freeze
any changed expectations, then rerun its gate. Never update pins automatically at run
time. Hosted reusable workflows and organization rulesets are later work, not needed
for local proof.

## Ordered milestones and acceptance

These are START-02 slices, not new canonical backlog IDs. Status is only in BACKLOG.

1. **Consumer-contract specification.** Review this boundary and draft schema/runtime,
   evidence and protection contracts. Freeze exact protected edits before build work.
2. **Local extraction.** Establish the pre-move gate baseline after freeze. Extract only
   mechanisms in the table, using consumer bindings. Preserve assertions, fixtures,
   risk tags and expected performance outcomes. Run factory self-tests and PetClinic's
   full gate; record before/after evidence and scan for residual domain coupling.
   Domain-free text alone does not prove reuse or independence.
3. **Repository separation and immutable consumption.** Recheck destination, establish
   independent ownership/access, export consumer files with an exact source manifest
   and provenance, retain the factory repository/history and baseline tag. Review both
   roots of trust. From clean independent checkouts prove the pinned factory can run the
   consumer without undeclared source paths; test missing/wrong SHA and changed-pin
   evidence invalidation. No application source/test imports into factory mechanisms.
4. **Lifecycle specification.** Define create/update/delete/deploy operations below,
   retention and failure semantics, human boundaries and evidence before implementation.
5. **Local lifecycle proof.** Use disposable copies and synthetic data. Create the local
   implementation from retained consumer specs, apply one reviewed consumer change,
   delete/rebuild one explicitly selected implementation slice, and verify all retained
   hashes and required gates. Exercise invalid path/manifest refusal and failed-update
   recovery. Capture commands, inputs, both identities, logs, interventions and limits.
   No cloud or remote delivery proof is implied.
6. **Later reuse validation.** A second domain supplies its own requirements and passes
   its own gate. Record every forced core change; this, not the PetClinic split alone,
   establishes the first cross-domain reuse evidence. START-01/dev container and
   organization-wide adoption remain later work; DATA-01/brownfield adapters follow.

## Lifecycle vision versus existing evidence

| Operation | Intended contract to specify | Evidence currently available / limitation |
|---|---|---|
| Create | Build in a new explicit local workspace from frozen consumer inputs; refuse occupied destination; retain original inputs | Existing application builds and launch scripts; no general `factory init` or independent-consumer create proof |
| Update | Reviewed requirement or factory-pin change; preserve spec ownership; rerun affected/full obligations; retain recoverable checkpoint | Current runner/gate and change-evidence tooling in a co-located tree; no cross-repository update proof |
| Delete/rebuild | Explicit allowlisted disposable implementation manifest, dry-run, path containment, retained-spec/data hashes, recovery copy; refuse repository root, specs and data | Checkout rehearsal scripts and historical r1/r2/r4; not a general safe-delete API, nor permission to run deletion now |
| Deploy | Eventually build immutable artifacts and prove non-prod/prod promotion, rollback, approvals and release evidence | Local Compose/application gate history; cloud delivery controls include awaiting work. A-22/A-29 are designs, not authorization or proof of deploy/automatic approval |

Use the exact-tree records referenced by BACKLOG for actual commands and results;
cloud operation, approval automation, merge and deletion remain outside this phase. Local proof never licenses production data
deletion; durable-data lifecycle belongs to DATA-01 and separate explicit decisions.

## Human review and freeze boundaries

**Architecture/document review set:** `BACKLOG.md`, `PROJECT-PLAN.md`,
`docs/decisions/architecture.md`, `docs/design/start-02-factory-core.md`,
`docs/README.md`, `docs/development-workflow.md`.
**Protected instruction review and human freeze:** `AGENTS.md`, `CLAUDE.md`.
The human freeze owns updates to `spec/protected.sha256`; agents must not update
that manifest themselves. See BACKLOG.md for the recorded freeze.

**Additional extraction — separate exact review/freeze beyond the runner seam:** all
moved/changed files under `spec/` and `docs/specs/` enumerated in the map; specifically
`spec/guard/protected-paths.json`, `spec/test-policy.json`,
`spec/delivery/root-of-trust.json`, `spec/delivery/review-policy.json`,
`spec/delivery/catalog.yaml`, runtime/contracts and their tests. Also each repository's
`AGENTS.md`, `CLAUDE.md`, `.claude/settings.json`, `.claude/hooks/protect-paths.mjs`,
`.github/CODEOWNERS`, `.github/workflows/guard.yml` and `spec/protected.sha256`.
Produce exact per-file source/destination manifests in the consumer-contract slice;
this table is not a blanket freeze approval. Human review also covers factory portable
security/review machinery and any changes to App installations, rulesets or privileges.
No existing protection is weakened to make moves convenient.

## Decisions and remaining review boundaries

Shared Git history remains in the factory. PetClinic starts with a clean import that
records the source repository and exact migration commit. Its visibility, reviewers
and App access belong to repository separation. Preserve the original `1.0` tag.
The frozen consumer contract specifies immutable Git consumption, unchanged runtime
and performance semantics, and a separate evidence envelope preserving evidence-v1.
Changes to that contract require separate human review/freeze.

Exact harness, policy, evidence and configuration adoption patches still need review;
the inventory is not a blanket move authorization. Local create/update examples and
bounded deletion/recovery semantics belong to lifecycle specification, apart from
recovery needed to protect extraction. Cloud and automatic approval activation are
not authorized follow-ons. Registry selection and second-domain reuse remain later.

## Consumer-interface milestone: exact review and baseline transition

The initial consumer-interface review/freeze set is:

- `spec/factory/consumer-contract.v1.md`
- `spec/factory/extraction-inventory.csv`
- `spec/tests/factory/consumer-boundary.test.js`

Review the accompanying changes to `BACKLOG.md`, this design, `docs/README.md` and
`docs/development-workflow.md`. Include the prior milestone's `AGENTS.md` and `CLAUDE.md` changes in human
review/freeze, with its other six documentation files reviewed. Verify the actual
manifest rather than inferring a freeze from a specification commit.

The inventory lists every existing tracked protected file with its source SHA256 and
consumer destination or explicit split disposition. It is an audit input, not an
executable migration manifest. New factory interface/test files stay factory-owned.
Rows marked split-review-required cannot authorize wholesale moves: the extraction
implementation must present the exact new factory path and retained consumer binding
for each row before its move is approved. Until then retain the original protected file.

Standing human baseline-transition procedure:

1. Accept or amend the interface, tests, inventory and prior instruction drafts. Review
   the recorded initial 14-case missing-command baseline and subsequent behavioral
   results; do not delete/skip checks to obtain green.
2. Human runs the existing `npm --prefix spec run guard:freeze` when satisfied and
   reviews `spec/protected.sha256` for precisely the accepted additions/changes.
   Commit the reviewed specifications and baseline together. A freeze alone does not
   establish extraction or START-02 completion.
3. Before future extraction, record a clean pre-move gate and exact source hashes.
   For each inventory row approve preserve/move/split destinations. Both repositories
   need independent protected-path lists, manifests, agent instructions, CODEOWNERS,
   guard workflows, trusted policy snapshots and verified required checks. Include
   consumer config/pin and trust source in its protected set. Do not copy an App
   installation ID/ruleset as if it were valid in the new repository.
4. Establish the consumer baseline from reviewed retained inputs, compare their hashes
   to the source manifest, and run unchanged consumer assertions against the pinned
   factory only after implementation. Factory self-test definitions remain protected.
   Freeze the factory removals only after the destination protections and hash mapping
   are reviewed; never turn off guard to get through an intermediate move.
5. Review both baseline diffs and both gate records. Changing factory pin cannot rewrite
   consumer policy, assertions or freeze manifest. Require a separate reviewed consumer
   adoption change; preserve original tags/history and before/after evidence.

The exact future split destinations and operational pin depend on the extracted code;
this phase specifies their review gate, not fabricated implementation paths or SHAs.

## First protected seam: PetClinic compatibility adapter

This exact seam has its own owner-approved patch and human freeze, recorded in
BACKLOG.md. The initial interface freeze alone did not authorize the split:

| Existing protected path | Exact retained binding / new factory destination |
|---|---|
| `spec/run-all.js` | Replace executable runner body with a thin PetClinic adapter importing public `runLegacy` from `tools/factory/index.mjs`. Pass application root, suite root, policy path, results path, service IDs, invocation text, argv and `treeEnvironmentVariable: "PETCLINIC_TREE"` explicitly. Keep existing CLI flags and v1 records; do not alias legacy evidence to the new envelope. |
| `spec/tests/harness/run-all.test.js` | In its isolated-fixture setup, copy `tools/factory/` alongside the existing runner/config/policy fixture. Preserve every test assertion and failure probe. |

The public compatibility entry point is `tools/factory/index.mjs`; the
parameterized runner is `tools/factory/legacy-runner.mjs`. Preserve the algorithm, including cache failure
revocation, selection, logs and accepted-risk state reporting; parameterize paths,
project IDs and environment binding rather than renaming PetClinic assumptions.
Derive v1 policy/log/cwd record paths relative to the supplied application root.
The new consumer command is a distinct public interface, not permission to change
legacy verification semantics. Copying the package in the test fixture does not prove
independent repository consumption. Track adapter removal in BACKLOG.md.

Any further change to this protected seam requires another reviewed patch and human
freeze. The public implementation accompanies the adapter; a protected adapter alone
is not a runnable migration.
Harness, guard and evidence splits require their own exact proposals; this first
slice does not authorize them or a bulk `spec/` move.

## Migration application order

The final consumer pin depends on a human-frozen factory commit. Prepare the shared
mechanisms additively while retaining the working application; review and freeze
that exact patch, verify its full application gate, and commit the reviewed factory
release. The consumer pin must use that actual commit, never a predicted SHA or
floating reference. This preparatory release may still contain the old active
application until the consumer has passed its independent gate.

Next, review the exact consumer import manifest, application adapters and independent
trust controls against the reviewed migration commit. The new consumer contains thin
factory calls, not copied factory implementations. Freeze and commit its reviewed
inputs, materialize external trust from that explicit commit, and prove clean install,
full gate, failure propagation and both evidence identities. Only after that proof
and a recoverable checkpoint may the separately reviewed factory-removal patch be
applied and human-frozen. Source history and tags remain intact throughout.

The additive guard extraction keeps configuration in each repository and shares
only the implementation. Its human-only freeze entry point must remain blocked by
the agent hook, including the extracted `.mjs` module; test command strings against
the hook without executing freeze. Reviewable patch/results and current status live
in [BACKLOG.md](../../BACKLOG.md), not in this design.
