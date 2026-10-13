# CI-02 local slice: the required application gate

Status: **local slice verified 2026-10-13; the `main` ruleset requires the check and CTL-024
passes live (2026-10-13); the failing-PR proof is pending
verification.** CI-02 overall stays open (SBOM, attestations, scans that gate, OIDC).
Backlog: [CI-02](../../BACKLOG.md#ci-02--delivery-pipeline-as-a-by-product).

## Outcome

A required application failure fails a required CI check, and a developer can prove the
same gate locally. Local validation and GitHub enforcement have separate statuses.

## What changed (frozen 2026-10-13)

- `.github/workflows/guard.yml`: the informational `suite` job became **`Application
  suite`**. It has no `continue-on-error`. It installs `spec`, `spec/delivery` and every
  project's setup, runs `node spec/run-all.js` (full tier, uncached), then
  `node spec/run-all.js --verify`, then fails if `git status --porcelain` shows any change,
  and always uploads `test-results/` (`if-no-files-found: error`). The delivery-suite install
  was missing before, a failure the old `continue-on-error` hid.
- `spec/delivery/root-of-trust.json`: `requiredChecks` now lists `Protected specs and tests
  unchanged`, `Delivery spec` and `Application suite`.
- **CTL-029** (catalog entry `application-gate`): the job exists, is required, runs the
  runner and then its verifier, never reuses cached results, can't swallow a failure, runs
  every gate step unconditionally in the default shell from the repository root, calls no
  agent-built script or local action, checks the checkout is unchanged afterward, and keeps
  its evidence.
- `spec/run-all.js`: a passing suite counts toward the gate only if its log still exists
  under `test-results/runs/`; a later failure on the same tree revokes an earlier pass; and
  `--verify` reports unreadable records. `spec/tests/harness/run-all.test.js` proves these
  rules with ten fixture tests.

**Why the gate calls the protected runner directly.** A pull request must not be able to
redefine the check that judges it. The root `package.json` isn't protected, so the job runs
`node spec/run-all.js` instead of `npm test`, and CTL-029 fails if it calls `scripts/ci/`,
`infra/` or a local action. `guard.yml` is the root of trust (A-20), not a delivery
workflow, so A-21's thin-workflow pattern doesn't apply to it.

**Residual risk.** Setup scripts and services are pull-request code and run inside this
job. The final `git status --porcelain` check catches any change they make to tracked or
non-ignored files, protected ones included, but not changes to ignored files such as
`node_modules/`. It also can't catch code that subverts the later steps themselves: a
setup script can append to `$GITHUB_PATH` or `$GITHUB_ENV` (for example a fake `node` or
`git` earlier on `PATH`, or `BASH_ENV`), and hosted runners grant `sudo`. The check catches
accidental changes, not a deliberately malicious pull request; that relies on human review
of the diff. Full isolation means running pull-request code in a separate job or container from the gate
(proposed GATE-ISO-01).

## Acceptance criteria

| # | Criterion | Local evidence |
|---|---|---|
| 1 | A behavioral failure fails the application job and the gate | Planted defect in Checkout's remaining balance: 52 of 286 scenarios failed, the runner exited 1, the verifier exited 1; file restored from git |
| 2 | A protected-file violation fails the guard | The existing guard (GUARD-01) still runs first in the full tier and as its own required job |
| 3 | A full pass on the current tree verifies | Fixture test and the final gate |
| 4 | Missing, malformed, incomplete or stale evidence can't pass | Fixture tests: no records, missing suite, other tree, other policy, malformed record, deleted log, log outside `test-results/runs/`, a later failure on the same tree |
| 5 | Accepted-risk semantics unchanged | The `accepted-risks` suite and SPEC-07 banner are untouched |
| 6 | Failed runs keep logs; missing records are visible | Fixture test (a failed suite keeps its record and log); the upload step uses `if: always()` and errors on no files |
| 7 | Names agree | `Application suite` in `guard.yml`, `root-of-trust.json`, the contract and this checklist |
| 8 | Local and remote statuses are separate | Local: verified. Remote: ruleset configured and CTL-024 passes live; failing-PR proof pending |

## Remote enforcement checklist (repository admin)

YAML can't make a check required; the `main` ruleset does. On
`dgaspard/AI-SDLC-ATDD-SoftwareFactory`:

1. **Settings → Rules → Rulesets →** the ruleset targeting `main` **→ Require status checks
   to pass**: add `Application suite`. Keep `Protected specs and tests unchanged` and
   `Delivery spec`. Keep "Require branches to be up to date before merging" on.
2. Confirm the check appears after one workflow run on a PR (GitHub only offers check names
   it has seen).
3. **Bypass list:** only the repository admin role, "for pull requests only". The agent App
   must not appear.
4. Run the live tier with a token that can read rulesets:
   `npm --prefix spec/delivery run test:live`. CTL-024 passes only when every required check
   in `root-of-trust.json` is required on `main`.
5. **Prove it with a failing PR:** on a throwaway branch, break one rule (for example the
   Checkout remaining balance), open a PR, and confirm `Application suite` fails and the PR
   can't merge. Close the PR without merging and delete the branch.
6. Record the result here and in BACKLOG; then mark remote enforcement verified.

The agent App has no `workflows` permission (A-21), so a human pushes any branch that changes
`guard.yml`.

## Completion record

- First specification freeze: 2026-10-13 (CTL-029, runner hardening, nine runner tests).
  Red baseline before it: `guard` failed (unfrozen), `harness` 69/69, `delivery` 12/13 (only
  the rendered environment guide was stale). Against the old runner, two of the nine runner
  tests failed (malformed-record report, missing-log rule).
- Independent review (fresh session, 2026-10-13) found four problems: the gate ran
  unprotected npm scripts; the failure-swallowing check missed `|| :`, `|| exit 0` and
  `; true`, and nothing checked step conditions, shells or directories; a later failure didn't
  revoke a pass; and the catalog claimed remote enforcement. A second specification patch
  fixes all four. Against the first-freeze runner, its two new runner tests fail.
- Build: rendered `docs/delivery/environments.md`; this note; backlog update.
- Planted-defect run (local, gitignored record):
  `test-results/runs/2026-10-13T13-51-06-622Z-suite.json` (exit 1).
- Second specification freeze: 2026-10-13 (`guard:check` passes on this tree).
- Fresh-session re-review: all original findings resolved or reduced; three low risks
  accepted for now and logged in BACKLOG (open follow-ups).
- Full gate: complete on the committed tree; the tree and run record are in the commit
  message.
- Remote: the first CI run of `Application suite` passed on PR #10; the `main` ruleset now
  requires it, and the live tier passed 3/3 scenarios (CTL-024, CTL-025, CTL-028).
- Pending: the failing-PR proof (checklist step 5).
