# START-02 design: factory repository and independent consumers

Milestone status lives only in [BACKLOG.md](../../BACKLOG.md#start-02--software-factory-template-repo-dev-container-and-organization-layer).
Direction: [A-30](../decisions/architecture.md). This design defines ownership and
acceptance; verified capabilities and freeze evidence are recorded in BACKLOG.md.

## Repository and ownership contract

`dgaspard/AI-SDLC-ATDD-SoftwareFactory` remains the factory. PetClinic becomes an
independent consumer at the approved destination `dgaspard/ai-sdlc-petclinic`. The approved destination now exists;
never overwrite unrelated contents or rewrite shared history. The earlier unsuccessful
lookup was historical preflight, not evidence of current absence. Verify App access and
remote refs before publication; preserve existing history.

Consumers own their domain and API contracts, BDD requirements and tests, performance
requirements/workloads, application code, policies, fixtures, fakes and data. The
factory owns reusable implementation orchestration, verification mechanisms, and
evidence generation. Organizational rules remain separately adopted policy; reusable
enforcement does not confer authority to set a consumer's requirements or permissions.
Non-prod and production delivery are future factory capabilities.

## Inspected ownership and migration map

Based on tracked files at `a08fe0d866c699c99999ccaf0c6ec5fa3700a378`.
Paths below describe the pre-separation source inventory, not the post-cleanup layout or instructions to move entire directories.
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
| Update | Reviewed requirement or factory-pin change; preserve spec ownership; rerun affected/full obligations; retain recoverable checkpoint | Separated consumer runner/gate and governed-change evidence; exact current proof and limitations are recorded in BACKLOG; general lifecycle support remains unproven |
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

## Governed local update proof

The next specification is [governed-change.v1](../../spec/factory/governed-change.v1.md).
It narrows lifecycle work to an approved frozen requirement change, isolated candidate
implementation and independent full verification. Reuse consumer.mjs/core.mjs/processes.mjs;
retain existing evidence-v1 and consumer envelope meanings. File create/update/delete
permissions are explicit per task; they grant no infrastructure, data, repository or
deployment authority. The coordinator is not a general coding-agent platform.

A real runner must supply OS-enforced bounds and a separately provisioned credential
boundary. A worktree, prompt or hash check alone is not that boundary. Protocol fixtures
are explicitly simulated, and missing real runner support blocks demonstration.
PetClinic owns its D-67 API/BDD acceptance separately; factory tests remain neutral.
Review and freeze the contracts before implementation. Status is only in BACKLOG.md.


## Local model broker setup for review

This is a proposed implementation arrangement for the frozen governed-change
credential boundary, not an amendment to its authority or evidence contracts.
The review template is [broker.config.example.json](../../tools/factory/broker.config.example.json).
It is deliberately disabled and is not consumed by the coordinator. No broker start
command exists yet. Null fields are unresolved provisioning inputs, not defaults.
Canonical status and qualification evidence remain in BACKLOG.md.

Use the existing Codex CLI through a custom model provider, backed by a minimal
Responses HTTP relay outside the coding sandbox. Do not build a second agent loop
or model SDK. Official [Codex authentication guidance](https://learn.chatgpt.com/docs/auth)
supports a custom provider with an environment-supplied token; here that token would
be a per-run broker capability, never the upstream API key. [Automation guidance](https://learn.chatgpt.com/docs/non-interactive-mode)
warns that repository-controlled processes can read credentials in their environment.
Do not reuse desktop login, copy auth.json, or expose the GitHub App credential.

Proposed local layout:

- A private Docker internal network contains exactly one runner and its broker.
  No host ports are published. The runner has no other network, host mounts,
  Docker socket, cloud/Git credentials, or upstream credential mount.
- The broker additionally has an egress network. It forwards only to the fixed
  HTTPS upstream in the reviewed configuration, verifies TLS and follows no redirects.
  It is not a CONNECT, SOCKS or general HTTP proxy. The destination cannot come from
  the runner, query string, request body or headers.
- The broker root filesystem and image are immutable; all capabilities are dropped,
  privilege escalation is disabled, and it runs as an unprivileged user. The owner
  AWS identity is supplied only to the broker through an explicit approved provider.
  For a bearer-key binding only the broker retrieves the pinned Secrets Manager value;
  Kimi Converse instead signs requests using the approved AWS profile. The runner receives
  neither AWS credentials nor the upstream secret. The optional local-file adapter
  instead mounts its credential read-only outside repository and evidence roots. A compromised runner must have no route to other
  containers, host services or internet destinations. Docker internal-network
  configuration alone is not accepted as proof; probe host gateways and DNS as well.
- A trusted coordinator creates a random capability for one run, holds its binding
  outside runner-writable space and revokes it on completion, failure, interruption
  or deadline. The runner receives only that capability. Expired and cross-run
  capabilities fail before forwarding. No API-key fallback is allowed.
- The independent verifier has no model network or token. Its separate profile
  permits only the application/test facilities required by the frozen consumer.

The template proposes POST /v1/responses only, an exact owner-selected model,
store=false, no background execution, no remote built-in tools and bounded request,
response, time and output limits. Local Codex tool definitions/results may pass only
through an explicit reviewed request-field allowlist; remote MCP, hosted code,
web tools, arbitrary URLs and unknown fields fail closed. Streaming SSE is allowed
only with cumulative byte limits, timeout and cancellation on disconnect. Strip
client auth/upstream headers and inject the upstream credential inside the broker.
Do not relay upstream headers, error bodies or diagnostics that could contain secrets;
return sanitized errors. Log only the template's metadata fields. Request caps and
output-token caps bound use, but do not guarantee a dollar budget; the owner sets a
provider-side project budget independently.

Owner preparation after reviewing this arrangement:

1. The owner selected `us-east-1`, `us.moonshotai.kimi-k3` and AWS profile
   `software-factory-dev`; control-plane availability is verified below. Inference
   and full runner compatibility remain unverified. Do not paste credentials.
2. Keep non-secret owner configuration outside both repositories and output roots.
   Resolve aliases before approving its destination. The broker alone receives the
   approved identity provider; no implicit AWS credential discovery is enabled.
3. Copy the disabled template and record those identifiers. Keep enabled=false and
   image/launcher pins unset until qualified artifacts exist. Configuration is not
   live-run approval. A local credential file remains an optional adapter, subject
   to its owner/mode/alias checks, rather than the selected AWS setup.
4. Review broker implementation and its neutral offline tests, then pin both images
   and all launcher inputs immutably. The Linux runner image must contain the actual
   reviewed Codex executable; the installed macOS binary is not a Linux image pin.
5. Run broker and sandbox conformance before any live task. Only after qualification
   may the owner approve live credential use and a small model smoke test. PetClinic
   still requires its separate factory-pin upgrade, freeze/commit and external authority.

Required broker tests: unauthorized/expired/cross-run tokens; denied methods, paths,
redirects, upstream headers, model substitution and remote tools; oversize/truncated
streams; timeout/disconnect cancellation; request quota; replay after revocation;
secret canaries absent from runner environment, responses, logs and evidence; broker
failure and surviving processes. Test with a local fake upstream first, explicitly
labeling it as broker-component testing rather than real coding proof. Filesystem
write-denial audit, scoped create/delete, host-loss cleanup and the separate verifier
remain mandatory launcher conformance, not capabilities supplied by this relay.


### Credential store (“wallet”) boundary

The owner clarified that credential storage should later support local and cloud
wallets. Keep storage separate from transport: `credential-store.mjs` provides the
optional local-file adapter; that bearer-key path receives only `readSecret({signal})`.
The Kimi Converse path instead uses the explicitly approved AWS profile inside its SDK transport. The
AWS Secrets Manager adapter and pinned SDK are implemented and tested offline.
The adapter requires an explicit identity provider and immutable secret version,
and honors cancellation. No cloud resources are provisioned; the optional Secrets Manager adapter has no
secret retrieval configured. Kimi profile authentication was used for read-only model discovery.
OS-keychain support remains future work; never pass a bootstrap cloud key to the runner.

The local file is a transitional storage adapter with owner/mode/alias checks, not an
encrypted wallet. OS-keychain integration and cloud-managed encryption, rotation,
audit and access policies remain future work. Separate local, non-prod and prod store
references, workloads and identities; never copy the local credential into deployments
or let non-prod read prod secrets. The model broker is not a general application-secret
retrieval API. Application delivery credentials remain outside its scope.

`model-broker.mjs` implements a single-run relay component with an injected credential
store, bounded quotas, cancellation/revocation and sanitized metadata. Offline tests use
only a loopback fake upstream and synthetic canaries. The component accepts text and
structured local-message/tool requests plus bounded, fully buffered Responses SSE.
It validates terminal status, completed item consistency and decoded secret reflection
before relaying; it rejects hosted tools, namespaces, remote inputs and unknown request fields.
The installed macOS Codex CLI has an explicit offline two-turn compatibility probe
with web search and multi-agent features disabled. This does not establish a
qualified launcher: immutable packaging, private-network wiring and mandatory
filesystem/process/network/denial-audit conformance remain prerequisites.
The disabled setup template is design input, not a parsed deployment configuration.
There is no broker start CLI, integration into change.mjs, cloud provisioning or live
credential validation. A successful component test must never be reported as real-agent
or wallet-provider qualification.


The supported wire subset follows the official [Responses streaming reference](https://developers.openai.com/api/reference/resources/responses/streaming-events)
and the observed installed CLI request shape. Full buffering trades incremental
latency for withholding partial tool events and incomplete responses. JSON and SSE
responses must represent completed Responses objects; interrupted/truncated streams,
failed/incomplete statuses, malformed or inconsistent item events and decoded secret
canaries are rejected. Additional provider/model features require explicit validation;
unknown request fields are not silently forwarded. A neutral model name in offline probes
uses CLI fallback metadata and says nothing about a live model's availability.

The offline component builder (`tools/factory/packaging/build-local.py`) stages only
explicit pinned inputs in a new external directory and builds without network access.
Its image IDs and input hashes are packaging provenance, not authority to execute a
consumer task. The broker image defaults to offline component tests; real deployment
and launcher conformance remain separate from this packaging step.

For future container launcher integration, `container-session.mjs` supplies a separate
ownership journal: durable name/label before create, immutable container ID before
start, identity-checked recovery and shutdown confirmation before terminal process
status. It retains incomplete work and never resumes it. This is a neutral component;
its COMPLETE status is not a consumer or governed-change evidence result. The existing
fixture coordinator is unchanged. A later launcher must bind this component to trusted
authority, approved filesystem grants, independent denial audit and verifier profiles
before real execution can be enabled.

The fixed `tools/factory/audit-probe/` experiment explores independent denial capture
with a root-owned strace observer and a separate unprivileged tracee. A private audit
buffer and read-only fixture image let it distinguish silent denied attempts from a
workload's success claim. This remains qualification research: the fixed recognizer
is not an arbitrary-syscall policy engine, and the additional observer capabilities
must never be granted to coding-agent processes. Complete syscall/escape coverage,
source grants and verifier isolation remain prerequisites to launcher integration.

The tracee-side `isolation/syscall-guard.c` adds an inherited Linux arm64 seccomp
filter before workload execution. It rejects untraced clone creation, clone3 (with
ENOSYS fallback), process-observer interference, asynchronous-I/O bypass paths,
unshare/setns namespace operations and process-group escape. The probe retains an explicitly
unfiltered control to demonstrate why ordinary strace following is insufficient.
This component supplements the container boundary and must not be treated as literal
file authorization or a complete audit policy. Its installation failure is fatal;
real launcher and independent verifier qualification remain separate requirements.

### Update-only workspace confinement and verifier prerequisite

`container-session.mjs` accepts an optional `filesystem` profile with a canonical
private `root` and explicit `permissions:{create:[],update:[...],delete:[]}`. It binds
that tree read-only at `/workspace` and overlays only existing, unaliased, single-link
regular update files as writable. Nonempty source create/delete grants fail closed;
this backend does not claim general lifecycle support. The caller must supply a
coordinator-owned private staging tree, keep it stable during launch, include the
original consumer/trusted roots in `forbiddenRoots`, and validate task authority and
protected-path exclusions before requesting mounts. This low-level helper is not an
authority validator. Special files throughout the tree are rejected because a
read-only mount does not prevent connecting to a Unix socket. Scratch remains private
container tmpfs. Mount tests are explicit Docker component checks, not portable gate
or arbitrary-workload conformance. The tracee syscall guard closes inherited file
descriptors numbered 3 and above; its launcher must provide trusted stdio.

Records under `test-results/start02-verifier-profile/` include the native descriptor
regression, fixed audit controls and mount tests. At this component-baseline stage, real execution in `change.mjs`
remained disabled; current qualification and live-proof records are in BACKLOG. The original PetClinic protected browser adapter starts Docker,
mounts a writable checkout and can install dependencies at runtime. The reviewed consumer change `1e477272b3a548af46356e739ffe50dc7cc1d9d8` adds an explicit preprovisioned mode, preserving
the pinned reference image, lockfile checks, complete test command and arguments.
It performs no install and exposes no Docker socket. Its read-only image marker is
only a dispatch precondition: a trusted coordinator must additionally bind and verify
the actual immutable verifier image. The owner applied, froze and committed this adapter change;
that approval does not qualify the complete verifier profile. No application behavior or acceptance test is changed.

### AWS broker: Kimi K3 through Converse

The owner-selected local configuration is Region `us-east-1`, AWS profile
`software-factory-dev`, foundation model `moonshotai.kimi-k3` and US inference
profile **`us.moonshotai.kimi-k3`**. AWS discovery returned the profile ACTIVE and
model agreement, entitlement and Region AVAILABLE, with authorization AUTHORIZED.
These are control-plane checks, not proof of an inference invocation. US inference
can route to `us-east-1`, `us-east-2` or `us-west-2`; this is not a single-Region pin.
Non-prod/prod environments remain later work.

`aws/converse.mjs` exports `createProfileModelBroker({runId, region, profile, model,
...limits})`, which wires the pinned Bedrock Runtime SDK into `model-broker.mjs`.
Supply the exact identifiers above from the reviewed configuration. It returns the
existing broker server/token/close interface; it neither listens nor launches a
runner automatically. Authentication uses the explicitly named AWS profile via
`fromIni`, with no default/environment credential-chain fallback. Credentials stay
inside the broker process and never appear in the configuration, runner or evidence.
The profile must remain valid (including its SSO session). Invoke permission requires
`bedrock:InvokeModel` for the selected inference profile and its routed models.

`bedrock-converse.mjs` translates the bounded Responses request to Converse text
and JSON function tools. Completed output is validated before JSON or buffered SSE
is released. Truncation, filtering, invalid tool identities, forbidden parallel calls
and unsupported input fail closed. Previous-turn reasoning blocks are omitted as
required by the [Kimi K3 Converse limitations](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k3.html).
Strict function schemas, explicit reasoning/verbosity controls, document input and
custom/grammar tools are unsupported and rejected before invocation; this does **not** establish full Codex-runner compatibility.
The existing runner probe must pass against the actual adapter before live governed
work. No fake transport substitutes for that demonstration.

The disabled `broker.config.example.json` records these identifiers. Keep it disabled
until launcher qualification and immutable image bindings are complete. The SDK's
exact versions and transitive integrity hashes are in `aws/package-lock.json`.
Run `node --test tools/factory/bedrock-converse.test.mjs tools/factory/model-broker.test.mjs`
and `node --test tools/factory/aws/converse.test.mjs` for credential-free checks.
For offline packaging use `--aws --aws-cache /absolute/preprovisioned/npm-cache`;
clean `npm ci --offline --ignore-scripts` fails on an incomplete cache and excludes
stale installed files. Existing `aws-secrets.mjs` and Responses endpoint helpers
remain optional components for other bindings; Kimi Converse does not use a bearer
key or require a Secrets Manager ARN/version.

### Independent verifier baseline

The corrected independent-verifier experiment runs frozen consumer
`1e477272b3a548af46356e739ffe50dc7cc1d9d8` with its existing factory pin
`9809c120cafd0ad867be6568621fac3ef54f1780`, inside immutable image
`sha256:c02aaabd1cb99508e0848ee722214946fc18a391ec081a231683920fc2bd62b6`.
Consumer/factory files are read-only, only declared result/evidence directories are
writable, external networking is disabled and no Docker socket or AWS credentials
are present. Private scratch permits execution because frozen CI-authority tests
create a local Git shim. Dependencies for consumer and factory were installed from
local cache with lock integrity and scripts disabled before image construction.
The full gate returned exit 1 for exactly the two unimplemented D-67 scenarios
GPC-001/GPC-005 (400 instead of 409); all other required suites passed, including
browser 9/9, performance 4/4 and evidence/DORA tests. A separate permission probe
confirmed denied source, policy, Git and factory writes, aliases and descendant
writes, while allowing evidence output and loopback. Cleanup preceded hashes.
Records: `test-results/start02-independent-verifier/`. This is retained baseline and
profile evidence, not a governed candidate, real-agent demonstration, complete
consumer gate or current-factory pin upgrade. Reusable coordinator integration and
arbitrary-runner denial audit conformance remain outstanding.


### Shared verifier lifecycle component

`tools/factory/verifier-session.mjs` reuses the durable container-session lifecycle
for credential-free independent verification. Its candidate mount is read-only,
its working directory is explicitly `/workspace`, and writable output bindings must
be nonoverlapping and outside caller-supplied protected paths. Existing aliases fail
before container operations. Collection waits for owned-container cleanup, rejects
aliased/nonregular artifacts, and hashes through no-follow descriptors. Zero process
exit first records `PENDING_EVIDENCE`; validated collection records
`OUTPUTS_COLLECTED`, never a governed result. After zero exit, invalid collection records
`EVIDENCE_INVALID`; when collection fails, nonzero verification and interruption
retain their failure phases with collection status INVALID.

This is a mechanism for later coordinator integration. It does not interpret evidence-v1, authorize a real runner, or replace full conformance.
Optional envelope validation uses independently supplied authority expectations as
described below.
The frozen consumer interface remains responsible for suite selection and evidence
meaning. Trusted verification resources are now bounded and journaled, including an
explicit executable-scratch opt-in. The shared profile reproduces the frozen PetClinic
baseline without changing application implementation: only GPC-001/GPC-005 fail.
Record: `test-results/start02-shared-verifier/test-results/runs/2026-10-28T10-53-20-367Z-full.json`.


The shared `consumer-proof.mjs` validator is used by the change coordinator and by
`runVerifierSession` when an explicit `consumerEvidence` binding is supplied. The
binding contains the envelope path and expectations derived independently from trusted
consumer authority: repository/revisions, tree/configuration/trust hashes, required
suites and required evidence. Callers must derive these expectations independently, never from the envelope itself. Validation
runs after cleanup and artifact collection; stale identity, missing/failed/duplicate
suites and missing/stale/duplicate artifacts reject. A zero-exit verifier with invalid
proof records EVIDENCE_INVALID. Collection without a binding remains only collection;
neither path activates the real runner or produces governed success. The caller still
owns current-input fingerprinting, authority validation and subsequent stale checks.


### Linux CLI sandbox profile

Under the original nested sandbox, the pinned Linux CLI's neutral command roundtrip
reached the synthetic broker, but command execution failed. The default tracee filter rejects setsid/setpgid. A retained
experimental container-owned variant permits those calls, exposing a second failure:
bubblewrap cannot create a namespace. A control without the tracee filter still
reports the same bubblewrap failure under the restricted outer Docker profile.
These failed experiments are not runner qualification. Inner process-group cleanup
also reports incomplete; the owning outer container is subsequently stopped with PID
zero before host records are retained. The source filter keeps its original defaults;
an explicit container-owned variant is now available for approved offline qualification.

The exact disabled proposal is `tools/factory/runner-profile.proposal.json`.
The owner approved credential-free qualification with Codex
`--sandbox danger-full-access` inside the independently enforced container, together
with container-owned process-session cleanup. This changes which layer enforces the
coding process boundary; it is not a qualified profile or permission to run on the
host. Read-only mounts, literal grants, independent denial auditing, external network
denial and cleanup-before-validation remain mandatory. All conformance cases must
pass before real activation. A supported local Linux profile retaining the internal
CLI sandbox is the alternative. No host sysctl or privileged-container change is
implied. Live AWS configuration and PetClinic implementation remain separate later steps.

Official CLI documentation describes the sandbox modes and restricts broader access
to controlled environments:
https://learn.chatgpt.com/docs/non-interactive-mode
Diagnostic records: `test-results/start02-linux-cli-audit/`.

### Syscall-time authorization for unresolved audit targets

The frozen governed-change contract permits only task-granted source mutations and
private scratch writes, and requires reporting denied attempts even when bytes do
not change. Retained strace text does not establish syscall-time target identity:
a nominal scratch path can traverse a symlink, a relative path depends on cwd/dirfd,
and concurrent threads can replace path components. ENOENT/EEXIST alone cannot decide
whether a failed mutation was authorized. Do not whitelist `/tmp/` text or use a
post-run realpath to resolve this distinction.

Owner-approved qualification direction (approval recorded in BACKLOG.md):
replace text-only policy disposition with a bounded Linux arm64 syscall-time observer.
Keep the existing container, unprivileged coding process, immutable images, network-none
qualification, native protected audit volume, and shared shutdown lifecycle. No new
host privileges, privileged containers, host settings or live credentials are proposed.
The implementation must establish target identity while all potential sandbox path
writers are stopped, bind cwd/dirfd and mount identity, and reject unsupported syscall
forms or inability to establish a stable target. Preserve the original trace as
independent evidence. This is a feasibility requirement, not a claim that a ptrace
implementation already meets it. If the existing capabilities cannot enforce it,
return TOOLING_UNAVAILABLE and return the exact additional boundary change for review.

Dispositions are authorized private scratch, task-granted implementation mutation,
out-of-scope mutation, or unresolved.
Unresolved remains blocking. Never create a success exception merely to accommodate
CLI startup. Specifically, writable `/dev/tty` opens are not implicitly permitted;
eliminate them with a supported noninteractive configuration or separately specify
an exact policy for a failed no-terminal probe before treating it as nonblocking.

Required additional deterministic cases: scratch aliases into protected directories,
cwd/dirfd changes, relative traversal, missing protected parents, concurrent path
replacement, incomplete observer coverage, and observer interruption. Each must fail
closed before a successful qualification result. A successful baseline must still run
the actual pinned CLI; fixture success cannot replace it. This proposal does not
activate the real coordinator, authorize PetClinic implementation, or change the
frozen acceptance contract. Any contract/policy amendment is a separate exact patch
for human review and freeze.


The native qualification component implements this boundary separately from the real
coordinator. It reuses container lifecycle cleanup and artifact collection, retains
syscall-entry-linked identity records and stopped-task context, and rejects missing
coverage or stale records. Its baseline write authority is private scratch plus inherited
output channels. The separate task-session component adds literal existing-file byte
update grants and applies staged changes only after audited cleanup. Full launcher
qualification remains distinct from these component checks. See the
[component operating instructions](../../tools/factory/README.md#native-observer-component-qualification)
for reproducible offline builds and the SCT harness. Passing those component cases
must not be used as a real-runner profile, consumer trust pin or live application proof.
Canonical qualification status and remaining work are in BACKLOG.md.
