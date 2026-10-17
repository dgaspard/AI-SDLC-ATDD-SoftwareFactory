# REVIEW-02 design: a policy-governed PR approver

Status and scope: [REVIEW-02 in BACKLOG](../../BACKLOG.md#review-02--specialist-agent-review-and-policy-governed-merge-eligibility-proposed-2026-10-16).
Design 2026-10-16. The spec amendments below were frozen by the maintainer on
2026-10-16 (`a21997b`), with decision [A-29](../decisions/architecture.md) revising A-22.
Nothing is built yet, so nothing approves automatically.

## Why now

The human approval in A-22 has become nominal. Of the last six merged pull requests
(#12–#17), two have an approval; four were merged through the maintainer's admin bypass
with no standing approval (#16's was dismissed by a later push; the others had none).
The maintainer approves once a PR reaches GitHub and passes every check, and judges
(2026-10-16) that the frozen tests, specifications and deterministic gates are what give
a PR review its value.

So the approver doesn't try to be a second reviewer. It makes the existing judgment
explicit and auditable: a written, protected policy says which changes the gates are
enough for, a separate identity approves exactly those, and humans stay on the changes
that can weaken the gates themselves.

## The rule in one paragraph

The approver identity approves a pull request when, and only when, every required check
passed on its exact head commit, the branch is up to date with `main`, and every path it
changes is in a class the protected review policy lets the approver approve. Changes to
the root of trust (specs, guard, agent instructions, the approval machinery, identity)
and to privilege or supply chain always need a human code owner. A human merges.

## Parts

| Part | Decides | Owner |
|---|---|---|
| **Required checks** (exist) | Whether the change meets the frozen expectations | Frozen specs and tests (GUARD-01, CI-02) |
| **Review policy** (`spec/delivery/review-policy.json`) | Which path classes the approver may approve | Human, protected and frozen |
| **Evaluator** (to build) | Applies the policy to one PR and publishes the `Review policy` check with a decision record | Agent-built behind frozen checks |
| **Approver identity** (to create) | Submits the approval when the evaluator passes | A separate GitHub App, never the build agent |
| **Advisory reviewers** (optional) | Findings on security, observability, engineering rules and linting, product coverage, behavior and contracts, docs | Comments only; they never grant or block approval unless a frozen policy change makes one required |

Merge authority doesn't change: a human merges. Automatic merging would be a further
decision (phase 3 below).

## Flow for one pull request

1. The build agent opens a PR as `ai-sdlc-bdd-agent`, as today.
2. The required checks run: `Protected specs and tests unchanged`, `Delivery spec`,
   `Application suite`.
3. When they finish, a review workflow on `main` runs (`workflow_run`, never
   `pull_request_target` running PR code). It reads the PR's changed paths and check
   results through the API and never executes code from the PR. The policy and evaluator
   come from `main`.
4. The evaluator classifies every changed path, checks the required checks on the head
   SHA and the up-to-date rule, and publishes `Review policy` (success or failure) with a
   decision record: PR, head SHA, tree, policy version, classes, check results, verdict.
5. On success, the approver App approves, bound to that head SHA. On failure, it comments
   the reasons and leaves the PR for the human code owner.
6. A human merges. A new push dismisses the approval (the ruleset already dismisses stale
   reviews and requires approval of the last push) and the flow reruns.

## Change classes

The policy file is the source; this is a summary. A path takes the most restrictive class
it matches, a change takes the most restrictive class of its paths, and an unnamed path is
root of trust.

| Class | Paths | Approver may approve |
|---|---|---|
| Root of trust | `spec/`, `docs/specs/`, `.claude/`, `.github/`, `tools/github/`, `tools/review/portable/`, `tools/security/portable/`, `AGENTS.md`, `CLAUDE.md` | No |
| Privilege and supply chain | `scripts/ci/`, `infra/`, `docker/`, `compose.yaml`, any `package.json`, `package-lock.json`, `Dockerfile`, `.npmrc` | No (dependency PRs wait for DEPS-01) |
| Implementation | `services/`, `frontend/` | Yes |
| Documentation | `docs/` (outside `docs/specs/`), `README.md`, `BACKLOG.md`, `PROJECT-PLAN.md` | Yes |

## Identities and credentials

- **`ai-sdlc-bdd-agent`** (build agent): unchanged; its wrapper keeps refusing approve and
  merge.
- **Approver App** (new): `pull_requests: write`, `checks: write`, `contents: read`,
  `actions: read`. Nothing else: no contents write, no workflows, no admin, not a code
  owner, no ruleset bypass. Its key lives only in a GitHub environment the review workflow
  on `main` uses.
- **Advisory AI reviewers**, if used: a separate model key, readable only by reviewer
  jobs that hold no GitHub write token. PR content is untrusted data to them.

To verify on a throwaway PR before phase 2 (like CI-02's #11): GitHub counts the App's
approval toward the required approval, and code-owner review still blocks a
root-of-trust change the App approved. Apps can't be code owners, so it should.

## Spec amendments (frozen 2026-10-16)

| Control | Change | Tag |
|---|---|---|
| CTL-025 | Renamed "Build agents can never approve, merge or bypass"; steps unchanged | required, as today |
| CTL-028 | Also: no approver identity has merged a PR | required, as today (vacuous until an approver exists) |
| CTL-061 | The approver identity exists, isn't a build agent or code owner, has no permission beyond reading contents and writing reviews and checks, and no ruleset lets it bypass | `@awaiting:REVIEW-02` |
| CTL-062 | The policy never lets the approver approve a protected path, a root-of-trust path, its own machinery or an unnamed path; a mixed change is never approvable | required at freeze: it checks only the frozen policy |
| CTL-063 | Every approval by the approver is for a commit whose `Review policy` check succeeded | `@awaiting:REVIEW-02` |

Also in the patch: `review-policy.json`, `root-of-trust.json` gains `approverIdentities`,
`approverApp` and `reviewPolicy`, the `prod-approval` catalog entry is revised, and the
generated `docs/delivery/environments.md` is regenerated to match.

## Evaluator tests and contracts (frozen 2026-10-16)

The evaluator follows DORA-01's pattern: an agent-built tool behind protected contracts
and tests.

- **Interface:** `node tools/review-policy/evaluate.mjs --facts <file> --now <date-time>
  --out <file> [--policy <file>] [--root-of-trust <file>]`. Policy and root of trust
  default to the frozen files. Exit 0 writes a decision record, with the decision as the
  first stdout line; any other exit rejects the input and writes nothing.
- **Input contract** `review-facts.v1`: PR number, author, head SHA, base, up-to-date,
  draft, labels, changed paths, check runs (name, SHA, status, conclusion, time) and the
  kill-switch value. Gathered by a read-only script; never PR code. Which checks are
  required is not an input: it comes from `root-of-trust.json`.
- **Output contract** `review-decision.v1`: PR, head SHA, policy schema and SHA-256,
  `approve` or `refer-to-human`, each file's class, each required check's latest
  conclusion on the head commit, and every reason, from a fixed set of codes.
- **Tests** (`spec/tests/review-policy/`, 45): approval of implementation and docs
  changes; refusal for each root-of-trust and privilege path; most-restrictive class
  whatever the policy order; unmatched and empty changes; missing, stale, failed and
  re-run checks; up-to-date, draft, label, kill switch (off unless explicitly on) and
  approver-authored PRs; all reasons reported; byte-identical records; rejected input.
- **Suite:** `review-policy` in `spec/test-policy.json` with a path rule for
  `tools/review-policy/`, **not yet in the full tier**, so the gate stays green until the
  evaluator is built. Add it to the full tier at the freeze that lands the evaluator.

Checked in a throwaway worktree: all 45 tests fail with "not built yet" before the
evaluator exists. A throwaway reference evaluator (not in any patch) passes 45/45, and
each of four planted bugs fails at least one test: stale checks counting, the kill switch
failing open, first-match classification, and the earliest re-run deciding.

Still to do: the read-only facts collector (`scripts/ci/`), the check publisher and the
review workflow file, which is privilege-bearing and human-owned (A-21).

## Phases

| Phase | What runs | Exit (maintainer decides) |
|---|---|---|
| 1. Shadow | The evaluator publishes `Review policy` on every PR; the approver doesn't approve | Its verdicts match the maintainer's merges over an agreed run of PRs |
| 2. Approve | The approver approves Implementation and Documentation changes; a human merges | Review after an agreed period; the kill switch stays available |
| 3. Optional auto-merge | Eligible PRs merge through a merge queue (MQ-01) | A separate decision revisiting A-22 again; not part of A-29 |

Kill switch: the `REVIEW_APPROVER_ENABLED` repository variable and the `needs-human`
label stop approvals at once. Decision records show why each approval happened.

## Decision

Recorded as [A-29](../decisions/architecture.md) at the freeze.

## Limits

- The approval is only as good as the gates. That is why the gates' own definitions (the
  root of trust) stay human-reviewed, and why the guard freeze matters more after this
  change, not less.
- With one maintainer this replaces a nominal approval with an explicit rule; it doesn't
  add a second person.
- It relies on GitHub behavior still to verify (App approvals counting; code-owner
  enforcement against an App approval).

## Open questions

- Which advisory reviewers, if any, are worth their cost per PR?
- Shadow-phase length: how many PRs before approving?
- Should Documentation start first, before Implementation?
- Who besides the maintainer may flip the kill switch?
