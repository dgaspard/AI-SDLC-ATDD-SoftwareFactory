# SPEC-08 design: delivery as an executable specification

Status: **frozen in [spec/delivery/](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/spec/delivery/README.md) (2026-10-10).** The follow-up
(`@awaiting` tags, and CTL-025 rewritten around a separate agent identity) is frozen too
(PR #1–#2): see "Decided after the freeze" below. No AWS spend and no delivery code until after 2026-11-13. Backlog:
[SPEC-08](../history/backlog-completed.md#spec-08--delivery-as-an-executable-specification).

## Purpose and scope

Apply this repository's method to delivery: CI/CD and three environments (local, cloud
non-prod, cloud prod). Requirements are frozen, executable and human-owned. Delivery code
is a by-product an agent builds and can rebuild. Evidence is a by-product of delivery,
not a separate paperwork exercise. The pillars are security, observability, governance,
telemetry, performance, compliance and cost, as they apply in enterprise and government
settings.

The goal is to understand and improve the developer and agent experience, **not** to
reach the cloud quickly. A requirement belongs in a scenario a fresh agent can run,
not in prose it has to interpret.

Non-goals for now: persistence (DATA-01 stays last), real payments, network hardening
(deferred; see `PROJECT-PLAN.md`), GovCloud and a real authorization to operate.

## Summary

| Need | Mechanism | Enforced by |
| --- | --- | --- |
| Delivery requirements agents can't misread | One Gherkin scenario per control, tagged `@CTL-NNN @nist: @ssdf: @env: @tier: @pillar:` | `spec/delivery` suite; guard freezes it |
| Delivery code that can be thrown away | Delivery contract DC-001..DC-007 fixes only names and entry points; the CloudFormation template is the contract, not the CDK code | Template tier asserts the synthesized JSON |
| Fast agent feedback without the cloud | `static` and `template` tiers run offline; `live` runs only in CI | Cucumber profiles; A-13 placement |
| Humans know what runs where | `catalog.yaml` renders `docs/delivery/environments.md` (Local / Non-prod / Prod, with defaults for new work) | Catalog scenarios: tags ↔ catalog ↔ rendered guide must agree |
| Agents can't approve their own work | Small human-owned root of trust; prod needs a GitHub Environment reviewer; AI provenance attestation | CTL-020..023 |
| Stay under $25/month | Ephemeral environments, no NAT gateway, budget alarm | CTL-040..043 |

## Decisions (2026-10-10)

Recorded as A-16..A-20 in [docs/decisions/architecture.md](../decisions/architecture.md).

1. **A-16 Compliance anchor:** NIST SP 800-53 Rev 5 Moderate and NIST SP 800-218 (SSDF),
   as scenario tags. Mapping is at the base-control level (`IA-5`, not `IA-5(7)`), since
   parentheses don't survive Cucumber tag expressions.
2. **A-17 Runtime:** ECS on Fargate, containers in every environment, Docker Compose
   locally. Resolves ARCH-05.
3. **A-18 AWS-native infrastructure as a by-product:** AWS CDK synthesized to
   CloudFormation, with CloudFormation Guard policies. Supersedes "Terraform on AWS"
   (2026-10-04). The synthesized template is the contract, which mirrors A-02's
   language-neutral runtime contract: an agent may rebuild `infra/` in CDK-JS, CDK-Python
   or plain CloudFormation without a spec change.
4. **A-19 Location:** `spec/delivery/`, inside the existing protected tree, with its
   **own `package.json` and lockfile** for portability. No imports from `spec/harness`.
5. **A-20 Root of trust:** today all of `.github/` is protected. Delivery workflows must
   be agent-writable, so the protected set narrows to `guard.yml`, `CODEOWNERS` and
   `spec/delivery/` (`root-of-trust.json`). Delivery workflows follow DC-006
   (`delivery-*.yml`). CI's own run of the suite is authoritative.

Also decided:

- ~~Do test endpoints exist in non-prod, and behind what boundary?~~ **Decided 2026-10-10:
  yes, with no special boundary.** This is a test application with no data. Network
  hardening is deferred ([BACKLOG.md § Network hardening](../../BACKLOG.md#network-hardening)). Prod keeps them off (CTL-033).
- ~~AWS account structure?~~ **Decided 2026-10-10: AWS Organizations with SCPs.** The
  management account holds the organization, SCPs, billing and budgets. Non-prod and
  prod are member accounts. This is new ground, so it is a learning item: SCPs are
  by-product code checked by CTL-050..052.
- ~~Budget?~~ **Decided 2026-10-10: $25/month**, enforced (`@pillar:cost`).
- ~~Shared or own package?~~ **Decided 2026-10-10: own package**, for portability.
- ~~AI provenance format?~~ **Decided 2026-10-10: attestation.** A GitHub artifact
  attestation with an in-toto predicate (`contracts/ai-provenance.v1.schema.json`)
  alongside SLSA build provenance. Prod verifies both before deploying.

## The cost constraint changes the design

These are approximate us-east-1 list prices; confirm in the AWS Pricing Calculator
before building.

| Always-on item | Monthly |
| --- | ---: |
| Fargate task, 0.25 vCPU / 0.5 GB (4 services + frontend + payment fake = 6) | ~$9 each, ~$54 |
| Application Load Balancer, per environment | ~$16 |
| NAT gateway, per environment | ~$33 |
| Public IPv4 address, per address | ~$3.65 |

Always-on non-prod alone exceeds $25. Ephemeral costs roughly **$0.15 per
environment-hour**, which is about $0.04 for a 15-minute non-prod run and $0.08 for a
30-minute prod window: 6 tasks at about $0.012 each, about $0.023 for the ALB, and roughly
8 IPv4 addresses at $0.005 each. With the decided limits (15 minutes non-prod, 30 minutes prod), even
several non-prod runs a day cost a few dollars a month. Add a few dollars of fixed cost (KMS keys,
the secret, ECR storage) and it fits.

The shape this suggests is a small **long-lived base** per account (KMS key, ECR
repository, OIDC role, secret, budget) plus an **ephemeral environment stack** (VPC,
cluster, load balancer, tasks, log groups) tagged `petclinic:ttl`. The split is the
builder's choice. The spec only requires the TTL tag, no NAT gateway, the budget, and
scheduled teardown.

## Shape

See the draft [README](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/spec/delivery/README.md) for the tag vocabulary
and commands, and [contract.md](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/spec/delivery/contract.md) for DC-001..DC-008.

| Tier | Reads | Runs | Credentials |
| --- | --- | --- | --- |
| `static` | Dockerfiles, `compose.yaml`, workflows, catalog | Local loop and CI | None |
| `template` | `infra/synth` output (CloudFormation JSON) plus cfn-guard | Local loop and CI | None. Synthesis runs with every `AWS_*` variable removed |
| `live` | Deployed URLs, read-only AWS APIs, GitHub API (rulesets, environments) | CI only | OIDC role |

The first slice has 29 control scenarios (CTL-001..005, 010..014, 020..026, 030..034,
040..043, 050..052) and 4 catalog scenarios. Three of them (CTL-024..026) are live tier,
the day-one required checks. The
catalog already lists the planned practices (cloud tracing, structured logs, SLO alarms,
deployed load smoke, audit trail, branch ruleset, pre-push verify), so the
human guide shows the whole picture with every gap labelled.

## Agent instructions (AGENTS.md delta, at freeze)

- Delivery code (Dockerfiles, `compose.yaml`, `infra/`, `.github/workflows/delivery-*.yml`)
  is built to pass `spec/delivery`. It is not protected; the scenarios check it.
- Never edit `spec/delivery/`, `guard.yml` or `CODEOWNERS`. If a delivery scenario looks
  wrong, stop and explain.
- `infra/synth` must work offline. Never run `infra/deploy` or `infra/destroy`
  locally; only CI does.
- Run `npm --prefix spec/delivery test` in the fast loop; the live tier is CI's.

## Calibration (scratch fixture, 2026-10-10)

The drafts were run against a scratch fixture repository built to satisfy every
scenario. Then one defect at a time was planted. The fixture passed every static and
template scenario except the 3 cfn-guard policies, which need `cfn-guard` installed.
Every plant (27) was caught:

| Plant | Caught by |
| --- | --- |
| `permissions: write-all` | CTL-010 |
| Action pinned to a tag (`@v0`) | CTL-011 |
| `aws-access-key-id` in a workflow | CTL-012 |
| `\|\| true` after a scan; a scan script that ignores `SECURITY_GATE` | CTL-013 (both) |
| Image build without an SBOM | CTL-014 |
| `USER root`; unpinned `FROM`; `ENV PETCLINIC_TEST_ENDPOINTS` in an image | CTL-002, CTL-003, CTL-004 |
| Wrong AI provenance predicate type | CTL-021 |
| `guard.yml` stops running the delivery suite | CTL-022 |
| Prod deploy outside the `prod` environment; prod deploy without the AI attestation check | CTL-023 (both) |
| Prod container enables test endpoints | CTL-033 |
| `AUTH_TOKEN_SECRET` as a plain environment variable | CTL-034 |
| NAT gateway; $250 budget; missing TTL tag | CTL-040, 041, 042 |
| Non-prod TTL of 60 minutes; TTL written as `2h` | CTL-042 (both) |
| No `always()` teardown after the non-prod deploy; hourly sweep | CTL-043 (both) |
| Required-check job renamed in `guard.yml` | CTL-022 |
| SCP not attached; CloudTrail not denied; wrong region | CTL-050, 051, 052 |

Policy calibration verified 2026-10-10 with cfn-guard 3.2.1:
`npm run policy:test` in the draft folder passes all 12 cases, including the
planted failures for CTL-030..032. Both IAM rules assert that statements exist
before filtering Allow statements, so valid Deny-only policies pass rather than
skip. Test expectations are unchanged.

## Baseline on this repository (expected red)

Static and template tiers against the real repository: 30 scenarios, 5 pass and 25 fail,
all for the right reason.

- **Pass:** the 4 catalog scenarios, plus CTL-010, since `guard.yml` already defaults to
  `contents: read`.
- **Missing delivery code:** Dockerfiles (CTL-001..004), `compose.yaml` (CTL-005),
  `infra/synth` (CTL-030..034, 040..042, 050..052), delivery workflows
  (CTL-012..014, 020, 021, 023, 043).
- **Root-of-trust findings that need a human edit at freeze:**
  - CTL-011: `guard.yml` uses `actions/checkout@v4`, `setup-node@v4` and
    `upload-artifact@v4`, which are tags, not commit SHAs. The rule applies to the
    human-owned workflow too.
  - CTL-022: `guard.yml` doesn't run the delivery suite yet.

No undefined steps and no tooling errors.

Live tier, run read-only against `dgaspard/AI-SDLC-ATDD-SoftwareFactory` (`gh api` GETs only):
all 3 fail, for the right reason.
- CTL-024: no ruleset requires a pull request on `main`. This confirms the GUARD-01
  remote follow-up is still open, so the "required" guard check isn't enforced by GitHub today.
- CTL-025: the `prod` GitHub environment doesn't exist.
- CTL-026: there is no prod deployment record (DC-008).

## Open questions for Dustin

1. ~~Which live-tier checks are required on day one?~~ **Decided 2026-10-10: the
   proposal.** Branch ruleset (CTL-024), prod environment reviewers with self-review
   prevented (CTL-025), and both attestations verified on every image running in prod
   (CTL-026). Drafted in `features/agent-governance/live-governance.feature`.
2. ~~How long is the prod promotion window?~~ **Decided 2026-10-10: 30 minutes.** "If
   I'm not looking at it, it doesn't need to be up."
3. ~~Region?~~ **Decided 2026-10-10: `us-east-1`.**
4. ~~TTL format?~~ **Decided 2026-10-10: minutes after creation; non-prod 15.** The
   tag holds whole minutes, capped by `catalog.yaml` → `ttl_minutes` (non-prod 15,
   prod 30). Because GitHub runs scheduled workflows at most every 5 minutes and
   on a best-effort basis, the schedule alone can't hold a 15-minute limit.
   CTL-043 therefore requires the deploying workflow to destroy non-prod in an
   `always()` step when its tests finish, with a sweep every 5 minutes as the backstop.

No open questions remain for the first slice.

## To finish

1. Dustin reviews the drafts (open questions answered 2026-10-10).
2. Done 2026-10-10: installed `cfn-guard` 3.2.1 and calibrated all 12 policy cases.
3. Done 2026-10-10: moved `docs/spec-drafts/spec-08-delivery/` to `spec/delivery/`.
   The guide remains at `docs/delivery/environments.md`; `catalog.rendered_doc` is unchanged.
4. Drafted 2026-10-10, awaiting human freeze: updated the protection boundary (A-20):
   - `spec/guard/protected-paths.json`: replace `.github/` with `.github/workflows/guard.yml`
     and `.github/CODEOWNERS`.
   - `.claude/settings.json` matches the shared file; the hook already reads it.
   - `AGENTS.md` reflects the boundary. Guard and hook regression checks cover
     protected root-of-trust files and permitted delivery workflow changes.
5. Done 2026-10-10: `main` rulesets (PR required; both checks required with no bypass;
   code-owner review in a second ruleset) and a `prod` environment with `dgaspard` as
   required reviewer. Self-review is allowed (see below). CTL-024 passes live.
6. Done 2026-10-10: in `guard.yml`, pinned every action to a commit SHA (CTL-011) and added a job named
   `Delivery spec` (CTL-022, required by CTL-024) that runs
   `npm --prefix spec/delivery ci && npm --prefix spec/delivery test` (CTL-022).
7. Done 2026-10-10: added a `delivery` suite to `spec/test-policy.json`, selected by changes to
   `services/`, `frontend/`, `infra/`, `compose.yaml`, `.github/` and `spec/delivery/`.
8. Done 2026-10-10: frozen. The delivery suite was 7/30, and the red controls blocked
   `test:verify` and the required `Delivery spec` check. That's the problem the
   follow-up below solves.
9. Done 2026-10-10 (merged in PR #1): applied the `@awaiting` and agent-identity patch, ran `npm --prefix spec/delivery run catalog:render`, add the
   `AGENTS.md` rule below, review, and `guard:freeze`. Expected: `npm --prefix spec/delivery test`
   7/7 green; `test:awaiting` reports CI-02 5, ENV-01 5, ENV-02 12, ENV-03 1 still red.
10. Done 2026-10-10 (PR #2, the `ai-sdlc-bdd-agent` GitHub App): create the agent's GitHub identity (CI-02): a separate account or app that has write
    access but isn't an admin and isn't a `prod` reviewer. List it in
    `root-of-trust.json` → `agentIdentities`, and give agent sessions its credentials
    instead of yours. Then remove `@awaiting:CI-02` from CTL-025 at a freeze.

## Decided 2026-10-10: thin workflows and continuous delivery

Recorded as A-21..A-23 in [docs/decisions/architecture.md](../decisions/architecture.md); the control changes are backlog item
SPEC-09.

**Thin workflows, thick scripts (A-21).** OIDC lets a job swap a short-lived GitHub
token for AWS credentials. Whoever writes a workflow therefore decides which jobs can
obtain credentials, and the IAM trust policy is the real boundary. Workflow YAML stays
small and human-owned, and holds only privilege: triggers, permissions, environment,
role. Agents build the scripts the YAML calls. A human edits YAML only when a privilege
changes, which is the one change that must have a human in the loop.

**Continuous delivery (A-22).** PR, then ephemeral non-prod plus the live tier, then
human approval and merge, then automatic promotion of the same images to prod. The
human gate moves from a prod-environment click to PR approval or merge. The separation of
duties is "agents never approve, merge or bypass". With one maintainer, Dustin's own PRs
merge through the admin bypass; that's a human decision, so it promotes normally and the
release record labels it a self-merge. Two consequences:
- Non-prod runs agent-written scripts from unreviewed branches. That is acceptable only
  because non-prod is an isolated account bounded by SCPs, and its role trusts only this
  repo's `nonprod` environment.
- Prod must prove it received what was tested. PRs must be up to date with `main`, and
  prod checks that the attested tree hash equals `main`'s tree.

**Release record (A-23).** Reporting and governance documentation is a by-product: each
promotion publishes who changed what, under which spec, with which tests and evidence,
and when it ran. It's a GitHub Release now, and S3 Object Lock in a log-archive account
once one exists.

## Decided after the freeze (2026-10-10)

**Controls whose delivery code isn't built yet: `@awaiting:<backlog ID>`.** Freezing
red controls into a required check stopped every merge and `test:verify`, including
the commit that froze them. Each scenario now names the backlog item that builds its
code (`ENV-01`, `CI-02`, `ENV-02`, `ENV-03`).
- Required profiles (`npm test`, the `Delivery spec` check, the live tier) exclude those
  scenarios. `npm run test:awaiting` runs them as information only and prints
  `STATE CHANGE` for any that already pass.
- Finishing a backlog item means a human removes its tags at a freeze. From then on the
  controls are required and can't regress.
- A catalog check requires every tag to name a real `### <ID> —` heading in
  `BACKLOG.md`, and at most one per scenario. The rendered guide shows
  "specified, awaiting X".
- `@pending` wasn't used because the SPEC-07 guard rejects it as a skip.
- Trade-off accepted: the tags live in frozen feature files, so finishing an item edits
  features. That edit is the explicit human decision to make the controls binding,
  which is the point.

**CTL-025: separation of duties is human versus agent, not human versus human.** With
one maintainer, prod self-review is allowed. The risk that matters is an agent acting
with the maintainer's GitHub credentials: GitHub can't tell that agent apart from the
human, so it could approve a prod deployment or merge with admin bypass. Agents
therefore work under their own GitHub identity, listed in `root-of-trust.json`. CTL-025
checks live that the identity is neither a `prod` reviewer nor a repository admin. This
works for any agent and is enforced by GitHub, not by a local hook. The identity was
created in PR #2, and CTL-025 no longer awaits CI-02.

Calibration of the follow-up:
- **Required profile:** 7/7 on this repository.
- **Awaiting report:** on the compliant fixture it reports `STATE CHANGE` for 21 of 23
  scenarios. The two still red (CTL-030 and CTL-032) are now evaluated by the
  installed cfn-guard; the fixture's minimal templates have no hardened log
  groups or tasks.
- **Bad tags:** an unknown backlog ID and a doubled `@awaiting` tag are both caught.
- **Live:** CTL-024 passes (the step now combines rules from both rulesets). CTL-025
  fails with "root-of-trust.json lists no agentIdentities".
