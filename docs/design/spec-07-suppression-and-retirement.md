# SPEC-07 design: suppressing tests and retiring features through the spec

Status: **frozen and verified 2026-10-07 (`03b374b`).** See "Implementation (as drafted)" at the end for what was
built, how it differs from this design, and the calibration results. Decisions this builds on are in
[the SPEC-07 history entry](../history/backlog-completed.md#spec-07--suppressing-tests-and-retiring-features-through-the-spec).

## Summary

| Need | Mechanism | Enforced by |
| --- | --- | --- |
| Knowingly accept a failing BDD scenario | `@accepted-risk` plus `@risk:`, `@owner:` and `@review:` tags on the scenario | Guard validates the tags and expiry. A new `accepted-risks` suite runs the scenarios and expects them to fail. |
| Say a shipped feature is gone | A "must not exist" scenario tagged `@retired @decision:D-xx` in the owning service's feature folder | Runs in the normal features suite. A rebuild that brings the feature back fails. |
| Stop informal suppression | Wider skip detection in the guard | `guard:check` (first step of `npm test`, a required CI check) |

`node:test` suites (contract, OBS, auth, schema, runtime, harness, performance) have no
suppression mechanism. `tools/review/` stays advisory.

## 1. Tag grammar

Gherkin tags can't contain spaces, and this repo already uses `@name:value` tags
(`@service:reservation`), so metadata goes in separate tags:

```gherkin
@accepted-risk @risk:REV-001 @owner:dustin @review:2027-01-31
Scenario: A same-key retry after a downstream timeout does not charge again

@retired @decision:D-24
Scenario: The legacy visit-cancellation endpoint no longer exists
```

Rules the guard enforces:

- `@accepted-risk` requires exactly one each of `@risk:`, `@owner:` and `@review:`.
- `@risk:` must resolve to a record: `D-nn` in `docs/specs/business-decisions.md`,
  or `REV-nnn` in a file under `docs/engineering-reviews/`.
- `@review:` is an ISO date. The guard fails when today is after it, and warns
  14 days before.
- `@retired` requires exactly one `@decision:D-nn` that exists in
  `docs/specs/business-decisions.md`.
- `@accepted-risk` and `@retired` can't appear on the same scenario, or at the
  `Feature:` level (scenario level only, so a whole file can't be waved through).

## 2. Guard changes (`spec/guard/guard.js`, `spec/guard/check.js`)

**Close the conditional-skip hole.** Today `SKIP_CODE` matches only `.skip(` and a
literal `{ skip: true }`. The REV-003 skip (`skip: cond && "reason"`) would pass even
under `spec/`. Proposed: in protected `.js` files under `spec/tests/` and
`spec/harness/`, ignoring comment lines, flag:

- `.skip(`, `.only(`, `.todo(` on any receiver, including `t.skip(` and `t.todo(`
- an object property `skip:`, `only:` or `todo:` with any value, using
  `(?<![\w-])(skip|only|todo)\s*:` so prose like "Administrator-only:" doesn't match
- Cucumber escape hatches: `return "skipped"`, `return "pending"`, and
  `this.skip` / `testInfo.skip` / `test.fixme` in Playwright

A scan of `spec/tests`, `spec/features` and `spec/harness` with these patterns
finds no real hits today. The only false positive, a comment in
`journeys.spec.js:276`, is excluded by the comment-line rule.

**Bare tags.** Keep rejecting `@skip @wip @ignore @only` and add `@todo @pending
@manual @disabled`. The only sanctioned ways to keep a scenario out of the main run
are the two tags in §1.

**Report.** `guard:check` lists every accepted risk with its owner and review date
on each run, even when everything passes, so the risk register is visible in every
log and CI run.

## 3. Runner changes

- `spec/cucumber.cjs`: add `tags: "not @accepted-risk"` to the `default` and
  `workflows` profiles. Retired scenarios stay in the normal run and must pass.
- New `spec/guard/accepted-risks.js`: runs Cucumber with
  `--tags @accepted-risk` across both profiles, reads per-scenario results from the
  message/JSON formatter, and inverts them:
  - fails as expected → reported as `ACCEPTED REV-001 (owner dustin, review 2027-01-31)`
  - passes → **an explicit state change**, not silent and not a failure (decided
    2026-10-07). The accepted state is "failing," so any pass is a change:
    `STATE CHANGE  REV-001  failing → passing on tree <hash>  (<file:line>)`.
    The suite still exits 0, because builds are disposable and a risk can come and
    go between rebuilds. The tag comes off only by human decision, through freeze.
  - If an earlier run record for this suite exists, the line also names it
    (`last failing: run <runId> on tree <hash>`). The reverse change, passing →
    failing, is reported the same way.
  - The change appears in three places: the suite's own output, a
    `stateChanges` array in the run record, and a banner at the end of the
    `run-all.js` summary, after the gate line, so it can't scroll away.
  - Build facts (language, database, libraries, cloud) never go in the spec. The
    review record (for example REV-001) says which build exposed the risk, and each
    run record says which tree it was checked on.
  - errors at step-definition level (undefined or ambiguous step) → fails. A broken
    scenario doesn't count as "failing as expected."
- `spec/test-policy.json`: add the `accepted-risks` suite to the full tier and select
  it whenever `spec/features/` or `services/` change. `run-all.js` needs no change if
  the script prints the same `N scenarios (…)` summary it already parses.

## 4. Worked example: retiring the legacy cancellation (D-24)

Tag `1.0` shipped `DELETE /api/pets/{petId}/visits/{visitId}` (`cancelVisit`). D-24
replaced the legacy app, and cancellation now lives at
`POST /reservations/{id}/cancel`. An agent reading tag `1.0` or
`docs/history/` could rebuild the old route. The runtime contract has no rule that
unknown routes return 404, so nothing catches that today.

`spec/features/reservation/retired.feature`:

```gherkin
@service:reservation
Feature: Retired reservation behavior
  Behavior that shipped in an earlier version and was deliberately removed.
  Each scenario proves the removed behavior does not exist. Do not implement it.

  Background:
    Given the clinic clock reads "2026-10-05 09:00" Central Time
    And Jordan has an Accepted reservation for Milo with Dr Avery Taylor on "2026-10-12" at "09:00" with the booking fee paid

  @retired @decision:D-24
  Scenario: The legacy visit-cancellation endpoint no longer exists
    When Jordan calls the retired endpoint "DELETE /api/pets/{petId}/visits/{visitId}" for that reservation
    Then the response is 404
    And the reservation is "Accepted"
```

New steps go in `spec/tests/steps/common.steps.js`: a generic "calls the retired
endpoint" step that fills path parameters from the world, plus "the response is
{int}". Assert on observable state, not on the absence of a trace, because every
handled request produces a span (runtime contract line 100).

## 5. Worked example: an accepted risk

The natural candidate is ENG-02 **REV-001**: a same-key retry after a downstream
timeout charges again. That needs a harness change first. The Customer stub would
need to drop or delay a response, which it can't do today (it only returns declared
statuses; see `checkout.steps.js:99-107`). That stub change is the harness gap
REV-001 exposed.

```gherkin
@accepted-risk @risk:REV-001 @owner:dustin @review:2027-01-31
Scenario: A same-key retry after a Customer timeout does not charge again
  Given Jordan's bill for Milo's visit is finalized with a balance of $50
  And Customer will time out on the next account change
  When Jordan pays $50 by card with idempotency key "K1"
  And Customer recovers
  And Jordan retries the payment with idempotency key "K1"
  Then the payment provider was asked to authorize exactly once
```

## 6. Agent instructions (`AGENTS.md`)

Add under Requirements:

- Scenarios tagged `@retired` describe removed behavior. They must pass. Never
  implement behavior found only in tag `1.0`, `docs/history/` or older tags.
- Scenarios tagged `@accepted-risk` are expected to fail on purpose. Don't fix them
  unless asked, and never add, remove or edit these tags. That is a human
  freeze decision.
- If the accepted-risks suite reports a `STATE CHANGE`, say so at the top of your
  final report: the risk ID, the old and new state, and the tree. Don't bury it
  in the suite table.

## 7. Proving it works (calibration, same discipline as SEC-01/ENG-02)

Before freezing, on a scratch copy, plant each of these and confirm it is caught:

| Plant | Expected catch |
| --- | --- |
| `{ skip: someCondition }` in a protected test | guard |
| `@pending` on a scenario | guard |
| `@accepted-risk` without `@review:` | guard |
| `@review:` date in the past | guard |
| `@risk:REV-999` (no such record) | guard |
| Reservation re-adds `DELETE /api/pets/{petId}/visits/{visitId}` | features suite (retired scenario) |
| An accepted-risk scenario starts passing | accepted-risks suite reports `STATE CHANGE` (suite output, run record, summary banner) |

## Open questions for Dustin

1. ~~Are accepted risks tied to a particular build?~~ **Decided 2026-10-07: no.**
   Build-scoping tags like `@build:python` would be unverifiable free text, and
   risks also depend on databases, libraries and cloud, not just language. A
   risk applies to whatever is built. A pass is reported as an explicit
   `STATE CHANGE`, not a failure (see §3).
2. **Initial scope:** ship the guard and runner changes with only the D-24
   retirement example, and leave the REV-001 accepted risk (which needs the stub
   change) for later? Or do both now?
3. **Expiry warning:** is 14 days before the review date the right lead time?

## Implementation (as drafted, 2026-10-07)

### Files

| File | Change |
| --- | --- |
| `spec/guard/guard.js` | Wider skip scan, now including `spec/harness/`. New `scanTags()` validates tags, references and expiry. |
| `spec/guard/check.js` | Prints the accepted-risk register and review warnings on every run. Fails on invalid or expired tags. |
| `spec/guard/accepted-risks.js` and `accepted-risks.cucumber.cjs` | New suite. Runs only `@accepted-risk` scenarios and classifies each result. |
| `spec/cucumber.cjs` | `tags: "not @accepted-risk"` on both profiles |
| `spec/test-policy.json` | `accepted-risks` added to the full tier and to the `services/{service}/` rule |
| `spec/run-all.js` | Passes the tree hash to suites (`PETCLINIC_TREE`). Records `stateChanges` and prints a banner after the gate line. |
| `spec/harness/stub-server.js` | `fault(method, path, "reset" \| "hang", { times })`: transport failures the contract can't declare |
| `spec/tests/harness/stub-faults.test.js`, `guard.test.js` | Self-checks for the faults, the scan and the tag rules (harness suite 45 → 50) |
| `spec/tests/steps/checkout.steps.js`, `common.steps.js` | New steps for the dropped connection, unasserted pay, the retired endpoint, and the response status |
| `spec/features/checkout/payment-idempotency.feature` | REV-001 accepted-risk scenario |
| `spec/features/reservation/retired.feature` | D-24 retirement scenario |
| `AGENTS.md` | Rules for `@retired`, `@accepted-risk` and `STATE CHANGE` |

### Differences from the design above

- **`@source:` tag.** REV IDs repeat across reviews (each review starts at REV-001),
  so a REV risk also names its review file: `@source:eng-02-review-r4-python-2026-10-07`.
  D-nn risks don't need it.
- **Three result states, not two.** Besides ACCEPTED and STATE CHANGE, a scenario
  that fails before its `Then` steps (setup or hook failure), or has an
  undefined, ambiguous or pending step, is an **ERROR** and fails the suite. It
  never tested the risk, so its failure proves nothing.
- **Ongoing reporting.** The transition is printed once as `STATE CHANGE`. Every
  later run where the scenario still passes prints `NOT REPRODUCING … passing since
  <time> on tree <hash>; tag still in place`. Both go into the run record's
  `stateChanges` and the closing banner, so the message keeps appearing until a
  human removes the tag. Per-scenario history is kept in
  `test-results/accepted-risks/latest.json`, which is local and gitignored.
- **The full tier now has 11 suites.** Older records and prompts that say "ten
  suites" describe the earlier policy.

### Results on the JavaScript build (sandbox)

- Harness 50/50. Features 285/285 (284 plus the retired scenario; the accepted risk
  is excluded). Workflows 11/11.
- REV-001 **passes** on JavaScript, so the suite reports `STATE CHANGE failing →
  passing`. That's expected: the JavaScript catch-all prevents the double charge.
  It hasn't been run against r4's Python Checkout, where it should report ACCEPTED.
  The sandbox can't run that build.
- The JavaScript platform already refuses to register a route missing from the
  contract (`services/platform/runtime.js:273`). So the retirement scenario mainly
  protects rebuilds that don't use the shared platform, such as the Python
  Checkout or any new language.

### Calibration (scratch copy, all caught)

| Plant | Caught by |
| --- | --- |
| `{ skip: Boolean(process.env.CI) }` in `common.steps.js` | guard: skipped tests |
| `@pending` on a cancel-reservation scenario | guard: skipped tests |
| `@accepted-risk` without `@review:` | guard: invalid tags |
| `@review:2026-01-01` (expired) | guard: invalid tags |
| `@risk:REV-999` (not in the review file) | guard: invalid tags |
| Reservation answers `DELETE /api/pets/{petId}/visits/{visitId}` with 200 | features: only the retired scenario failed (284 passed, 1 failed) |
| Accepted risk failing in a `Then` / failing in setup / undefined step | ACCEPTED / ERROR / ERROR |

### To finish

1. Dustin reviews the diff and runs `npm --prefix spec run guard:freeze`.
2. Run `npm test` locally (the full tier, now 11 suites).
3. On a Python Checkout workspace with these specs, confirm REV-001 reports
   ACCEPTED.
