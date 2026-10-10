# Agent Working Agreement

This repository demonstrates how executable specifications guide AI-assisted development.

## Rules

- Consult `PROJECT-PLAN.md` for milestones, reconstruction experiment boundaries, and demo readiness criteria.
- Follow `docs/development-workflow.md` for specification-first sequencing, service/workflow feature organization, and persistent task handoffs.
- Consult `BACKLOG.md` for scope, sequencing, and unresolved business decisions.
- Design and review API contracts, observability contracts, and BDD features before new implementation; proposed backlog items are not approved requirements.
- Follow `docs/observability.md`, preserving its distinction between binding contracts and proposed standards.
- Follow `docs/specs/observability-traceability.md`: retain stable OBS IDs, include asserted IDs in test titles, and update the coverage table with test changes.
- Treat domain objects exposed across service boundaries as contract surfaces. Test their serialized schemas, references, state transitions, and invariants. Do not add tests whose only purpose is to exercise trivial getters, setters, constructors, or private storage.

## Protected paths

Humans edit these; agents may read them. During the build phase agents must not
create, modify, or delete anything under:

- `spec/` (features, contracts, seed data, tests, validators, harness, fakes)
- `docs/specs/` (decisions, domain model, schema decisions)
- `.github/workflows/guard.yml`, `.github/CODEOWNERS`, `.claude/`, `AGENTS.md`

Delivery workflows (`.github/workflows/delivery-*.yml`) are agent-built outputs
checked by `spec/delivery/`, outside the protected root of trust (A-20).

Enforcement is GUARD-01, not this file alone:

- `.claude/settings.json` deny rules and the `.claude/hooks/protect-paths.mjs` hook block the
  build agent (Claude Code) from editing protected paths or writing to them from the shell.
  The block reason is shown to the user and returned to the agent.
- `npm --prefix spec run guard:check` (first step of `npm test`, and the required GitHub
  check) fails if any protected file changed since the last human freeze, or if a test is
  skipped or focused.
- Only a human runs `npm --prefix spec run guard:freeze`, after reviewing a spec change.
- In the specification phase, an assistant may draft protected files only when the human
  asks for that specific change; the human reviews the diff and freezes it.
- If the specification looks wrong during the build phase, stop and explain the problem to
  the user. Do not work around the guard.

Backlog tasks state which phase they run in.

## Requirements

- Agent GitHub operations must use the `ai-sdlc-bdd-agent` GitHub App (App ID
  `5265528`), through `node tools/github/agent.mjs gh <args>` or
  `node tools/github/agent.mjs git <args>` for authenticated Git operations.
  Run `node tools/github/agent.mjs check` to verify authentication. Never fall
  back to the maintainer's personal token, default `gh` login, or personal
  GitHub connector to create PRs. If App authentication fails, stop that operation.

- Treat files under `spec/features/` as product requirements.
- Do not modify feature files or test steps merely to make a failing build pass.
- Change a feature only when the requested behavior has intentionally changed.
- Prefer accessible labels and roles because the browser tests use them as the user would.
- Do not hardcode values solely to satisfy the current examples.
- Treat `spec/contracts/` and every validator under `spec/tests/` as externally agreed expectations.
- Do not weaken, skip, or delete a failing BDD, contract, or observability test.
- Scenarios tagged `@retired` describe behavior that was deliberately removed. They
  must pass. Never implement behavior found only in tag `1.0`, `docs/history/`, or
  another earlier version.
- Scenarios tagged `@accepted-risk` are expected to fail on purpose and run only in
  the `accepted-risks` suite. Don't fix them unless asked, and never add, remove, or
  edit `@accepted-risk` or `@retired` tags. That is a human freeze decision.
- Scenarios tagged `@awaiting:<BACKLOG-ID>` describe requirements awaiting the
  named backlog item. Agents must not add, remove, or edit `@awaiting` tags,
  including to make a suite pass or activate a requirement. Changing these tags
  is a human review and freeze decision.
- If the `accepted-risks` suite reports a `STATE CHANGE`, put it at the top of your
  final report: the risk ID, the old and new state, and the tree. Don't bury it in
  the suite table.
- Follow the test loop below. Work is complete only when `npm run test:verify` passes.

## Test loop

`spec/test-policy.json` (protected) defines the suites, the tiers, and which changed paths
select which suites. `spec/run-all.js` runs them and writes a run record to
`test-results/runs/<runId>.json` for every run: the exact working-tree hash, why each
suite ran, its command, counts, duration, and log.

1. **While building:** `npm run test:fast`. It runs the always-set plus the suites
   selected by files changed since the last verified tree. Run it after each meaningful
   change, not after every edit. `npm run test:plan` shows what it would run, without running.
2. **To debug one failure:** `npm run test:suite -- <id>` (ids are in the policy), or run
   that suite's command from its run record with a test-name pattern. Do not rerun the
   whole tier to check one fix.
3. **Before declaring work complete:** `npm run test:gate`. It reuses suites that already
   passed on this exact tree and runs only the rest. If a shell call has a time limit, run
   the missing suites in chunks with `test:suite`; results on the same tree add up.
4. **Prove it:** `npm run test:verify` exits 0 only when every full-tier suite has passed on
   the current tree. Report the run record paths with the result.
5. **Reviewers** run `npm run test:verify` and read the run records. Rerun a suite only if
   the record is missing, failed, or does not match the tree under review.

Any edit changes the tree hash, so earlier passes no longer count. Fix, then gate once.
CI runs `npm test` (full tier, no cache) on every pull request; local records never
replace CI.
- Explain any requirement ambiguity before implementing a guess that changes behavior.
