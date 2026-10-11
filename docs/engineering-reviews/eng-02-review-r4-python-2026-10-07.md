# ENG-02 independent review: r4 Python Checkout

Date: 2026-10-07. Reviewer: a fresh agent session with no memory of building this
code, following `tools/review/review-prompt.md`. The review was read-only. Nothing
under r4 or this repo was edited except this file.

Code under review: `services/checkout/` in the r4 rehearsal workspace
(`~/petclinic-demo-runs/r4/`). That is 10 Python modules, 1,250 lines including
README and requirements. `.venv/` and `__pycache__/` were ignored. Every
file:line below refers to r4 (`r4/services/checkout/checkout/*.py`) unless it
says otherwise. The other r4 services (Customer, Reservation) and the frozen
specs were read to check the contracts Checkout depends on.

## Summary

| Severity | Count | IDs |
| --- | --- | --- |
| critical | 1 | REV-001 |
| high | 1 | REV-002 |
| medium | 2 | REV-003, REV-004 |
| low | 4 | REV-005, REV-007, REV-008, REV-010 |
| note | 3 | REV-006, REV-009, REV-011 |

The most important result: **a transport-level failure after the provider has
authorized a payment is not recorded under the idempotency key.** That covers
Customer or Reservation being down, too slow (more than 8 s), or resetting the
connection. A retry with the same key then charges the card again (REV-001).
The frozen tests miss this because they inject failures only as HTTP 409
refusals. The JavaScript build was protected against it by a catch-all. The
builder's disclosed stuck-finalization case is **confirmed** (REV-002). I also
found three more stuck shapes.

### Checklist sections at a glance

