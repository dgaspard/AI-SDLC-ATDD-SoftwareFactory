# ENG-02 calibration — round 1 (2026-10-05)

ENG-02 item 5. Answer key: [`tools/review/project-specific/calibration-manifest.md`](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/tools/review/project-specific/calibration-manifest.md)
(committed in `3a13746`, before any review ran). Plant script:
`plant-calibration-defects.mjs` (same folder). Raw reviewer output:
[eng-02-calibration-review-round1-2026-10-05.md](eng-02-calibration-review-round1-2026-10-05.md).

**Status: all layers scored.** L1 network gates were run locally by Dustin
(`run-calibration-gates.sh`; Semgrep 1.179.0, detect-secrets 1.5.0, jscpd
5.4.0). Raw output is in `test-results/eng-02-calibration/` (gitignored).
Semgrep reported 15 internal matching errors on the `cryptojs-weak-algorithm`
rule, the same in both scans; they don't affect any CAL row. detect-secrets
found nothing in either scan.

## Setup

- **Target:** `main` at `f86ac60`, copied without `.git`, the answer key, or
  the plant script. 13 defects planted at once for the reviewer.
- **L0 frozen tests:** schema, harness, runtime, auth, observability, BDD,
  and workflow suites. Browser and performance suites were not run (no
  Chromium in the sandbox; neither suite is designed to catch these defects).
  Run first with all 13 planted. Every failing test was then rerun with
  its suspected defect planted *alone* to confirm attribution. Auth and
  `business-traces` were chunked by test name to fit the sandbox's ~3-minute
  command limit.
- **L1 gates:** the import-boundary check and `tools/review/project-specific/`
  engineering tests ran in the sandbox. jscpd and Semgrep need network.
- **L2 reviewer:** a fresh general-purpose subagent with no conversation
  history. It was handed the unchanged `review-prompt.md` and told to review
  "a JavaScript build," with no mention of calibration or planted defects.
  It was barred from reading the real repo, and the tree it reviewed had no
  git history to diff against. It took 6.5 minutes and made 31 tool calls.

## Results

