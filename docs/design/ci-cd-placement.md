# CI/CD placement: what the agent checks locally vs. what CI/CD requires

> **Restored 2026-10-10** from tag `ci-perf-01-required` (commit `a957981`), which was
> never merged into `main`, so A-13 pointed at a missing file. The framework below is
> current; SPEC-08 applies it through the `@tier:` tags ([design](spec-08-delivery.md)).
> **Not on `main`:** the "Applied: PERF-01" section describes a required `performance`
> job that exists only on that tag. `main`'s `guard.yml` still runs PERF-01 inside the
> informational `suite` job.

A decision record, not a specification. Captures the framework from the
2026-10-03 analysis session so it can be referenced later, reused on other
projects, and pointed to from talks. See [A-13](../decisions/architecture.md) for the
one-line decision-log entry and [ENG-02](../history/backlog-completed.md#eng-02--independent-calibrated-engineering-review) for the related
portable/project-specific split of review checks.

## The problem

An agent building software can run almost any check locally — lint, tests,
mutation scores, even a security scan — and report that it passed. That
report is only as trustworth as the agent's incentive to report honestly and
its ability to actually run the check correctly. Some checks need to live in
CI/CD regardless of how well the agent behaves locally; others are wasted
effort if they're *not* in the local loop, because the agent needs the signal
to converge on working code in the first place. Treating "local test" and
"CI/CD check" as the same category is how teams end up either duplicating
every check in both places (slow, expensive) or trusting an agent's local
"all green" for something that actually required independent verification
(risky).

## The three questions

Ask these in order for any new check:

1. **Can the agent make this pass dishonestly, without independent
   detection?** If yes, it needs either a CI-side independent rerun (CI
   re-executes the check itself rather than trusting the agent's reported
   result), or a tamper-evident/frozen definition that CI can cheaply verify
   (the GUARD-01 pattern: a human freezes a hash manifest of protected specs
   and tests; CI checks the hash, not the content, so it's cheap and the
   agent cannot have quietly edited the thing being checked).
2. **Does the agent need this signal *while building* to converge?** If the
   agent can't make progress without running the check itself mid-build (a
   failing BDD scenario telling it what to build next, a lint error telling
   it about a style violation), it belongs in the local loop (`npm test`),
   even if a CI copy also exists as a backstop.
3. **Does it require infrastructure, credentials, or live external data
   unsuitable for an autonomous local session?** (a staging deployment, a
   production-like load test, a third-party API with rate limits or secrets
   the agent shouldn't hold) If yes, it's CI-only, run with least-privilege
   credentials the agent never sees, and CI's copy is the authoritative
   result — nothing the agent does locally substitutes for it.

A check can answer "yes" to more than one question. The questions aren't
mutually exclusive gates; they're independent reasons to require a CI-side
copy. A check that answers "no" to all three is a reasonable candidate to
stay purely local (fast feedback, no CI minutes spent).

## The second axis: portable vs. project-specific

Orthogonal to where a check runs is who owns its definition, per ENG-02:

- **Portable** — the check encodes a rule that's true of good software in
  general, not of this project's specific business behavior (secret
  scanning, dependency CVE checks, a non-constant-time comparison on a
  secret). These are candidates for a future org-level, centrally curated
  GitHub Actions check maintained by a services/platform team, not
  reinvented per repo.
- **Project-specific** — the check encodes a decision this project made that
  won't generalize (this service's specific auth model, this domain's money
  rules). These stay local to the repo, frozen the same way GUARD-01 freezes
  specs.

## The 2x2

| | Local loop (agent runs it while building) | CI-only (independent, authoritative) |
| --- | --- | --- |
| **Repo-owned (project-specific)** | Service BDD, schema/contract tests, mutation-rehearsed slices — the agent needs these to converge, and they encode decisions specific to this project. | GUARD-01 protected-manifest check: cheap, tamper-evident, verifies something a human froze. |
| **Centrally-owned (portable)** | A shared lint/style config the agent runs locally for fast feedback, pulled from a central package. | A future org-level security/dependency scan (SEC-01's eventual home): needs infrastructure or credentials the agent shouldn't hold, and must be independently authoritative regardless of what the agent reports. |

## Applied: PERF-01

PERF-01 (local performance: p95 < 200ms, frozen workload, five paced workers)
was informational-only inside the full `suite` job (`continue-on-error:
true`), bundled with all ten suites. Run through the framework:

- Question 1 (dishonesty-proof?): the workload and thresholds are frozen and
  identical for every language (A-06), so there's nothing for the agent to
  quietly loosen — a straight CI rerun is enough, no tamper-evident manifest
  needed.
- Question 2 (needed mid-build?): no — it's a final gate on a working
  implementation, not a signal the agent needs to converge on one.
- Question 3 (infra/credentials?): no — it's a local measurement against the
  same services already under test.

Only question 1 is relevant here, and it's satisfied cheaply (a straight
rerun, ~15s). That's enough to justify pulling it out of the informational
bundle into its own required job — not because it needed new infrastructure,
but because "informational" meant a regression could merge unnoticed. See the
`performance` job in `.github/workflows/guard.yml` (A-13).

## Using this on the next check

Before adding a new check anywhere in this repo (or reusing this framework on
another project), answer the three questions, place it in the 2x2, and if
it's centrally-owned, flag it for the services team per ENG-02 rather than
hand-rolling a local copy.
