# Backlog: building the software factory

Task status lives here, in roadmap order. The objective, the factory's three layers and
the phase exit criteria are in [PROJECT-PLAN.md](PROJECT-PLAN.md); decisions in
[docs/decisions/architecture.md](docs/decisions/architecture.md); design notes per item
in [docs/design/](docs/README.md#current-design-notes); where everything else goes in
[docs/README.md](docs/README.md). Follow [the development workflow](docs/development-workflow.md)
for every item. Finished items keep their full history in
[docs/history/backlog-completed.md](docs/history/backlog-completed.md).

## Working rules

- Specify contracts, observability rules, delivery controls and BDD features before
  implementation; the human reviews and freezes; then agents build against the frozen
  checks.
- No implementation is authorized merely by adding an item here. Proposals stay in
  "Proposed" until the maintainer moves them into a phase.
- The reference project keeps tag `1.0` (commit `897c9e4`) as its original baseline,
  a deterministic fake payment provider, and in-memory storage until phase 4.

## Phase 1 — Governed delivery (now)

CI/CD with local, cloud non-prod and cloud prod environments, governed the same way as
application behavior. Delivery code is an agent-built by-product of the frozen,
executable spec in `spec/delivery/`, and evidence is a by-product of delivery. Decisions
A-16..A-23. Stack: AWS CDK synthesized to CloudFormation, ECS on Fargate, AWS
Organizations with SCPs, a $25/month ceiling that makes environments ephemeral. Deploy
the whole system, but only into ephemeral environments. Items are in order; each follows
spec, red checks, build, ENG-02 review (including the docs pass), freeze.

### CI-02 — Delivery pipeline as a by-product

Status: **local slice verified 2026-10-13** (the required `Application suite` gate, CTL-029;
[design note](docs/design/ci-02-application-gate.md)). Remote enforcement verified 2026-10-13: the
`main` ruleset requires `Application suite`, CTL-024 passes live, and a deliberately failing
PR (#11) was blocked. The rest of CI-02 is planned. Done when every
`@awaiting:CI-02` tag is removed at a freeze. Thin
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

### EVID-01 — Evidence bundle

Status: **local slice built 2026-10-13**: `npm run evidence:change` writes a readable
change-evidence report and versioned JSON for the exact tree, from the runner's verifier
([design note](docs/design/evid-01-change-evidence.md)). The rest is planned. Generate the control coverage matrix and a per-run evidence bundle
from the Cucumber JSON output (CTL, NIST and SSDF tags), the run record, the image
digest, the SBOM, both attestations and the approver. Fail when a binding control has
no evidence. Per prod promotion (A-23), publish a release record: a readable summary
plus JSON for reporting. It goes to a GitHub Release with an attestation now, and to
S3 Object Lock in the log-archive account once ENV-02 exists.

### DORA-01 — Delivery metrics

Status: **local slice built 2026-10-13**: `npm run metrics:dora` calculates the five DORA
metrics (deployment frequency, change lead time, change fail rate, failed deployment
recovery time, deployment rework rate) from supplied deployment and incident events, under
frozen counting rules (calculation `dora-1`;
[design note](docs/design/dora-01-metrics.md)). Today it runs on a synthetic golden
fixture; real results are NOT YET MEASURED until ENV-03 produces prod deployments and
incidents are recorded. Later: adapters for real deployment and incident sources, baselines
and trends, rollback by redeploying the previous digest, and links from each deployment to
its change-evidence or release record.

### EXP-02 — Rebuild the delivery code from the spec

Status: planned. The DEMO-01 experiment applied to delivery. Delete the Dockerfiles,
`compose.yaml`, `infra/` and the delivery workflows, then have a fresh agent rebuild
them from `spec/delivery` until every tier passes. Optionally switch from CDK-JS to
CDK-Python. Record it with the rehearsal template: time, interventions, and spec gaps
(GAP-xx → D-xx).

### PLAY-02 — Delivery playbook from the evidence

Status: planned. A short adoption guide for `spec/delivery` in another repository (it's
a portable package): AWS Organizations and SCP setup, ephemeral environments under a
fixed budget, and the moved root of trust. Feeds the factory core (START-02).

## Phase 2 — Operate it

Production observability and cloud security on the deployed system. Candidate items
for cloud security are in "Proposed" (RUNTIME-01, AGENT-01, SUPPLY-01), and for
application health and handoff ENT-09 and ENT-12.

### OBS-P1 — Production observability

Status: planned. Cloud tracing (ADOT to X-Ray) with the OBS rules asserted against the
deployed environment, structured JSON logs, SLO alarms, and the deployed load smoke
test. All are planned catalog entries today.

## Phase 3 — The factory core

Extract a versioned factory core from this repository and prove it on a second
application ([design](docs/design/start-02-factory-core.md)).

### START-02 — Software factory: template repo, dev container and organization layer

Status: **phase 3; design proposed 2026-10-13.** The project's goal (A-25), sequenced
before durable state (A-26). Implements START-01. Architecture, packages, the
`factory.config.json` sketch and the ordered steps (one project config, packages, a core
repository, a second greenfield application) are in the
[design note](docs/design/start-02-factory-core.md). START-02 closes after the second
application passes its own gate; brownfield adapters belong to phase 4.

Not yet in the design note:
- **The dev container as the agent sandbox**, holding only the App's credentials
  (closes AGENT-01). Compose and the browser container need Docker-in-Docker or the
  host's Docker socket; Codespaces is an option.
- **Naming:** "software factory" is reportedly the US DoD term (Kessel Run, Platform One)
  for a secured, compliant pipeline under continuous authorization to operate; verify
  before quoting. Relatives: golden path or paved road (template layer), internal
  developer platform (organization layer), platform engineering (the discipline).

### START-01 — The first 15 minutes

Status: phase 3, with START-02. Idea captured 2026-10-07; not scoped.

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

Proposed extensions: ENT-11 (discovery to an executable delivery scope) in
[Proposed](#enterprise-capability-profiles-intake-2026-10-16) sketches this item's
output and exit checks, and GUIDE-01 (guided product definition, A-28) describes the full
experience START-01 would begin.

## Phase 4 — Durable state

### DATA-01 — Durable state

Status: planned for phase 4, after the factory core (A-26). Add a real database to the reference project (local, in a
container; no cloud dependency) and specify schema change over time and how agents
work with data. Open questions to settle before specifying:
- Scope: only "add a real database", or also the original broader idea (pet removal,
  historical-data preservation, archival, retrieval and reporting)?
- Does the reconstruction protocol hold when the deleted service owns a schema and real
  rows, or is reconstruction proven only for in-memory services?
- Which service goes first?

## Ongoing experiments

### EXP-01 — Measure service reconstruction

Status: ongoing. Recorded: r1, r2 and r4 (Checkout, both language directions, zero
interventions); r4 is also screen-recorded. Next: a stateful service in phase 4, and
the delivery code in EXP-02. Follow the experiment protocol and
run-record template in [PROJECT-PLAN.md](PROJECT-PLAN.md#reconstruction-experiment-protocol): at least three fresh Checkout
reconstructions with frozen expectations, no access to deleted source/history,
recorded failures, timings, interventions, and specification changes. Apply ENG-02
to each; keep code-review findings separate from behavioral results. Two-service
reconstruction and a prose-versus-executable comparison are stretch experiments.

### DEMO-04 — Reconstruct the frontend from retained design assets

Status: not scheduled; a candidate proof for the template in phase 3. In an isolated workspace, keep the protected design
instructions, CSS, fonts/license, logo, browser tests, and visual baselines plus the
backend; delete only `frontend/` application code via a reviewed manifest; exclude
prior frontend source/history and the static design preview; rebuild in vanilla
JavaScript. Require the frozen appearance tolerance, identical text/interactions,
and ENG-02. Record time, interventions, failures, and retained scaffolding.

## Proposed (not approved)

Candidates from the 2026-10-10 delivery-governance review (table below), the 2026-10-16
enterprise capability intake, and the 2026-10-16 product direction (A-28: GUIDE-01,
REVIEW-02). Per `AGENTS.md`, a proposal
isn't a requirement until Dustin moves it into an item above. "Fits under" names the
existing item each could join.

| Candidate | What | Why | Fits under |
|---|---|---|---|
| **LIVE-01** Continuous live tier | Scheduled CI job, plus one on every PR, running `test:live` with a read-only token able to read rulesets and environments | The ruleset gap went undetected until someone ran the live tier by hand | CI-02 |
| **BEH-01** Behavioral tests for delivery scripts | Run `scripts/ci/verify-promotion` and `release-record` against fixtures in the template tier, replacing text-search checks inside CTL-023/060 | A text search proves a word appears, not that the check works | SPEC-09 follow-up |
| **AGENT-01** Isolate the agent runtime | Run agents in a container or cloud sandbox holding only the App's credentials | Makes "agents never approve or merge" an enforced boundary, not a convention | CI-02 |
| **SUPPLY-01** The agent as part of the supply chain | Pin model versions; change-control agent configuration (`AGENTS.md`, hooks, skills, MCP servers); record it in AI provenance (DC-007) | The agent is now part of the toolchain | SPEC-09 / EVID-01 |
| **RUNTIME-01** Runtime compliance | AWS Config with a NIST 800-53 conformance pack, plus drift detection | Templates don't prove the running state | ENV-02 / OBS-P1 |
| **OSCAL-01** Machine-readable compliance | Export the control catalog and per-release evidence as OSCAL | Toward continuous authorization to operate | EVID-01 |
| **DEPS-01** Dependency-update policy | Bot-authored dependency PRs wait for a human under "agents never merge"; accept that or define a narrow, tested exception | An explicit decision instead of a surprise | CI-02 |
| **MQ-01** Merge queue | Replace "require branches to be up to date" once several agents open PRs in parallel | Keeps tested tree = merged tree (A-22) | Later |
| **DOCS-01** Executable docs pass | Make the mechanical half of the docs pass a check: links and repository paths resolve, files exist only in the homes `docs/README.md` allows, and finished items are out of the active backlog | Today the pass is a checklist; the repo's own pattern is to make a rule executable once it matters | CI-02 |
| **OBS-003-FULL** A span for every rejected attempt | Open the business span before schema validation, so every rejected attempt gets one (full OBS-003). Deferred 2026-10-05 in favour of dropping the unreachable `validation_error` from OBS-046/047 | Complete observability of rejections | OBS-P1 |
| **GATE-ISO-01** Isolate pull-request code from the gate | Run setup scripts and services in a separate job or container from the steps that run and verify the gate | Pull-request code in the same job can rig later steps through `$GITHUB_PATH`, `$GITHUB_ENV` or `sudo`; today human review of the diff is the defense (CI-02 design note) | CI-02 |
| **REVIEW-01** Make freezes reviewable | Small protected patches (one control per patch) and a freeze review checklist | The human freeze is the bottleneck and the main risk | Process |

Known weaknesses these address (same review): some static checks are text-search
proxies; the live tier isn't in CI; the agent boundary is a convention; the sole
maintainer self-merges; freezes of ~380-line patches are hard to review; template
checks don't prove what's running.

### Enterprise capability profiles (intake 2026-10-16)

Optional capabilities for enterprise applications built on the factory, mapped from the
12 stages of a forward-deployed-engineering checklist (Suraj Sharma's post). The post only
inspired the topics. Its suggested tools, sample sizes, timelines and ROI claims are not
adopted. Each capability is a named profile that a project enables in its factory
configuration (START-02): the core provides the enforcement, tests and evidence, and the
project provides the policy, data and integrations. PetClinic needn't use them; the
second application (START-02) is where a reusable piece is proven before it moves into
the core. No new phase. ENT-11, ENT-09 and ENT-12 extend existing items; ENT-02 extends
deferred network hardening.

Two trust boundaries stay apart: the factory's build agents (AGENT-01, SUPPLY-01) and AI
running inside a generated application (ENT-04..08, ENT-10). Credentials, approvals,
evaluation results and telemetry are never shared across them.

Every entry is **proposed**, and nothing in it has been specified or run. Each one starts
with BDD, API and data contracts, telemetry obligations and delivery controls, which the
human reviews and freezes before anything is built. Feature, API and OBS IDs are
allocated at specification time.

Suggested order: **first**, ENT-11, ENT-09 and ENT-12, small document and specification
slices on existing work. **Then an enterprise pilot on the second application**: ENT-01
and ENT-06 before any sensitive data, ENT-05 read-only, and ENT-10 before any AI feature.
**When a use case needs them**: ENT-03 then ENT-04, and ENT-07 once persistence is
decided (DATA-01). **Only with a concrete customer need and budget**: ENT-02 and ENT-08.

| Candidate | Outcome and first slice | Must hold (acceptance sketch) | Decide first | Fits under |
|---|---|---|---|---|
| **ENT-01** Enterprise identity and data authorization | Use a customer's identity provider and enforce access in services and storage; PetClinic's demo profile stays. First slice: one OIDC adapter, two organizations with distinct roles and ownership. SAML, SCIM and database RLS are later slices | Wrong issuer or audience, expired credentials and missing roles are denied; client-supplied tenant or role fields can't widen access; cross-organization reads, lists, writes and exports leak nothing; revocation within a specified delay; redacted audit of each decision. RLS, if chosen, tested through real database roles | Provider and tenancy model; immediate or bounded revocation; external IdP and persistent storage are outside the current scope | AUTH-01, START-02, DATA-01 |
| **ENT-02** Restricted-network delivery profiles | A profile contract for connected, restricted-egress and offline operation; prototype only the profile a customer needs, on the existing CDK/ECS approach | Unapproved egress is blocked, with evidence; install, start, update and rollback use only declared artifact sources; a missing artifact fails clearly with no public-download fallback; teardown and cost controls still work. Offline means offline artifacts and operation, not just private subnets | Customer boundary, approved endpoints, offline updates, budget beyond the $25/month ceiling. Kubernetes, Helm and Terraform stay unselected | [Network hardening](#network-hardening) (deferred); ENV-02/03, RUNTIME-01, PLAY-02 |
| **ENT-03** Governed ingestion and reconciliation | Source files or records become traceable, reconciled application data. First slice: one synthetic CSV or scanned source, one normalized schema, replayable ingestion, quarantine report | Reprocessing doesn't duplicate; counts and control totals reconcile or the batch is quarantined; every record keeps source, version and classification; malformed data is reported, never silently lost; low-confidence extraction goes to review; retention covers derived data | First source and consumer, storage owner, retention, acceptable extraction error. No Airflow, dbt or vector store mandated | After DATA-01; START-02 |
| **ENT-04** Permission-aware retrieval and grounded answers | Answers only from what the caller may read, with citations and an explicit no-answer. First slice: a small synthetic corpus with conflicting permissions and versioned documents | Authorization filters retrieval before content reaches the model; nothing leaks through answers, citations, counts or caches; revoked access stops within the agreed window; unsupported answers abstain; retrieved text can't authorize tools. An LLM filter is not the authorization mechanism | Corpus, revocation bound, abstention threshold, search approach | Needs ENT-01, ENT-06, ENT-10 (ENT-03 if ingesting) |
| **ENT-05** Governed tools and legacy integration | Agents get narrow, audited access to approved systems without raw credentials. First slice: read-only adapter to a simulated legacy REST/SOAP service with typed inputs, timeouts and audit; MCP only where it helps | Unknown tools, bad inputs and unauthorized operations are denied; credentials never enter prompts or logs; rate limits and timeouts bound behavior; later write tools are idempotent, scoped per operation and use ENT-07 where policy requires; tool and config versions in provenance | Build-agent tooling or runtime use case; credential broker; first system; write policy | Build agents: AGENT-01, SUPPLY-01. Runtime adapters: new |
| **ENT-06** AI data handling and guardrails | Project data rules enforced across prompts, outputs, tools, logs, traces, caches and evaluation artifacts. First slice: classified synthetic fixtures and a boundary that redacts or rejects prohibited fields and records the decision | Selected sensitive fixtures never reach a prohibited sink; a redaction failure follows a stated deny or review policy; restoring a value is allowed only for the authorized user, session and destination; no raw values in telemetry or errors; prompt injection can't change permissions. Report detector false positives and negatives; never claim complete PII protection | Block or mask; whether restoration is needed; key ownership; approved model providers. UUID masking is pseudonymization, not anonymization | SEC-01, SUPPLY-01, EVID-01 |
| **ENT-07** Durable human approval for consequential actions | AI proposes an application action; an authorized human controls whether it runs. First slice: a synthetic purchase request (pending, approved, rejected, expired, cancelled) with a basic approval page | No side effect before valid approval; approval is bound to the exact payload, version and approver authority; an edit needs a new approval; a replayed approval executes at most once; expired or rejected requests never run; restart keeps pending state; ambiguous downstream results have a recovery path and audit trail | First action, risk threshold, approver roles, persistence. Separate from A-22 PR approval: no second promotion click | DATA-01; ENT-01, ENT-05, ENT-06 |
| **ENT-08** Local model execution profile | Inference stays inside a defined customer boundary. First slice: a provider-neutral invocation contract and a fake local endpoint; hardware only after a workload is chosen | Routes only to allowed endpoints, never silently to an external provider; overload gives specified timeout or queue behavior; quality, latency, capacity and cost measured on the same task set; model, version, license and digest recorded | Workload, hardware, model, licensing, operating budget | Deferred; needs ENT-02, ENT-06, ENT-10 |
| **ENT-09** Operational health and measurable customer value | Connect technical behavior, delivery evidence and customer outcomes without claiming unmeasured savings. First slice: a versioned event and metric contract and report (workflow success, latency, model and tool usage, cost) with explicit unknowns | Each run correlates to application version and evidence IDs; sensitive payloads excluded by default; missing inputs show unknown or estimated, never zero or exact savings; tenants can't see each other's records; exporter outage doesn't crash the app (OBS-008); synthetic demonstrations are labeled. Time saved is measured against a documented baseline including review and rework | Which user outcome matters; baseline owner; collection consent. DORA stays a delivery measure, not AI ROI or individual productivity | Technical parts: OBS-P1, EVID-01; link DORA-01. Business-value metrics: new |
| **ENT-10** Application-specific AI evaluation gates | Evidence for stochastic AI behavior from project-owned datasets and reviewed rules. First slice: a versioned synthetic task set, deterministic checks plus a human-labeled rubric, a reproducible report, an optional CI gate | Report names dataset, rubric, model and config versions, sample count, per-case results and thresholds; known unsafe outputs fail deterministic checks; a missing or failed required evaluation blocks the gate, and unavailable tooling is reported separately from poor behavior; judge-versus-human agreement is visible; shadow runs have no live side effects. Held-out cases kept out of tuning | Task and owner, acceptable error, dataset permissions and retention, provider cost. No sample size or success rate taken from the post | CI-02, EVID-01, ENG-02 (distinct from deterministic BDD) |
| **ENT-11** Discovery to an executable delivery scope | Turn a vague business request into a bounded outcome, examples, constraints and a measurable pilot. First slice: facilitation guide plus agent prompt, run on one synthetic enterprise request | The output names users, process owner, current pain, baseline, desired outcome, scope in and out, systems, data class, constraints and acceptance examples; contradictions are attributed and surfaced; provisional decisions have an owner and revisit trigger; unknowns stay unknown; proposed scenarios trace to stakeholder intent | Second-application domain, stakeholder roles, pilot length. No four-week promise and no separate SOW generator | [START-01](#start-01--the-first-15-minutes); step 1 of GUIDE-01 |
| **ENT-12** Operational handoff and limited self-service | A customer operator can deploy, diagnose, recover and maintain the application without its builder. First slice: a runbook covering setup, access, telemetry, backup and restore where state exists, rollback, incidents, costs and ownership. A portal is deferred | A fresh operator deploys and rolls back the chosen profile from the guide; injected failures have usable diagnosis and recovery steps; secret rotation and offboarding are exercised where supported; admin operations are authorized and audited; prompt or config changes can't bypass review, evaluation or freeze | Target operator, support model, recovery targets, which operations deserve UI. Source is the delivery catalog; never hand-edit `docs/delivery/environments.md` | PLAY-02, START-01/02, OBS-P1 |

### GUIDE-01 — Guided product definition (proposed 2026-10-16)

Stage: proposed; not specified, nothing run. From A-28. This is the product experience:
it guides a product owner through the five definition steps in
[PROJECT-PLAN.md](PROJECT-PLAN.md#the-guided-product-experience-proposed-not-approved),
from purpose and scope to an executable plan with traceable evidence. AI drafts,
translates and flags conflicts inside each step; humans review, accept and freeze. It is
not a chat box that generates code.

How it fits existing work (no IDs change):
- **START-01** is the item that would deliver GUIDE-01's first experience in phase 3;
  its open questions (who's in the room, deliverable shape, parallel input) are
  GUIDE-01's too.
- **ENT-11** is step 1 (purpose and scope) in detail.
- **START-02:** step 5's "executable plan" is the second application's repository, gate
  and `factory.config.json`; `factory init` would start GUIDE-01's output, not replace it.
- **ENG-02 and EVID-01** supply step 5's evidence; nothing new is invented there.
- The existing D-xx decision log, OpenAPI contracts and feature files are the artifact
  formats. GUIDE-01 adds guidance and checks, not new formats.

Smallest coherent slice (specification only, no UI and no new tooling beyond a
checker): take one synthetic request for the second application through all five steps
using written guidance and agent prompts. Then add a deterministic completeness and
traceability check: every step's required sections exist, every acceptance example
links to a reviewed purpose statement and a contract, and every unknown is marked open
with an owner. Record time, interventions, and where the human had to correct the AI.

Proposed acceptance sketch: each step's output is a reviewable artifact in the
application's repository; a step can't be marked reviewed while a required section is
missing or a contradiction is open; changes to accepted artifacts go through the
existing freeze; the checker reports gaps deterministically, without AI judgment.

Decided (A-28, 2026-10-16): GUIDE-01 runs in phase 3 with START-01, not earlier
([plan](PROJECT-PLAN.md#where-the-guided-experience-fits-decided-2026-10-16-a-28)), and
it stays the simplest workflow: documents, agent prompts and deterministic checks, no
separate interface. Still to decide: the second application's domain (shared with
START-02) and who reviews each step.

### REVIEW-02 — Specialist agent review and policy-governed merge eligibility (proposed 2026-10-16)

Stage: **specifications reviewed; frozen 2026-10-16 (`a21997b`), decision
[A-29](docs/decisions/architecture.md)**; tests red. Design:
[docs/design/review-02-pr-approver.md](docs/design/review-02-pr-approver.md). Frozen:
CTL-025 and CTL-028 revised; CTL-062 (the policy never lets the approver approve the root
of trust) required and green; CTL-061 and CTL-063 `@awaiting:REVIEW-02`;
`spec/delivery/review-policy.json`; the review-facts and review-decision contracts; the
evaluator's 45 tests in the `review-policy` suite, red and outside the full tier until the
evaluator is built. Owner direction: the frozen tests, specs and deterministic gates give a
PR its value, so the approver approves on green required checks plus the policy's path
classes, and specialist reviewers are advisory.
**Nothing approves automatically yet:** the approver App doesn't exist and nothing is
built. Next action: build `tools/review-policy/evaluate.mjs` against the frozen tests,
then add the suite to the full tier at that freeze; then the facts collector, check
publisher and review workflow. Still in Proposed until the maintainer places it in a phase.

Purpose: specialist reviewers produce scoped evidence, and a protected, deterministic
policy decides whether a change is eligible. Several AI approvals agreeing don't
establish correctness. Three things stay distinct:
- a **reviewer verdict**: a specialist's result as a versioned record, which is evidence;
- a **GitHub review**: an approval in GitHub, which today only a human gives (A-22);
- **merge authority**: who may merge; today only a human.

Candidate specialist roles:
- security;
- observability and telemetry;
- engineering rules and linting (static checks for coding standards);
- governance and policy;
- product coverage, including proposed test generation;
- behavioral and contract verification.

Phased delivery, each phase needing its own approval (the design note has the detail):
1. **Shadow:** the evaluator publishes its `Review policy` verdict on every PR; nothing
   is approved. Advisory reviewers may comment, calibrated with the ENG-02 method.
2. **Approve:** the approver identity approves eligible Implementation and Documentation
   changes; a human merges. A frozen policy change can make an advisory reviewer
   required.
3. **Optional automatic merging** of eligible changes, only after a separate human
   decision that revisits A-22 again.

Future acceptance criteria:
- A versioned review-result contract records reviewer and version, policy version, exact
  revision and tree, scope, verdict, findings and evidence.
- Protected policy decides which reviews apply to a change.
- A missing, stale, malformed, failed or timed-out required review blocks eligibility.
- Blocking findings and unresolved disagreements between reviewers escalate to a human.
- A new change invalidates earlier evidence; merge-time verification covers the actual
  candidate tree.
- Implementers can't approve their own work or modify their approval machinery.
- Product reviewers propose acceptance-test changes; humans review and freeze them.
- Reviewers treat repository content as untrusted data, never as instructions or authority.
- Each reviewer has its own identity, credentials and execution boundary, with least
  privilege.
- Calibration measures missed defects, false alarms, cost and review latency.
- A human can suspend the automation and inspect every decision record.

"No change under `spec/`" is one eligibility condition, not the whole policy. Changes to
protected specifications, review policy, agent instructions (`AGENTS.md`, `CLAUDE.md`),
CI privilege boundaries, verifier or scanner configuration, identity, or other designated
high-risk areas always need human review.

Overlaps:
- **ENG-02** is the calibration method and reviewer prompt for phase 1.
- **AGENT-01 and SUPPLY-01** give each reviewer an isolated, versioned runtime and identity.
- **EVID-01** carries review results in the change-evidence report.
- **DOCS-01** would be one deterministic specialist check.
- **MQ-01** is how merge-time verification of the candidate tree would work.
- **REVIEW-01** keeps the human freeze reviewable.
- **ENT-10** shares the evaluation-calibration approach.
- **GATE-ISO-01** isolates pull-request code from the verifier.

Decide first: whether phase 1 starts before AGENT-01, and who owns the policy file.

## Open follow-ups on completed work

- **DORA-01 counting-rule questions for a `dora-2` revision (2026-10-13, low):**
  - An incident caused by a `failed-before-activation` deployment is accepted and counts in
    recovery time; reject it or exclude it.
  - "Provisional when an incident it counts is still open" applies only to recovery time
    today; say whether fail and rework rates count open incidents.
  - An unclassified (`immediateIntervention: null`) incident doesn't make recovery
    provisional.
  - Not rejected yet: an incident that failed before its deployment activated; one commit
    with different `committedAt` values; `observedTo` before `observedFrom`; a window that
    starts before observation did.
  - The calculator is looser than the input contract on unknown properties and ID length,
    and stricter on empty source strings; validate against the schema itself.
- **EVID-01 accepted risks (2026-10-13, low; revisit before production use):**
  - After an unscoped pass, a scoped failure on the same tree shows as INCOMPLETE rather
    than FAILED in `--verify --json` and the report (never COMPLETE). One-line runner fix:
    in `verifyReport`, skip only scoped passes.
  - Run records are unsigned local files: a forged record plus a log can still reach
    COMPLETE (predates EVID-01; the report states it as a limitation).
  - `execution.origin` and the CI URL are self-reported by the environment (stated in the
    report).
- **CI-02 accepted risks (2026-10-13, low for a preliminary engagement; revisit before
  production use):**
  - Pull-request code in the gate job could rig later steps through `$GITHUB_PATH`,
    `$GITHUB_ENV` or `sudo`; human review of the diff is the defense (proposed GATE-ISO-01).
  - CTL-029's swallow check bans known patterns (it misses `|| echo`, `! cmd`); requiring
    each gate step's `run` to be exactly its command would close that (protected change).
- **GUARD-01 remote:** the `main` ruleset is configured and CTL-024 passes live
  (2026-10-10). Confirm the CODEOWNERS username, then close.
- **r4 REV-001 retry double charge:** promoted from accepted risk to a required check on
  2026-10-10 (`26bf339`, deliberate). It passes on JavaScript. The next Python
  reconstruction (EXP-01) must pass it too.
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
| [DEMO-01](docs/history/backlog-completed.md#demo-01--rehearse-deletion-and-reconstruction) | Two clean rehearsals (r1, r2) accepted by A-14; r4 adds a third (screen-recorded) | `demo-01-baseline` |
| [SPEC-06](docs/history/backlog-completed.md#spec-06--close-checkout-specification-gaps-found-in-rehearsal) | Checkout gaps GAP-08..15 decided and frozen; r4 passed against the new specs | `exp-01-spec06-baseline` |
| [SPEC-07](docs/history/backlog-completed.md#spec-07--suppressing-tests-and-retiring-features-through-the-spec) | `@retired` and `@accepted-risk` tags with owner and review date; accepted-risks suite | `03b374b` |
| [SPEC-08](docs/history/backlog-completed.md#spec-08--delivery-as-an-executable-specification) | Delivery controls as tagged scenarios in `spec/delivery/`; `@awaiting` tags; agent identity (CTL-025) | PR #1–#2 |
| [ENV-01](docs/history/backlog-completed.md#env-01--local-environment-as-a-by-product) | Containers and Compose locally; browser suite in the pinned Playwright container | PR #3–#4 |
| [SPEC-09](docs/history/backlog-completed.md#spec-09--continuous-delivery-controls-a-21a-23) | Continuous delivery controls (A-21..A-23); wrapper refuses merge and approve | PR #6 |
| [ARCH-05](docs/history/backlog-completed.md#arch-05--evaluate-docker-compose-isolation) | Decided by A-17; built in ENV-01 | PR #3–#4 |
| [DEMO-03](docs/history/backlog-completed.md#demo-03--language-swap-demonstration) | r4 Python rebuild recorded | `exp-01-spec06-baseline` |
| [IMPL-01](docs/history/backlog-completed.md#impl-01--legacy-visit-cancellation-retired) | Retired by D-24 | `1.0` |

## Deferred

### MVP-02 — Clinic growth and administration

Status: deferred except the MVP-02A slice; possible 2027 workshop. Office capacity,
reassigning other veterinarians' appointments, departure policies for future
appointments and historical records, and payments allocated across multiple visits.

### Network hardening

Status: deferred (decided 2026-10-10) until a real data or exposure need appears. This
is a test application with no real data, and its non-prod environment deliberately
exposes test endpoints. The deferred work covers private subnets for tasks, AWS WAF on
the load balancer, restricted ingress, VPC endpoints instead of public egress, and a
boundary for non-prod test endpoints. Most of it also needs a NAT gateway or interface
endpoints, which the $25/month ceiling rules out (SPEC-08 cost analysis). Tracked as the
`network-hardening` catalog entry with status `deferred`. Proposed ENT-02 would extend it
to restricted-egress and offline delivery profiles once a customer needs one.

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