| ID | Defect | L0 frozen tests | L1 gates | L2 reviewer |
| --- | --- | --- | --- | --- |
| CAL-01 | Chicago-time helper copied into Checkout | — | **Caught**: jscpd, `checkout/server.js:40-55` ↔ `reservation/server.js:17-32` | **Caught** (REV-015, REV-019). Rated low/note; mis-mapped to REV-006 in its own summary |
| CAL-02 | Payment method reference in span | — (OBS privacy tests pass) | Semgrep: missed | **Caught** (REV-008, high) |
| CAL-03 | Service tokens skip HMAC | **— (gap)** | Semgrep: missed | **Caught** (REV-001, critical; verified live with a forged `alg:none` token) |
| CAL-04 | `!==` instead of `timingSafeEqual` | — | **Missed**: the custom `timing-unsafe-secret-compare-js` rule only matches `==`/`===` on variables named secret/token/signature, and the plant is `s !== expected`. **After hardening (rerun 2026-10-05): caught** by the new `timing-unsafe-digest-compare-js`, `runtime.js:240` | **Caught** (REV-003, medium) |
| CAL-05 | Checkout falls back to the catalog's seed file | Side effect only: 1 BDD scenario ("Unknown performed service") and 2 OBS-029 traces fail because the fallback swallows `unknown_service` | import-boundary: **missed** (expected: data read, not an import) | **Caught** (REV-006, high) |
| CAL-06 | Any veterinarian passes admin-only roster routes | **Caught**: 2 BDD scenarios (confirmed in isolation). *Correction:* AUTH-006 add/update vet fail on clean `main` too (see real-findings #12), so they don't count as catches | — | **Caught** (REV-005, high; verified live) |
| CAL-07 | `reservation.id` dropped from OBS-048 span | — (expected: OBS-048 has no test) | — | **Caught** (REV-014, low) |
| CAL-08 | `/availability` ignores `active` | **Caught**: BDD "A deactivated veterinarian offers no availability" | — | **Caught** (REV-011, medium) |
| CAL-09 | `new RegExp(userInput)` | — | **Caught**: Semgrep `detect-non-literal-regexp`, `customer/server.js:100` (this rule also fires on the clean build's route regex, `runtime.js:269`) | **Caught** (REV-013, medium; verified live) |
| CAL-10 | Reflected CORS + credentials | **Caught**: RT-006 × 4 services | Not a real catch: `cors-misconfiguration` fires on the *clean* build's exact-match origin check too (`runtime.js:439`), so it can't tell safe CORS from broad CORS | **Caught** (REV-004, high; verified live) |
| CAL-11 | `/internal/*` skips auth from loopback | **Caught**: AUTH-005/006 on all 4 internal operations | — | **Caught** (REV-002, critical; verified live) |
| CAL-12 | `incompleteBills` guard removed | — | **Caught**: `engineering-review.test.mjs` test 4 | **Caught** (REV-007, high) |
| CAL-13 | Rejected bearer token logged | — | Adjacent only: Semgrep `unsafe-formatstring` flags the new `console.error` (format-string reason, not secret leak). The custom `secret-logged-js` rule missed it because the variable is named `header`. **After hardening: caught** by `secret-logged-js`, `runtime.js:276` | **Caught** (REV-012, medium; verified live) |

**Catch rates:**

- **L2 reviewer:** 13/13 (100%) on the first round. Under the agreed rule, no
  rerun was needed.
- **L0 frozen tests:** 4/13 caught directly (CAL-06, 08, 10, 11), plus 1
  side effect (CAL-05).
- **L1 automated gates:** 3/13: CAL-01 (jscpd), CAL-09 (Semgrep), and
  CAL-12 (engineering test). CAL-13 was only flagged for an unrelated reason
  (adjacent). CAL-10's CORS rule fires on safe and unsafe code alike, so it
  doesn't count.
- **L1 after hardening the two custom rules (rerun 2026-10-05): 5/13.** CAL-04
  and CAL-13 are now caught as well. The rules' own tests pass 6/6, and the
  clean scan has the same 7 findings as before, so the hardening added no
  new false positives.
- **Caught by no layer except the reviewer:** CAL-02, CAL-03, and CAL-07
  (before hardening, CAL-04 and CAL-13 were also on this list).
- **Both custom Semgrep rules missed their own defect class** (CAL-04 and
  CAL-13). Each matches on variable *names* (secret, token, signature) and
  on a narrow operator set. Ordinary names like `s`, `expected`, and
  `header` slip through. That is the realistic shape for AI-generated code,
  and the reason SEC-01 rated these rules as catches: its snippets used
  names chosen to match the rule.

## What the numbers mean (and don't)

1. **The reviewer is the only layer that sees boundary and auth-logic
   defects without a test written for them.** CAL-03 is the clearest
   example: no frozen test forges a *service* token with a bad signature.
   The bad-signature tests reuse user-role claims, so an implementation that
   trusts service tokens passes the whole suite. This is a candidate spec
   change (see follow-ups).
2. **Blindness was partial, by design of the prompt.** `review-prompt.md`
   lists the six original calibration classes. The reviewer used that list:
   its summary maps findings to "the six planted defect types." It still
   found the seven defects outside that list (CAL-04, 08, 09, 10, 11, 12, 13),
   so the score doesn't rest on the list. Still, a cleaner blind run would
   hand the reviewer a copy of the prompt with the "Calibration defects"
   section removed.
3. **Severity calibration is weaker than detection.** CAL-01 (duplicated
   logic) was rated low/note, and CAL-04 (timing-unsafe compare) medium. Both
   are defensible but not what the manifest's framing implies. Severity
   wasn't part of the pass criterion. Worth deciding whether it should be.
4. **One reviewer, one round, one model.** This is n=1. It shows the checklist
   *can* catch all 13. It doesn't show it reliably will. A second blind
   round, on the revised prompt, would test repeatability.
5. **The reviewer found real issues the plants didn't introduce, and missed
   one.** It independently found PRE-01 (the OBS-047 attribute, in REV-014).
   It did not find PRE-02 (path injection into service-token calls), which I
   noticed while planting. The checklist now has an item for that shape.

## Checklist changes made (`review-prompt.md`)

There was no miss to fix, but the reviewer's own suggestions and the PRE-02
gap were worth adding:

- §3: no auth decision based on peer address, loopback, or Host/Origin headers.
- §3: CORS must match RT-006 exactly. Check it together with the item above.
- §3: request-supplied values must not be interpolated into service-token
  URLs, `RegExp`, or shell/query strings (the PRE-02 shape).
- §2: after a partial failure, can a retry *finish the job*? (From REV-009,
  REV-010, and the second half of REV-007, all of which are real on `main`.)
- §2: is every anti-double-charge guard actually read?
- §4: logs count as telemetry: no tokens or secrets in `console.*`.
- Gate command fixed: `npm --prefix spec run guard:check` (the root script
  doesn't exist).

## Real findings on `main` (not planted) — need your triage

Surfaced by the reviewer or by the calibration runs. All were confirmed
against `main` by reading the code; none were fixed here.

| # | Finding | Source | Notes |
| --- | --- | --- | --- |
| 1 | **Guard is red on `main`:** 11 protected files changed since the last freeze | REV-020; reproduced on the real repo | **Resolved 2026-10-05:** reviewed and re-frozen by Dustin. |
| 2 | **2 observability tests fail on `main`:** `[OBS-043] register emits registered/validation_error` return 502 | Calibration baseline run | Customer's REV-004 fix now calls Reservation `/veterinarians` during registration; REV-004 stubbed `/veterinarians` in `customer.steps.js` only, not in the shared `ServiceFixture`. **Resolved 2026-10-05:** Dustin added the stub to `programStubs()`. OBS-043 now passes 2/2 and BDD 267/267. |
| 3 | PRE-01: OBS-047's `veterinarian.active` attribute is never set; OBS-046's outcome is `added`, but the contract says `created` | Manifest + REV-014 | **Resolved 2026-10-05:** contract wins. OBS-046–048 tests went red (`d8db757`) and then green (`5e6f51d`). `validation_error` was dropped from OBS-046/047 (`18dbf15`). |
| 4 | PRE-02: decoded path params flow into service-token downstream URLs | Manifest (reviewer missed) | **Fixed 2026-10-05 (`305c121`):** probed, then mitigated. Path params are validated against their contract `uuid` schema and return 404. See THREAT-04: no frozen test yet, so a rebuild can reintroduce it. |
| 5 | An authorized payment whose credit failed can't be finished by a retry | REV-009 | **Accepted and disclosed** as THREAT-03 (PROJECT-PLAN excludes automated recovery). |
| 6 | Promotion to $0 followed by a failed `complete()` strands the reservation | REV-010 | **Accepted and disclosed** as THREAT-03. |
| 7 | A partial finalize failure blocks the bill permanently (the `incompleteBills` guard prevents a double charge, but nothing recovers) | REV-007 second half | **Accepted and disclosed** as THREAT-03. |
| 8 | Checkout's `assignedVets` snapshot ignores later reassignment | REV-016 | **Resolved 2026-10-05:** two workflow scenarios went red (`d8db757`) and then green (`5e6f51d`). Checkout now asks Reservation for the visit's current veterinarian; the `assignedVets` cache was removed. |
| 9 | The `roles` claim accepts `"service"` | REV-017 | Backlog (low). Defense in depth only. |
| 10 | `dependency()` passes downstream 4xx codes through to callers | REV-018 | Backlog (low). |
| 11 | Booking fee hardcoded in 4 places | REV-019 | Leave as is. The fixed $20 fee is a business decision. Revisit only if the fee becomes configurable. |
| 12 | **2 auth tests fail on clean `main` since MVP-02A (`04d383f`):** `[AUTH-006] reservation.add/updateVeterinarian: veterinarian role returns 403` | Found 2026-10-05 while verifying REV-016; reproduced on `f86ac60` | `access-control.test.js` uses `avery.taylor` as its "veterinarian" actor, but Avery is the dual-role administrator, so the admin-only routes correctly return 201. A test bug, not a code bug. **Resolved 2026-10-05:** at Dustin's request, the actor is now `morgan.reed`, and all 6 AUTH-006 veterinarian-role tests pass. With a non-admin actor, these tests should now also catch CAL-06 at L0. These went unseen because the auth suite takes about 10 minutes and wasn't being run in full. |

## Follow-ups

- **Harden the two custom Semgrep rules** (`tools/security/portable/semgrep-rules/`,
  CODEOWNERS-reviewed):
  - **timing compare:** add `!=`/`!==`, and match comparisons whose operand
    comes from `createHmac(...).digest(...)` rather than relying on variable
    names.
  - **secret-in-log:** flag any `console.*` argument that's `req.headers.authorization`
    or a value derived from it.
  - **Re-run** `run-calibration-gates.sh` to confirm.
  - **Done 2026-10-05 (`52252a6`):** both are now caught, rule tests pass 6/6,
    and the clean scan gained no new findings.
- **Revisit SEC-01's 5/8 headline.** Two of its five catches came from these
  name-matching rules, applied to snippets whose names happened to fit.
- **Spec gap (your call, protected):** add an AUTH-005 case that forges a
  `role: "service"` token with a bad signature against each internal
  operation. This would have caught CAL-03 at L0.
- Optional round 2: a fresh blind reviewer on the revised prompt, with the
  calibration-classes section stripped from its copy, to test repeatability
  and the new PRE-02 item.
