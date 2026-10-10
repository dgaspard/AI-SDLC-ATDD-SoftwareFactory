# Recap: governed delivery (2026-10-10)

Status: **notes, not decisions.** Built in one session: SPEC-08, CI-02 (agent identity),
ENV-01 and SPEC-09, merged in PRs #1–#6. Part 1 holds **candidate** backlog items; per
AGENTS.md, proposed items aren't approved requirements until Dustin moves them into
`BACKLOG.md`. Part 2 holds talking points, including draft lessons in the
`docs/talk-notes.md` format, ready to copy across.

## What happened

The repo's idea is that a human owns a small, frozen, executable definition of
"correct". Agents build everything else as a replaceable by-product, evidence falls
out of the process, and human judgment sits at a few deliberate points. This session
extended that from application behavior to delivery: images, pipeline, cloud,
governance.

| Step | Result |
|---|---|
| SPEC-08 | Delivery controls as Gherkin scenarios tagged `@CTL-NNN @nist: @ssdf: @env: @tier: @pillar:`. A catalog renders `docs/delivery/environments.md` (Local / Non-prod / Prod), and checks keep the catalog, the scenarios and the guide in sync. |
| `@awaiting` tags | Freezing red controls into a required check blocked every merge. Fix: tag each with the backlog item that builds it. It's informational until a human removes the tag. |
| CI-02 (part) | `ai-sdlc-bdd-agent` GitHub App: agents push and open PRs under their own identity. CTL-025 checks it can't approve, bypass or deploy. |
| ENV-01 | Docker images, `compose.yaml`, and the browser suite in a pinned Playwright container. Mac baselines had differed from Linux CI by about 1% of pixels; the container renders identically on both. |
| A-21..A-23 | Thin workflows (YAML holds privilege, scripts hold logic). Continuous delivery (PR, non-prod, human approval, automatic prod). A release record for each promotion. |
| SPEC-09 | Seven controls for those decisions (CTL-015, -023, -025, -027, -028, -035, -060). The App wrapper refuses merge, approve and push-to-main. |

The checks repeatedly caught their own authors. An unquoted YAML comma twice
truncated catalog text. A merge-key bug hid an environment variable. The "required"
guard check wasn't actually enforced by GitHub, because no ruleset existed. `prod`
accepted deployments from any branch. Every control was calibrated with planted defects:
22, then 27, then 19 more, all caught.

## Assessment

**Mostly established practice.** OIDC instead of stored keys, actions pinned by SHA,
least-privilege tokens, SBOM, SLSA provenance, rulesets and CODEOWNERS, policy checks on
templates, non-root pinned images, SCPs, budgets and ephemeral environments are
expected in mature enterprise and government delivery (OpenSSF Scorecard, SLSA, NIST
SSDF, NIST 800-53).

**Emerging, specific to AI.** Agents under their own identity, agents unable to approve
or merge, AI provenance attestations, agent-proof tests and specs, and human review as
the gate on agent-authored changes. These are widely discussed but inconsistently
implemented. Check current guidance before quoting what's "expected in 2026".

**Unusual or new here:**
1. **Compliance as executable behavior.** Controls are BDD scenarios tagged with NIST
   and SSDF IDs, and the human-readable catalog is generated and drift-checked.
   Compliance-as-code exists (OPA, InSpec, OSCAL); tying it to BDD, an agent build loop
   and a human freeze is uncommon.
2. **Infrastructure as a rebuildable by-product.** The contract is the synthesized
   CloudFormation, not the CDK code, so "delete it and rebuild from the spec" (EXP-02)
   tests the process, not only the code.
3. **The `@awaiting` tags.** Requirements are specified ahead of the code and bound to a
   backlog item. They're promoted to required only by a human, and can't regress after.
4. **Privilege separated from logic by who owns the file.** Thin workflows, motivated by
   agents: agents change logic, and only humans change privilege.
5. **Calibrating the governance checks themselves.** Planted defects prove each control
   catches what it claims.

**Weaker than it looks:**
- Some static checks are text-search proxies. They prove that `^{tree}` or `merged_by`
  appears in a script, not that the check works; an agent could satisfy them with a
  comment.
- The live tier isn't in CI. Today's ruleset gap was found only because someone ran it
  by hand.
- The agent boundary is a convention. The session still holds the maintainer's GitHub
  login, and the wrapper isn't an OS-level boundary.