| Section | Result |
| --- | --- |
| 1. Service boundaries | **Followed.** No store access and no copied rules. One judgment call: Checkout leans on Customer's dedupe instead of a local guard (REV-003). |
| 2. Payment safety | **Not followed.** REV-001 (duplicate charge on a same-key retry), REV-002 and REV-004 (stuck, retry can't finish), REV-003 (missing local guard). Integer cents, optimistic mutation and guard-comment accuracy are followed. |
| 3. Inter-service authentication | **Followed**, with low and note items (REV-005, REV-006, REV-007). No new THREAT-01/02 instance. THREAT-04 is avoided. |
| 4. Privacy in telemetry and errors | **Followed.** |
| 5. Structure | **Mostly followed.** REV-008, REV-009, REV-010 and REV-011 are low or note. |

## Gates: run vs not run

| Gate | Result | Notes |
| --- | --- | --- |
| `npm run test:engineering` (r4) | **Ran. 3 pass, 7 fail. Every failure is environmental.** | Passing: import boundaries, resource-ID ownership, appointment-on-the-hour. 3 Checkout tests failed with "Checkout exited during startup ... virtual environment missing; run ./setup first": r4's `.venv` points at `/Library/Frameworks/Python.framework/.../python3.12` (macOS), and this sandbox has Python 3.10 and no network for `./setup`. 4 frontend tests failed because Playwright's Chromium isn't installed here. **Prediction from reading the code: `engineering-review.test.mjs:82` ("uncertain bill creation cannot issue a second account charge") will FAIL against this Python build on the host. See REV-003.** Tests `:12` and `:40` should pass (`server.py:166-167`, `billing.py:229`). |
| `npm --prefix spec run guard:check` | **Ran. PASS.** | "protected specs and tests match the frozen manifest; no skipped tests." |
| `npm run trace:payment` | **Not run** | Needs the Python Checkout process, and the macOS `.venv` can't run here. |
| `npm --prefix services/platform audit` | **Not run (attempted)** | `403 Forbidden ... Connection blocked by network allowlist`. It also covers only the JS platform, not Checkout's Python dependencies. |
| `pip-audit` (`tools/security/portable/run-dependency-audit.sh`) | **Not run** | pip-audit isn't installed and PyPI is blocked (`pip install` failed with `ProxyError ... 403 Forbidden`). |
| Semgrep (`run-sast.sh`), Bandit | **Not run** | Not installed. Network blocked. |
| jscpd (`run-dupe-check.sh`) | **Not run** | Needs `npx --yes jscpd`. Network blocked. |
| detect-secrets (`run-secret-scan.sh`) | **Not run** | Not installed. I grepped by hand instead: no secrets or tokens in Checkout source, and `AUTH_TOKEN_SECRET` is read only from the environment (`config.py:41`). |
| Python lint/format (ruff, flake8, pyflakes, mypy) | **Not run (none configured, none installed)** | See REV-010. As a stand-in, I parsed and compiled every module in memory with `ast` (all compile, no unused imports). |
| Behavioral suites | Not rerun, as instructed | Already passed on the host: 10/10 suites, 977 tests. |
| **Reviewer's scratch harness (not a project gate)** | **Ran** | I couldn't start the service, so I imported the real `billing.py` and `auth.py` in the sandbox. `telemetry` was stubbed with no-ops because `opentelemetry` isn't installable. Dependencies were replaced with a fake that copies Customer's documented ledger rules (`customer.openapi.json:623`, `r4/services/customer/server.js:179-208`): one charge per visit, one credit per `paymentId`, one discount per entry. It ran with `python3 -B -I` and wrote no bytecode into r4. It confirmed REV-001, REV-002, REV-004 and REV-005 at runtime. The output is quoted in those findings. The script lived only in the sandbox's `/tmp` and was not saved to the repo. |

## Checklist walkthrough

### 1. Service boundaries: followed

- State is owned locally. All bills, idempotency records and paid booking fees
  live in `Billing` (`billing.py:98-103`). Every other service is reached only
  through HTTP (`dependencies.py:1-5`, `24-90`), with a Checkout service token
  (`dependencies.py:25`). `SEED_DATA_DIR` is required by the runtime contract
  but never read (`config.py:24,42`; grep finds no other use). The CAL-05 "fall
  back to the catalog seed file" shape is absent.
- There is no copied business logic. Fees come from VeterinarianServices on
  every finalize (`dependencies.py:66-78`). The visit's *current* veterinarian
  comes from Reservation on every billing action (`billing.py:128-132`,
  `300-304`), as D-66 requires, so JS REV-016's `assignedVets` snapshot isn't
  repeated. Reservation decides its own state transition: Checkout sends only
  `financialOutcome` (`dependencies.py:43-53`).
- Judgment call: Checkout has no local "uncertain write" guard on finalize. It
  relies on Customer's contracted `409 already_applied` charge dedupe to prevent
  a double ledger charge. See REV-003.

### 2. Payment safety: not followed

**End-to-end trace (card visit payment):** `POST /checkouts/{id}/payments`.
Routing, auth, schema and key validation happen at `server.py:73-75`,
`160-170`. Then `Billing.pay_by_card` runs (`billing.py:200`) and takes the
per-checkout lock (`:202`). It checks ownership (`:203`), then the idempotency
record (`:206-209` → `_replay` `:333-344`), then the amount (`:210`). Next it
calls the provider (`:214` → `dependencies.py:81-90` → `telemetry.py:143-205`)
and appends the attempt to the bill (`:219`). It then sends the Customer credit
(`:221` → `_credit_and_complete` `:324-327` → `dependencies.py:56-63`), updates
the bill locally only after a 200 (`:328`), and completes the Reservation
(`:330` → `dependencies.py:43-53`). The result is recorded under the key
(`:229-231` → `_remember` `:347-357`).

| Item | Result |
| --- | --- |
| Local mutation before downstream confirmation | **Followed.** `visit_paid_amount` changes only after Customer returns 200 (`billing.py:324-328`). The promotion is attached only after the discount call returns 200 (`:183-190`). JS REV-001/REV-002 are not repeated. |
| Retry causes duplicate charge/credit | **Not followed.** On a status refusal, the frozen D-63 path works. On a transport failure, a same-key retry authorizes again (REV-001). Concurrent retries are serialized by `KeyedLocks` (`billing.py:72-84`), but serializing doesn't help when nothing was recorded. |
| Integer cents, no float arithmetic | **Followed.** Validation rejects fractional numbers (`validation.py:17-25`). Amounts are `int()`-coerced (`billing.py:180,205,240,278`). No division, `round` or `float` appears in money code. The booking-fee fingerprint compares `2000 == 2000.0` as equal, so it is safe. Upstream fee amounts aren't coerced (REV-011, note). |
| Provider success then downstream failure reported accurately | **Not followed for transport failures.** It is reported as plain `502 dependency_failed` with no `paymentAttemptId` (REV-001). Status refusals are reported correctly as `authorized_completion_failed` (`billing.py:224`, `349-350`). |
| Can a retry finish the job after a partial failure? | **Not followed.** The builder's case is confirmed, and I found more (REV-002, REV-004). |
| Guards that comments claim protect are actually read | **Followed.** I checked `billing.py:182`, `:322`, `dependencies.py:44,57`, `KeyedLocks` (`:73`) and `_paid_booking_fees` (written at `:295`, read at `:268`). Each guard is read on the path it protects. One documentation-only exception: the README says a failed follow-up is "reported as `authorized_completion_failed` and replayed as-is" (`README.md:31-32`). That holds only for status refusals, not transport failures (REV-001). |

### 3. Inter-service authentication: followed (low and note items)

The verification code (`auth.py:57-102`) was also exercised directly with
crafted tokens.

| Item | Result |
| --- | --- |
| Signature verified before claims are trusted, on every authenticated route | **Followed.** Every non-`/health`, non-`/test/*`, non-`OPTIONS` route goes through `tokens.verify` (`server.py:160`) before the role check and handler. No route opts out. The header and payload are JSON-parsed before the signature check (`auth.py:66-67`), but no claim is *used* until after it (`:70-73`). |
| Constant-time compare | **Followed.** `hmac.compare_digest` (`auth.py:70-71`). A signature with a trailing `=` is rejected (exact string compare). |
| Algorithm pinned | **Followed.** `alg != "HS256"` is rejected (`auth.py:68-69`). Tested: `alg: none` returns 401. |
| `exp`/`sub`/`role` validated | **Mostly followed.** `exp` must be numeric, not a bool, and later than now. `sub` must be a non-empty string. `role` must be in the allowlist (`auth.py:84-87`). A signed `exp` of `NaN` or `Infinity` is **accepted** (REV-005). |
| `roles` validated like `role` | **Followed** against the same allowlist (`auth.py:88-90`). Same defense-in-depth gap as JS REV-017: `"service"` is accepted inside `roles`. Minor inconsistency in how primary and secondary roles are read (REV-006). |
| Every route checks role | **Followed.** `server.py:57-79` matches `checkout.openapi.json` `x-roles` exactly for all 8 operations (checked by script). The generic check is at `server.py:161-162`. The admin bypass appears only where D-41 grants it (`billing.py:303`, used by promotion and cash). Finalize has none (`billing.py:131`). |
| Location-based trust | **Followed.** None. `/test/*` is gated only by `PETCLINIC_TEST_ENDPOINTS` (`server.py:178`), the same as the runtime contract. |
| CORS matches RT-006 | **Followed.** Exact-match allowlist with `Vary: Origin` and no credentials header (`server.py:195-200`). The preflight returns 204 (`server.py:149-150`). |
| Request values interpolated into service-token URLs (THREAT-04) | **Followed. THREAT-04 is avoided in the Python build.** Every path param must match the UUID regex, or the route returns 404 before the handler runs (`server.py:168-170`). `self.path` is not percent-decoded, so `%2F` fails the regex. Downstream URLs also `quote()` the value (`dependencies.py:38,41,46,59`). Note: `quote()` defaults to `safe="/"`, so it would not escape `/` if a non-UUID ever got through. `safe=""` would be stricter. No regex, shell or SQL use of request data (grep). |

### 4. Privacy in telemetry and errors: followed

- **Span attributes:** I checked every `annotate()` call (`billing.py`) and
  every attribute set in `telemetry.py`. They carry only IDs, booleans,
  outcomes and cent amounts. `mockMethodReference` is sent to the provider in
  the request body but never set as an attribute (`telemetry.py:161-167`).
  `url.full` drops the query string (`telemetry.py:159`). OBS-021 still holds.
- **Error bodies:** `Problem.body()` returns only type, title, status, code and
  deliberate extras (`problems.py:11-12`). Unexpected exceptions become a
  constant `internal_error` (`server.py:129-132`), as D-60 requires.
  Downstream 4xx codes are not passed through, apart from the contracted
  `unknown_service` and `not_found` (`dependencies.py:29-33`, `69-73`), so JS
  REV-018 is avoided.
- **Logs:** the request line (`server.py:109-110`), dependency warnings
  (`dependencies.py:32,52,62,88`, `telemetry.py:200`) and the traceback on an
  unexpected error (`server.py:130`) contain no headers, tokens or payment
  method details. `traceback.format_exc()` doesn't include local variables.
- **404 vs 403:** customers get 404 for another customer's checkout
  (`billing.py:106-110`), and the list is filtered rather than refused
  (`:119-122`). Veterinarians get 403 `not_assigned_veterinarian`, which the
  contract allows.
- **OBS-008 (JS exporter crash):** doesn't apply in the same form. Python
  exports from a `BatchSpanProcessor` background thread
  (`telemetry.py:50-52`), and an uncaught exception in a non-main thread
  doesn't end the process. The test-only `threading.excepthook`
  (`__main__.py:26-31`) only changes logging.

### 5. Structure: mostly followed

- Hardcoded values: the booking fee `2000` appears once (`validation.py:43`)
  and is a contract `const` (`checkout.openapi.json:554`). Finalize reads the
  fee from Reservation (`billing.py:143`). Not flagged (consistent with JS
  REV-019's disposition).
- Duplicate payment paths: card and cash share `_visit_attempt`,
  `_credit_and_complete`, `_replay` and `_remember` (`billing.py:314-357`). No
  duplication.
- Outcome control flow: readable and returned close to where it is computed.
  The one hidden branch is REV-001: a `Problem` raised deep inside
  `telemetry.call` skips the outcome logic in `pay_by_card` and `record_cash`.
- Flags written but never read: checked `promotion` (read `billing.py:175`),
  `bookingFeePaid` (`:144`), `reservationState`/`visitId` (`:136`) and
  `_paid_booking_fees` (`:268`). All are read. Veterinarian `active` belongs to
  Reservation and has no Checkout path. Disclosed attribution gap: REV-008.

## Findings

### REV-001: A transport failure after authorization escapes the idempotency record, so a same-key retry charges the card again

- **Category:** §2 Payment safety.
- **File:line:** `billing.py:214-231` (`pay_by_card`), `billing.py:247-256`
  (`record_cash`), `billing.py:319-330` (`_credit_and_complete`),
  `dependencies.py:24-25,43-63`, `telemetry.py:199-205`. The resulting report
  is at `server.py:124-128`.
- **What I found:** `apply_account_change` and `complete_reservation` return
  `False` only when the dependency *answers* with a non-200 status. If the call
  fails at the transport level (connection refused, reset, or the 8 s timeout
  at `telemetry.py:34,178`), `telemetry.call` **raises**
  `Problem(502, "dependency_failed")` (`telemetry.py:199-205`). Nothing in
  `_credit_and_complete` or `pay_by_card` catches it. By that point the
  provider has already authorized (`billing.py:214`) and the attempt is already
  on the bill (`:219`). The exception skips `_remember` (`:229`), so **no
  `Recorded` entry is stored for the key**. As a result:
  1. The response is `502 dependency_failed` with no `paymentAttemptId`. The
     business span records outcome `failed` (`server.py:126-128`), not
     `authorized_completion_failed`. Money was taken, but neither the caller
     nor the trace reports it (against D-10 and the payVisitBalance contract
     at `checkout.openapi.json:370`).
  2. A same-key retry finds no record (`billing.py:207`), passes
     `_check_amount`, and **calls the provider again** with a new attempt ID.
     This breaks D-12 and D-63 ("the same-key retry returns the identical 502
     ... without authorization, credit, or completion retries").
  3. Partial payment where completion fails at the transport level: the credit
     has already landed (`:328`), so the retry authorizes **and credits** again.
     The customer pays twice for one intended payment.
  4. Cash (`record_cash`) has the same root cause. A retry adds a second
     `cash_recorded` attempt to the bill, though only one was ever credited.

  Confirmed with the scratch harness against the real `billing.py` (fake
  Customer that follows its contract):

  ```
  C. card pay: credit transport failure, same-key retry
   1st: (502, 'dependency_failed') auths: 1
   same-key retry: 200 replayed=False auths: 2 attempts on bill: ['authorized', 'authorized']
  C2. same, but status refusal (what the frozen tests cover)
    502 authorized_completion_failed | retry 502 authorized_completion_failed auths: 1
  D. partial card pay ($20 of $50): credit ok, complete transport failure, same-key retry
   same-key retry: 200 auths: 2 visit_paid: 4000   (ledger credited 2000 twice)
  G. cash: credit transport failure, same-key retry
   retry: 200 attempts: ['cash_recorded', 'cash_recorded']
  ```

  **Why the gates missed it:** every frozen failure injection is an HTTP 409
  refusal (`spec/tests/steps/checkout.steps.js:60-61`, `99-107`), which goes
  down the `return False` path. No frozen test makes Customer or Reservation
  unreachable *after* authorization.
  `tools/review/project-specific/engineering-review.test.mjs:40` also uses a
  409. The JS build was immune: it stored the attempt record before
  authorizing and wrapped every later step in a catch-all that recorded
  `authorized_completion_failed` (main repo `services/checkout/server.js:347-348`,
  `377-389`).
- **What it takes to trigger it:** no attacker is needed. Customer or
  Reservation has to be down, restarting, or slower than 8 s while a customer
  pays, and the client (or the frontend, or the user pressing "Pay" again)
  then retries with the same key. That is exactly the retry idempotency keys
  exist to make safe.
- **Severity:** critical. A duplicate card authorization on an
  idempotent retry is the defect the payment-safety section exists to catch.
- **Needs human sign-off?** Yes (payment safety).
- **Suggested fix:** in `pay_by_card` and `record_cash`, once the money step
  has been accepted, wrap `_credit_and_complete` (and the decline-path
  `complete_reservation`) in `try/except Problem`. Treat a raised Problem the
  same as a `False` return: outcome `authorized_completion_failed`, and always
  go through `_remember`. A more robust alternative is to have
  `dependencies.apply_account_change` and `complete_reservation` catch the
  transport `Problem` and return `False`. Also consider recording a
  placeholder for the key *before* calling the provider, as the JS build did,
  so a crash mid-flight can't leave the key unrecorded. A frozen scenario
  should cover "Customer unreachable after authorization; same-key retry
  doesn't call the provider". That needs spec authorization, because it would
  be a new protected test.

### REV-002: Finalization (and two other paths) get permanently stuck after a partial failure. The builder's disclosed case is confirmed.

- **Category:** §2 Payment safety ("can a retry finish the job").
- **File:line:** `billing.py:133-134,150-160` (finalize),
  `billing.py:163-164`, `billing.py:221-224` with `:310`, and `:194-195`.
  Customer's dedupe is at `r4/services/customer/server.js:179-181`. Checkout's
  rule that `already_applied` counts as failure is at `dependencies.py:57-63`.
- **What I found:**
  - **Builder's case: confirmed.** Finalize sends the account charge (`:150`).
    Customer records it and returns 200. Then the booking-fee credit (`:154`)
    is refused, and `:157` raises `dependency_failed` before the bill is saved
    (`:159-160`). On retry, `visit_id` is not in `_checkout_by_visit` (`:133`),
    so finalize rebuilds the bill and charges again (`:150`). Customer returns
    `409 already_applied`, because it allows one charge per visit
    (`customer/server.js:180-181`, contracted at `customer.openapi.json:623`).
    `apply_account_change` treats that as failure (D-64), so the response is
    502. Every later retry does the same, and no bill can ever be created for
    the visit. Customer's ledger is left showing the full total owed (booking
    fee included) with no booking credit. The customer appears to owe the $20
    they already paid. Harness:
    ```
    A. booking-fee credit fails at finalize
     1st: (502, 'dependency_failed')  retry: (502, ...)  retry: (502, ...)
     ledger: {owed: 7000, cred: 0}  bills: 0
    ```
  - **Lost-response variant:** Customer applies the charge but the reply
    times out (`telemetry.py:199-205`). The outcome is identical (harness case
    B).
  - **Full payment with a failed completion:** the credit succeeds and the bill
    reaches $0 (`:328`), but Reservation refuses completion. The result is
    `authorized_completion_failed`, which is honest. A same-key retry replays
    it. A new key gets `409 already_settled` (`:309-310`), and a promotion gets
    `nothing_owed` (`:178-179`). Nothing in Checkout can ever ask Reservation
    to complete again, so the reservation stays at `Accepted`. Harness case E:
    `new key: (409, 'already_settled') | promo: (409, 'nothing_owed') | reservation completion: None`.
    Cash (`:253`) behaves the same way.
  - **A $0 bill at finalize with a failed completion** (`:163-164`): the bill
    is saved first, the completion fails with a 502, and a retry gets
    `409 already_finalized` (`:133-134`). Stranded. This is only reachable
    when the billed lines total $0.
  - **Promotion to $0 with a failed completion** (`:194-195`): the same shape
    as THREAT-03's second case, repeated as specified by D-59.
- **Relation to the threat model:** every item is a new **instance of
  THREAT-03** ("reported honestly but can't be finished by a retry"), not a
  new risk class. The finalize mechanism is different from the JS build,
  though. JS blocked the retry with its own `incompleteBills` guard; Python is
  blocked by Customer's dedupe. THREAT-03's text describes the JS mechanism,
  so it should be updated to cover this build.
- **Severity:** high. Money handling stays honest, but operations get stuck
  without manual recovery, and in the finalize case the customer ledger is
  wrong.
- **Needs human sign-off?** Yes. The human should either accept these under
  THREAT-03 (and update its wording) or require a fix.
- **Suggested fix:** for finalize, persist the bill (or a pending marker that
  records which account changes were confirmed) *before* the first account
  change, and resume from the first unconfirmed step on retry. Don't
  recompute and re-charge. For completion failures, let a retry re-send the
  completion when the bill is $0 but the reservation isn't completed. Both are
  behavior changes beyond PROJECT-PLAN's "no automated recovery" scope, so
  this is a product decision. If the human keeps the current behavior, I have
  no better fix to offer.

### REV-003: No local guard against re-charging after an uncertain finalize; the project's own engineering test will fail

- **Category:** §2 Payment safety / §1 boundary judgment.
- **File:line:** `billing.py:133-157`, compared with
  `r4/tools/review/project-specific/engineering-review.test.mjs:82-97` and the
  JS guard (main repo `services/checkout/server.js:207,243,249`).
- **What I found:** Python has no equivalent of the JS `incompleteBills` guard.
  That guard is the CAL-12 calibration shape, which this project's engineering
  test exists to catch. After a finalize fails mid-flight, a retry recomputes
  the bill and sends the account charge again. The test stops Customer, makes
  one finalize request, restarts Customer, and asserts that a second finalize
  sends **zero** requests to Customer. From the code path, Python will send a
  new charge (`billing.py:150`), so I predict this test fails on the host. I
  could not run it here; see the gates table. Customer's per-visit charge
  dedupe (`customer.openapi.json:623`) stops the ledger from being charged
  twice, so this is not a double charge today. But Checkout's safety now
  depends entirely on another service's guard, and when the first charge never
  reached Customer, the "recovery" sends a write the JS design ruled out on
  purpose ("A disconnected Customer may already have applied a write. Never
  blindly retry", test file `:86`).
- **Severity:** medium. No double charge occurs today, but a project gate
  fails and the build quietly drops the design rule.
- **Needs human sign-off?** Yes (payment safety and boundary). Decide which
  rule wins: the engineering test's "never blindly retry", or relying on
  Customer's contracted dedupe. If the second, the test needs updating.
- **Suggested fix:** keep a `_incomplete_visits` set, add to it before
  `:150`, clear it after `:160`, and return 502 early when the visit is in it.
  This would match JS and pass the test, but it also makes REV-002's stuck case
  certain. Fixing REV-002 properly (a persisted pending bill) addresses both.

### REV-004: A promotion whose Customer reply is lost leaves the two services permanently disagreeing, with no way to retry

- **Category:** §2 Payment safety.
- **File:line:** `billing.py:175-190`, `dependencies.py:56-63`,
  `telemetry.py:199-205`. Customer's dedupe is at `customer/server.js:196-199`.
- **What I found:** the REV-002 (JS) fix holds for an explicit refusal, and a
  retry then succeeds (frozen scenario `promotion.feature:41-47`). But if
  Customer *applies* the discount and the reply is lost (timeout or reset),
  Checkout raises before setting `checkout.promotion`. On retry, Checkout sees
  no promotion (`:175`) and sends the discount again. Customer returns
  `409 already_applied` (one discount per entry). Checkout treats that as
  failure (`:185`), so every retry returns 502 forever. The bill never shows
  the discount, while Customer's ledger does. This is exactly the
  "one service's record permanently wrong relative to the service it just
  called" shape in §2, reached through a lost reply rather than an optimistic
  mutation. Harness case F:
  `retry: (502, 'dependency_failed') checkout promo: False ledger: {disc: 1000}`.
- **Severity:** medium. It needs a lost reply, but no attacker.
- **Needs human sign-off?** Yes (payment safety). It is arguably a new
  instance of THREAT-03, which doesn't list it.
- **Suggested fix:** none clean within D-64, because `already_applied` can't
  prove the amount matches. One option: Customer returns the existing entry
  with its 409, and Checkout accepts it when `amountDiscounted` equals the
  amount it sent. That needs a contract change. Otherwise, disclose it under
  THREAT-03.

### REV-005: A signed token with `exp` of `NaN` or `Infinity` never expires

- **Category:** §3 Authentication.
- **File:line:** `auth.py:84` (with `json.loads` at `auth.py:67`, which
  accepts the non-standard `NaN`/`Infinity` literals by default).
- **What I found:** `exp <= now_seconds` is `False` for `NaN`, and `Infinity`
  is never reached, so both pass. Verified: a correctly signed payload with
  `"exp":NaN` or `"exp":Infinity` was accepted. The JS build rejected them
  (`Number.isFinite`, per the impl-02 review). Exploiting it requires the
  shared secret, so this is defense-in-depth adjacent to THREAT-01, not a
  bypass.
- **Severity:** low.
- **Needs human sign-off?** Yes (authentication code).
- **Suggested fix:** require `isinstance(exp, int)` (or `math.isfinite`), and
  parse with `json.loads(..., parse_constant=...)` set to reject non-standard
  constants.

### REV-006: The `roles` claim accepts `"service"` and any length, and visibility reads only the primary role

- **Category:** §3 Authentication.
- **File:line:** `auth.py:88-90`, `auth.py:92-95`, `billing.py:108,121`.
- **What I found:** `roles` may contain `"service"` and may be empty or have
  one entry. The contract says "an array of two or more roles", present only
  for dual-role accounts. This repeats JS REV-017 (backlog, low).
  `customerId`/`veterinarianId` are required only for the *primary* role, so a
  token whose `roles` grants `veterinarian` may have no `veterinarianId`.
  Ownership filtering checks `caller.role == "customer"` while route
  authorization uses `has_role`. A forged mixed token (for example primary
  `veterinarian` with `roles: ["customer"]`) is treated as a veterinarian for
  visibility. Every case needs the shared secret (THREAT-01/02). I found no
  route where an honestly issued token gains anything.
- **Severity:** note.
- **Needs human sign-off?** Yes (authentication), though only to acknowledge
  it.
- **Suggested fix:** restrict `roles` to `{veterinarian, administrator}` with
  length ≥ 2, and require the linked ID for every role present.

### REV-007: The request body is parsed before authentication, and malformed framing is handled loosely

- **Category:** §3/§4 (error paths).
- **File:line:** `server.py:4-5` (the documented order), `server.py:145-148`,
  `server.py:139-142`.
- **What I found:** (a) JSON is parsed before the route or token check, so an
  unauthenticated request with a malformed body gets `400 validation_error`
  instead of `401`. That contradicts the module's own documented order
  (method → token → role → schema). It also means up to 1 MiB is parsed for
  anonymous callers. (b) A non-numeric `Content-Length` raises `ValueError`
  from `int()` and becomes `500 internal_error`, when it should be 400. (c) An
  oversized body is rejected without being read, on an HTTP/1.1 keep-alive
  connection (`server.py:100`). The unread bytes are then parsed as the next
  request on that connection. No auth bypass in any of these.
- **Severity:** low.
- **Needs human sign-off?** No.
- **Suggested fix:** parse JSON after `verify`/role and before `validate`.
  Treat a bad `Content-Length` as 400. Set `self.close_connection = True` when
  rejecting an oversized body.

### REV-008: An administrator-only promotion stores a user ID as `appliedByVeterinarianId`, and the README wrongly says the demo never reaches this case

- **Category:** §5 Structure / data correctness.
- **File:line:** `billing.py:188`, `billing.py:250-251`, `README.md:33-36`,
  `r4/spec/seed-data/users.json:6`.
- **What I found:** for a caller with no `veterinarianId`, the promotion
  records `caller.subject` (a *user* ID) in a field typed as a veterinarian ID.
  Cash recording leaves out `recordedByVeterinarianId`. The README justifies
  this by saying "the seeded administrator is also a veterinarian, so the demo
  never reaches this case". That is false: `riley.chen` is a seeded
  administrator-only account (`users.json:6`, D-52), and D-52 allows that
  account to apply promotions and record cash. The result is a UUID that
  matches no veterinarian. The contract already notes an open attribution
  question (`checkout.openapi.json:451`, which points to
  `docs/design/mvp-02a-admin-roster.md`).
- **Severity:** low.
- **Needs human sign-off?** No. It feeds into the existing open attribution
  decision.
- **Suggested fix:** correct the README now. The field semantics are the
  human's call (for example, a separate `appliedByUserId`).

### REV-009: Unbounded per-key locks, and no socket timeout on request threads

- **Category:** §5 Structure (robustness).
- **File:line:** `billing.py:75-84`, `server.py:82-84,98-100`.
- **What I found:** `KeyedLocks._locks` gains an entry for every
  visit, checkout and reservation and never drops one. That is a slow memory
  leak, and `reset()` (`:98-103`) doesn't clear it. `ThreadingHTTPServer`
  creates a thread per connection, and `Handler` sets no `timeout`, so idle or
  slow-loris connections each hold a thread indefinitely. Acceptable for an
  in-memory local demo (`README.md:28-30` already scopes it to that).
- **Severity:** note.
- **Needs human sign-off?** No.
- **Suggested fix:** a `WeakValueDictionary` or per-key reference counting,
  and `Handler.timeout = <seconds>`.

### REV-010: No Python lint, format, type or security gate is configured

- **Category:** §5 / ENG-01's "language-appropriate code checks".
- **File:line:** `services/checkout/requirements.txt:1-16` and
  `services/checkout/setup:9`. There is no `pyproject.toml`, ruff/flake8
  config or Bandit setup, and the r4 `package.json` `lint`/`format:check`
  scripts cover only `services/**/*.js`.
- **What I found:** ENG-01 requires formatting, lint and static checks "for
  JavaScript and Python". Checkout's Python has none, so no automated gate
  covers about 1,200 lines of payment and auth code. Semgrep's JS rules
  (`timing-unsafe-secret-compare-js`, `secret-logged-js`) don't apply to
  Python either. This review is the only static check this code has had.
- **Severity:** low (process gap).
- **Needs human sign-off?** No.
- **Suggested fix:** add ruff (lint and format) and Bandit as dev
  requirements, plus a `check:python` script. Run pip-audit on
  `requirements.txt` where the network allows.

### REV-011: Some upstream fields are trusted without coercion

- **Category:** §2 / §5 (note).
- **File:line:** `billing.py:141,147` (`feeAmount` is used as returned by
  VeterinarianServices, while the booking fee at `:143` is `int()`-coerced),
  and `billing.py:144,153`.
- **What I found:** (a) A non-integer `feeAmount` from VeterinarianServices
  would flow into `total_amount` and the charge sent to Customer. (b) If
  Reservation ever reported `bookingFeePaid: true` with no
  `bookingPaymentId`, Checkout would count the $20 as paid (`:144`) but send
  Customer no credit (`:153`). The two ledgers would then disagree by $20. Not
  reachable today: Reservation sets both fields together
  (`r4/services/reservation/server.js:231-232`).
- **Severity:** note.
- **Needs human sign-off?** No.
- **Suggested fix:** validate `feeAmount` as an integer (otherwise
  `dependency_failed`). Fail rather than skip the credit when `bookingFeePaid`
  has no payment ID.

## Comparison with the JavaScript ENG-02 review (impl-02, 2026-10-05)

| JS finding | Python r4 |
| --- | --- |
| REV-001: `pay()` mutated the bill before the credit was confirmed | **Avoided.** Credit first, then mutation (`billing.py:324-328`). **But** Python lost what the JS catch-all protected: transport failures now skip the idempotency record (new REV-001, critical). |
| REV-002: promotion set before the discount was confirmed | **Avoided** for refusals (`billing.py:183-190`). A lost reply still leaves the services disagreeing (new REV-004). |
| REV-003: veterinarian `active` never read | N/A. Reservation's rule, no Checkout path. |
| REV-004/005: stale seed copies of another service's data | **Avoided.** Checkout reads nothing from seed (`config.py:42` is unused) and calls VeterinarianServices for fees every time. |
| Calibration REV-007 (`incompleteBills`) / CAL-12 | **Repeated, in a different form.** No local guard at all (new REV-003). The stuck outcome holds via Customer's dedupe (new REV-002). |
| Calibration REV-009/010 (THREAT-03: retry can't finish) | **Repeated.** Every THREAT-03 case recurs, plus the full-payment completion case (new REV-002). |
| Calibration REV-016 (`assignedVets` snapshot) | **Avoided.** Asks Reservation on every billing action (`billing.py:128-132,300-304`). |
| Calibration REV-017 (`roles` accepts `service`) | **Repeated** (new REV-006). |
| Calibration REV-018 (downstream 4xx passed through) | **Avoided** (`dependencies.py:29-33`). |
| THREAT-04 (path params re-target service-token calls) | **Avoided** (`server.py:168-170`). The threat model noted that a Python rebuild could reintroduce it. This one doesn't. |
| OBS-008 (exporter failure crashes the process) | **Effectively avoided** by Python's threading model (`telemetry.py:50-52`). |
| JS auth: `isFinite(exp)` | **Regressed** (new REV-005, low). |
| JS auth: constant-time compare, pinned alg, central role check | **Repeated faithfully** (`auth.py:68-71`, `server.py:161-162`). |

Overall, the Python build learned the JS review's lessons about optimistic
mutation and snapshots. It lost an implicit protection the JS runtime gave for
free: a catch-all around the post-authorization steps. That gap matters more
than any JS finding did, because it is a real duplicate charge rather than a
stale read.

## THREAT-01 / 02 / 03 / 04 / 05

- THREAT-01/02: REV-005 and REV-006 need the shared secret, so they fall under
  THREAT-01. No new risk outside it.
- THREAT-03: REV-002 is a set of new instances, and REV-004 arguably is one.
  The entry's mechanism text names the JS `incompleteBills` guard and should be
  broadened. **REV-001 is not a THREAT-03 instance.** THREAT-03 accepts that a
  stuck operation can't be finished. It doesn't accept a same-key retry
  charging again, which D-63 explicitly forbids.
- THREAT-04: mitigated in this build (`server.py:168-170`). It is still not
  protected by a frozen test.
- THREAT-05: Customer only. N/A to Checkout.

## Suggested additions to the living checklist

1. **§2: "Which failure modes does every 'downstream failed' branch actually
   handle?"** Check that a dependency that *throws* (transport error or
   timeout) goes down the same recorded-outcome path as one that *answers*
   with an error status. Frozen tests that inject failures only as HTTP
   statuses can't tell the two apart. (From REV-001.)
2. **§2: "lost reply" as a partial failure.** When a dependency applied the
   write but the reply was lost, can the caller's retry reconcile, or does a
   dedupe guard (`already_applied`) make it stuck? (From REV-002/REV-004.)
3. **Gates:** add a Python static-check gate before the next Python
   rehearsal, and a way to run `test:engineering`'s Checkout tests against
   the Python build in the review environment. (From REV-010 and the gates
   table.)

I did not edit `tools/review/review-prompt.md`. It is protected.

## Recommendation

**Blocked for demo readiness on REV-001.** It is a real duplicate-charge path
on an idempotent retry, and it should be fixed with a regression scenario
before this build is called payment-safe. REV-002 to REV-004 need a human
decision: fix, or accept under an updated THREAT-03. Before treating this
build as green, also run `npm run test:engineering` on the host. I expect
`engineering-review.test.mjs:82` to fail (REV-003).