- There's no two-person review: the sole maintainer self-merges through admin bypass.
  Fine for learning, not for an enterprise.
- Reviewer load: the agent wrote most of the spec, and the human froze ~380-line
  patches. The freeze is the bottleneck and the risk point.
- Template checks don't prove what's actually running; there's no drift detection yet.

## Part 1 — Candidate backlog items

Candidate IDs are suggestions. "Fits under" names the existing item each could join
instead of becoming a new one.

| Candidate | What | Why | Fits under |
|---|---|---|---|
| **LIVE-01** Continuous live tier | Scheduled CI job, plus one on every PR, running `test:live` with a read-only token able to read rulesets and environments | Today's ruleset gap went undetected until someone ran it by hand. Detection should be automatic. | CI-02 |
| **BEH-01** Behavioral tests for delivery scripts | Run `scripts/ci/verify-promotion` and `release-record` against fixtures in the template tier, replacing the text-search checks inside CTL-023/060 | A proxy proves a word appears, not that the check works | SPEC-09 follow-up |
| **AGENT-01** Isolate the agent runtime | Run agents in a container or cloud sandbox holding only the App's credentials, with no maintainer keychain or token | Makes "agents never approve or merge" an enforced boundary rather than a convention | CI-02 |
| **SUPPLY-01** The agent as part of the supply chain | Pin model versions. Treat agent configuration (`AGENTS.md`, hooks, skills, MCP servers) as change-controlled. Record it in AI provenance (DC-007) | SSDF treats the toolchain as part of the supply chain; the agent is now part of the toolchain | SPEC-09 / EVID-01 |
| **RUNTIME-01** Runtime compliance | AWS Config with a NIST 800-53 conformance pack, plus drift detection, alongside the template checks | Templates don't prove the running state | ENV-02 / OBS-P1 |
| **DORA-01** Delivery metrics from release records | Lead time, deployment frequency, change failure rate. Rollback by redeploying the previous image digest; canary releases once prod is no longer ephemeral | The metrics fall out of evidence already produced | EVID-01 / ENV-03 |
| **OSCAL-01** Machine-readable compliance | Export the control catalog and per-release evidence as OSCAL | Toward continuous authorization to operate | EVID-01, after SUPPLY-01 |
| **DEPS-01** Dependency-update policy | Renovate or Dependabot PRs are bot-authored. Under "agents never merge", every bump waits for a human. Accept that, or define a narrow, tested exception | An explicit decision instead of a surprise | CI-02 |
| **MQ-01** Merge queue | Replace "require branches to be up to date" with a GitHub merge queue once several agents open PRs in parallel | Prevents the rebase race while keeping tested tree = merged tree (A-22) | Later |
| **START-02** Software factory: template repo plus dev container | Productize the method so a new project starts with the tools, checks and governance from day one. Three layers: (1) a dev container with pinned tools; (2) a template repo holding the guard, test policy, portable `spec/delivery` controls and catalog, `AGENTS.md`, hooks, and a hello-world service; (3) organization setup (rulesets, agent App, AWS accounts with SCPs, OIDC roles, central reusable workflows). A new repo starts with controls `@awaiting`, and failing live checks act as the onboarding checklist. | **Sequenced after persistence** (DATA-01), decided 2026-10-10: understand every layer of an application, including durable state, before productizing. Implements START-01. | START-01 |
| **REVIEW-01** Make freezes reviewable | Keep protected patches small (one control per patch) and add a review checklist for freezes | The human freeze is the bottleneck and the main risk | Process / AGENTS.md |

### START-02 outline (for when it's picked up)

- **Prerequisite: one project config.** Move what's hardcoded today into a single file:
  the repo slug in predicate-type URIs and `root-of-trust.json`, the App ID and slug in
  `tools/github/agent.mjs`, the region and budget in the catalog, and the container
  names in DC-004.
- **Split portable from project-specific (A-15).** Petclinic-only controls and data
  (`PETCLINIC_TEST_ENDPOINTS`, seed data, petclinic catalog entries) leave the template.
- **Ship controls as a versioned package**, not a copy. The template provides the
  skeleton. `spec/delivery` arrives as a pinned package or git ref, and the reusable
  workflows as SHA-pinned references to a central repo. Projects adopt new control
  versions through a freeze, instead of each copy drifting.
- **The dev container as the agent sandbox.** Agents run inside it with only the App's
  credentials (closes AGENT-01). Compose and the browser container need Docker-in-Docker
  or the host's Docker socket; Codespaces is an option.
- **The first 15 minutes, made executable.** Clone the template, and the red checks list
  what's missing (no ruleset, no agent identity, no OIDC role).
  `npm --prefix spec/delivery run test:awaiting` shows progress.
- **The graduation test (ENG-02):** the hello-world repo is the second project that
  proves the portable kit.
- **What to call it.** "Software factory" is the US Department of Defense term (Kessel
  Run, Platform One) for an organization that provides a secured, compliant pipeline
  and environment so teams ship to production with a continuous authorization to
  operate. Close relatives:
  - **golden path / paved road:** the template-plus-dev-container layer;
  - **internal developer platform:** the organization layer;
  - **platform engineering:** the discipline.

  For a government audience, "software factory" fits. What's specific here is that
  agents are first-class workers inside it, with their own identity and limits.

## Part 2 — Talking points

**One-liner:** *"We didn't invent new guardrails. We made them executable, made agents
build to them, and made the evidence fall out of delivery."*

**Points that land:**
- Compliance usually lives in documents that describe the system. Here the controls
  *are* tests, and the readable catalog is generated from them, so it can't drift.
- Separation of duties with AI isn't human versus human, it's human versus agent. With
  one maintainer, the line that matters is "agents never approve, merge or bypass".
- The workflow file is the privilege boundary. Whoever can edit it decides who gets
  cloud credentials, so humans own the YAML and agents own the scripts it calls.
- The checks caught their authors, including me (the agent) and the human
  configuration. A "required" check wasn't required.
- A $25/month budget is a design constraint, not a footnote: it forced ephemeral
  environments, which is also good practice.
- Be honest about the gaps: text-search checks, the live tier not in CI, the agent
  boundary as a convention, self-merges.

**Draft lessons** (`docs/talk-notes.md` format; numbering continues from Lesson 8):

### Lesson 9 — "Write the test first, make it required, then build"

**The assumption:** red-first tests and required CI checks fit together. You freeze
the test, it fails, and the agent builds until it passes.

**Why this pivot, specifically:** 23 delivery controls were frozen red into a required
check, and every merge stopped, including the commit that froze them. `test:verify`
could never pass. The guard already rejected `@pending` as a skip, so the obvious
escape hatch was gone.

**What changed:** each control not yet built carries `@awaiting:<backlog item>`. It's
informational, and a report says when it starts passing; a human removes the tag at a
freeze. Then it's required and can't regress.

**Takeaway:** specifying ahead and enforcing now need an explicit, human-controlled
promotion step between them.

### Lesson 10 — "Separation of duties means two different people"

**The assumption:** separation of duties needs a second human approver, which a solo
project can't have.

**Why this pivot, specifically:** the agent session was acting through the maintainer's
own GitHub login, so GitHub couldn't tell the agent from the human. The real risk
wasn't self-review; it was an agent approving or merging *as* the human.

**What changed:** agents got their own GitHub App identity. Live checks prove it can't
approve, bypass, deploy or merge, and the wrapper refuses those commands. The human's
own admin-bypass merges count as human decisions.

**Takeaway:** with AI, separation of duties is human versus agent. Give the agent its
own identity and prove what it can't do.

### Lesson 11 — "The screenshot test is the same everywhere"

**The assumption:** a pinned browser plus a bundled font makes screenshots
deterministic.

**Why this pivot, specifically:** baselines rendered on macOS failed on Linux CI by
3,292 and 5,011 pixels. The same Chromium and the same Inter font drew text differently
on each OS. Running the pinned Playwright container on the Mac reproduced CI's exact
pixel counts.

**What changed:** the browser suite and its baselines run in that pinned container on
every host, locally and in CI.

**Takeaway:** the reference environment is part of the spec. Pin it, or the test
measures the machine, not the product.

### Lesson 12 — "Our settings say it's protected"

**The assumption:** the repository was configured the way the documents said: a
required guard check, protected prod.

**Why this pivot, specifically:** the first live run of the delivery spec found no
ruleset protecting `main`, so the "required" check wasn't required. A later run found
`prod` accepting deployments from any branch.

**What changed:** settings became live checks (CTL-024/025/028), run against GitHub
itself.

**Takeaway:** configuration is code you can't see. If a setting matters, test it, and
run that test continuously (candidate LIVE-01).
