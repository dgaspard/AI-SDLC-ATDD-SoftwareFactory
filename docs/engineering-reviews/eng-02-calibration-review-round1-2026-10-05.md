# ENG-02 independent engineering review — build `snapshot`

> **Calibration evidence, copied unedited from the scratch copy.** This is
> the blind reviewer's raw output for ENG-02 calibration round 1. Line
> numbers refer to the *planted* scratch copy, not to `main`. Scoring is in
> [eng-02-calibration-2026-10-05.md](eng-02-calibration-2026-10-05.md). Do
> not act on these findings directly: most are planted defects, and the
> real ones are triaged in that record.

Date: 2026-10-05. Reviewer: fresh agent session with no memory of building this
code, following `tools/review/review-prompt.md`. No code, spec, or test was
edited. This file is the only one created.

Scope: `services/platform/runtime.js`, every `services/*/server.js`, and every
`frontend/*.js`, each read in full. Context read first: `docs/design/eng-02-review.md`,
`tools/review/project-specific/threat-model.md`, `spec/contracts/auth-contract.md`,
`spec/contracts/runtime-contract.md` (CORS, logging), `docs/observability.md`
(OBS table), `docs/engineering-reviews/eng-02-observability-audit.md`, and the
ENG-01 section of `docs/history/backlog-completed.md`. Route role allowlists were
taken from the `x-roles` of `spec/contracts/*.openapi.json`.

## Automated gates

| Gate | Result |
| --- | --- |
| `npm run test:engineering` | 5 pass, 5 fail. **Test 4, "uncertain bill creation cannot issue a second account charge", fails for a real reason**: the second finalize returns 201 where 502 is expected, so Checkout calls Customer again (see REV-007). Tests 5–8 (frontend) fail only because the Playwright Chromium binary isn't installed in this sandbox (`browserType.launch: Executable doesn't exist`). This is an environment problem, not a verdict on the code. The import-boundary check (test 9) passes. |
| `npm run guard:check` | No root script with that name exists. The equivalent, `npm --prefix spec run guard:check`, **FAILS**: 11 protected files differ from the frozen hashes (`docs/specs/business-decisions.md`, `spec/features/checkout/promotion.feature`, `spec/features/checkout/visit-payment.feature`, `spec/features/customer/customer-profile.feature`, `spec/features/reservation/calendar-availability.feature`, `spec/features/reservation/reassign-veterinarian.feature`, `spec/features/reservation/request-reservation.feature`, `spec/harness/config.js`, `spec/tests/steps/checkout.steps.js`, `spec/tests/steps/customer.steps.js`, `spec/tests/support/business-traces.js`). I was barred from comparing against any other copy, so I can't tell whether these are unfrozen human edits or tampering. A human needs to look (REV-020). Separately, the prompt's command `npm run guard:check` doesn't exist at the root. |
| `npm run trace:payment` | Pass. One connected 9-span trace: `checkout.pay` (settled) → `payment.authorize` (authorized) → Customer `apply_account_change` (applied) → Reservation `complete` (completed_settled). All capture processes exited and ports 4001–4004, 4010, and 4318 are free. |
| `npm --prefix services/platform audit` | **Could not run.** The registry returned 403 (sandbox network allowlist). |
| `tools/security/portable/run-sast.sh` (Semgrep), `tools/review/portable/run-dupe-check.sh` (jscpd) | **Not run.** They need network access to install, which this environment lacks. A human should run them locally. |

I also ran some live checks against locally started Customer and Reservation
processes, all stopped afterwards. Each one confirmed the behavior described:

- A token with `alg: none`, `role: "service"`, and a garbage signature read `GET /customers/{id}/account` (REV-001).
- A tokenless POST from localhost to `/internal/customers/{id}/account-changes` created a $999.99 charge (REV-002).
- An `OPTIONS` request with `Origin: https://evil.example` got `Access-Control-Allow-Origin: https://evil.example` back, with credentials allowed (REV-004).
- A plain veterinarian token (no `roles`) successfully called `POST /veterinarians` (REV-005).
- `GET /customers?search=(` returned 500 (REV-013).
- A rejected bearer token was written verbatim to stderr (REV-012).

## Payment path traced (checklist §2)

`POST /checkouts/{id}/payments` → `runtime.js:503-531` (authenticate, role,
schema, Idempotency-Key format) → `checkout/server.js:345-347` (per-bill lock,
ownership via `owner()` → 404) → `:352-355` (key scoped to `visit:<checkoutId>:<key>`
plus a body fingerprint; a replay returns the stored result or error) → `:356-357`
(the `already_settled` and `invalid_amount` guards) → `:378` (the attempt record is stored
*before* the provider call, so a concurrent same-key request queued behind the
lock replays) → `:383` `authorize()` (`:104-120`, client span `payment.authorize`)
→ `:392` Customer credit `account()` (`:60-74` → `customer/server.js:177-222`,
which de-dupes credits by `paymentId`) → `:393-394` local balance updated only after
the credit succeeds → `:396` `complete()` (`:75-90` →
`reservation/server.js:395-421`) → `:397-406` outcome. On failure after
authorization, `:407-419` reports `502 authorized_completion_failed` and stores it
for same-key replays. Amounts are integers end-to-end (schema `integer`,
`minimum: 1`; `frontend/billing.js:20-26` parses decimals without float
multiplication). I found no float arithmetic on money.

## Checklist summary

| § | Item | Verdict |
| --- | --- | --- |
| 1 | Each service owns its state | **Not followed.** Checkout reads the catalog's seed file directly (REV-006) |
| 1 | No duplicated business logic | **Not followed.** Checkout re-prices from a seed copy of the catalog (REV-006) and caches Reservation's assignment rule (REV-016). `chicago()` is copy-pasted between services (REV-019) |
| 1 | `platform/` the only shared import | Followed (import gate passes) |
| 2 | Local mutation before downstream confirmation | Mostly followed in `pay` and `promotion` (an earlier review's REV-001/002 fixes, per code comments, are visible at `checkout/server.js:327-332, 388-394`). **Not followed** in finalize (REV-007) or for promotion followed by complete (REV-010) |
| 2 | Retry duplicates | Same-key retries are safe. Finalize retries are broken (REV-007). An authorized payment whose credit failed is never reconciled (REV-009) |
| 2 | Integer cents | Followed |
| 2 | Provider success then downstream failure reported accurately | Followed (`authorized_completion_failed`), but there is no recovery (REV-009) |
| 3 | Signature verified before trusting claims | **Not followed.** Service-role tokens skip the HMAC check (REV-001), and `/internal/*` skips authentication entirely from localhost (REV-002) |
| 3 | Constant-time comparison | **Not followed** (REV-003) |
| 3 | Algorithm pinned | Followed for user tokens only. The service-token shortcut runs before the `alg` check (REV-001) |
| 3 | exp/sub/role validated | Followed for user tokens (`runtime.js:237-251`). Service tokens get only presence and expiry checks (REV-001) |
| 3 | `roles` validated the same way as `role` | Mostly. Allowlisted at `runtime.js:254-267`, but `"service"` is accepted as a secondary role and nothing ties `roles` to `role` (REV-017) |
| 3 | Every role-restricted route checked | **Not followed.** Any veterinarian passes the administrator-only roster routes (REV-005) |
| 4 | No sensitive data in spans | **Not followed.** The payment method reference is set as a span attribute (REV-008). The OBS-021 audit no longer holds |
| 4 | No internal details in errors | Followed (no stack traces). Downstream codes do leak through `dependency()` (REV-018). Credentials are written to logs (REV-012) |
| 4 | 404 hides other customers' resources | Followed (`runtime.js:37-47`. Every customer-scoped getter goes through `owner()`) |
| 5 | Admin-settable flags read everywhere they should be | **Not followed.** `active` is ignored by `/availability` (REV-011) |
| 5 | Hardcoded values / obscured control flow / coupling | See REV-014, REV-015, REV-016, REV-019 |

## Findings

### REV-001: Service-role tokens are accepted without signature verification
- **Category:** §3 Inter-service authentication
- **File:line:** `services/platform/runtime.js:220-228`
- **What I found:** `authenticate()` decodes the claims and, if `role === "service"` with any `sub` and a future `exp`, returns them immediately. That happens before the HMAC is computed and before the `alg` check. The comment justifies it as a "hot path" optimization. Anyone who can reach any service port can mint `{"alg":"none"}.{"role":"service","sub":"x","exp":9999999999}.x` and get full service privilege. That means every `/internal/*` operation (applying credits, discounts, or charges to any customer, completing reservations, collecting booking fees) plus the service-readable GETs. I verified this live: a forged token read a customer's account. This is not THREAT-01, which assumes an attacker *holds* the shared secret. Here no secret is needed at all.
- **Severity:** critical
- **Needs human sign-off:** yes
- **Suggested fix:** Delete the shortcut. Service tokens should go through the same HMAC, `alg`, and `exp` path as user tokens, and `sub` should be checked against the four known service names.

### REV-002: `/internal/*` routes skip authentication entirely when the TCP peer is localhost
- **Category:** §3 Inter-service authentication / §1 boundaries
- **File:line:** `services/platform/runtime.js:497-507`
- **What I found:** For any `/internal/` route whose socket peer is `127.0.0.1`, `::1`, or `::ffff:127.0.0.1`, the runtime makes up a `{ sub: "internal", role: "service" }` user and never reads the `Authorization` header. Every process on the host is therefore a trusted service. That includes the demo browser, through REV-004, and any reverse proxy or sidecar, behind which *every* request appears to come from localhost. The auth contract says "Internal operations ... accept only `role: "service"`. Users cannot call them directly". Nothing in it permits a network-location exemption. I verified this live: a tokenless `curl` created a $999.99 charge on a seeded customer's account.
- **Severity:** critical
- **Needs human sign-off:** yes
- **Suggested fix:** Remove the localhost branch and always call `authenticate()`. Callers already send a signed service token (`runtime.js:337-339`), so legitimate traffic is unaffected.

### REV-003: HMAC signature compared with `!==`, not in constant time
- **Category:** §3
- **File:line:** `services/platform/runtime.js:229-236` (`timingSafeEqual` is imported at `:5` but never used)
- **What I found:** `s !== expected` is an ordinary string comparison, which can exit early. In principle it leaks how many leading characters of a guessed signature are correct. Exploiting that over HTTP is hard, but this is exactly the hand-rolled-crypto defect the checklist names.
- **Severity:** medium
- **Needs human sign-off:** yes
- **Suggested fix:** Decode both signatures to buffers, check that their lengths match, and compare them with `timingSafeEqual`.

### REV-004: CORS reflects any Origin, with credentials allowed, in violation of RT-006
- **Category:** §3 / §4
- **File:line:** `services/platform/runtime.js:444-455`
- **What I found:** Every service echoes whatever `Origin` arrives, sets `Access-Control-Allow-Credentials: true`, and answers preflights for every method. `FRONTEND_ORIGIN` is never read anywhere in `services/`. RT-006 (`spec/contracts/runtime-contract.md:85-93`) requires echoing only `FRONTEND_ORIGIN` and sending no allow headers to anyone else. On its own the impact is limited, because tokens are bearer tokens rather than cookies. Combined with REV-002, though, any web page opened in a browser on the demo host can make JSON POSTs to `http://localhost:400x/internal/...` and read the responses. I verified this live with `Origin: https://evil.example`.
- **Severity:** high (because of REV-002; medium on its own)
- **Needs human sign-off:** yes
- **Suggested fix:** Compare the request's Origin with `process.env.FRONTEND_ORIGIN ?? "http://localhost:3000"` and send the CORS headers only on a match.

### REV-005: Any veterinarian can call the administrator-only roster routes
- **Category:** §3 role checks (calibration class: an admin-only route missing its role check)
- **File:line:** `services/platform/runtime.js:508-521` (`roster` bypass at `:512-514`). The affected routes are `services/reservation/server.js:85-108`
- **What I found:** `POST /veterinarians` and `PATCH /veterinarians/{id}` are `x-roles: ["administrator"]`. The runtime nonetheless skips the role check for any path starting with `/veterinarians` when `user.role === "veterinarian`. The comment ("the clinic owner is a veterinarian, so veterinarians can manage the roster") misstates D-39/D-40. The owner is authorized through her `roles` claim, which the next condition already handles. The result is that any veterinarian can add veterinarians or deactivate colleagues, which `spec/features/reservation/manage-veterinarians.feature:75` explicitly forbids. The route handlers check no role either. I verified this live with a plain veterinarian token.
- **Severity:** high
- **Needs human sign-off:** yes
- **Suggested fix:** Delete the `roster` exemption. The existing `role`/`roles` allowlist check already authorizes the dual-role owner.

### REV-006: Checkout reads the catalog's seed data directly when Veterinarian Services fails
- **Category:** §1 boundaries (calibration classes: cross-service store access and copied business logic)
- **File:line:** `services/checkout/server.js:233-246`
- **What I found:** If `GET /fees` throws for *any* reason, Checkout prices the bill from `app.seed("services")`. That is the catalog service's own data file, and Checkout is pricing from it instead of from the service that owns it. There are three consequences:
  1. Any fee changed through `PATCH /services/{id}` (OBS-045) is ignored, so the bill is finalized permanently at a stale price and the customer is charged that amount.
  2. The catch also swallows the catalog's legitimate `422 unknown_service` response, so its `unknownServiceIds` detail is lost.
  3. A dependency failure now reads as success (outcome `finalized`, status OK), which undercuts OBS-020.
- **Severity:** high
- **Needs human sign-off:** yes
- **Suggested fix:** Remove the fallback and let the dependency failure surface as `502 dependency_failed`, as OBS-029's `failed` outcome expects.

### REV-007: A partial failure during finalize leaves a Customer charge with no bill, and retries can never recover
- **Category:** §2 payment safety (local and downstream disagree), §5 dead guard
- **File:line:** `services/checkout/server.js:269-276` (`incompleteBills` written at `:269` and `:276` and never read anywhere). The interaction is with `services/customer/server.js:187-189`
- **What I found:** Finalize posts the `charge` (`:270`), then the booking-fee `credit` (`:272`), and only after both does it store the bill (`:273-275`). If the credit fails, or if the charge's response is lost, Customer has a full-total charge with no credit while Checkout has no bill. `incompleteBills.add` looks meant to block a blind retry, but nothing checks it. On retry, Checkout posts the charge again, and the real Customer answers `409 already_applied`. `dependency()` passes that through, so finalize returns `409 already_applied`, an outcome OBS-029 doesn't list. The bill can then never be created. The customer is left showing a debt inflated by the uncredited $20 booking fee, which also makes them ineligible to book. This is why engineering test 4 fails.
- **Severity:** high
- **Needs human sign-off:** no (payment correctness, not a security or boundary issue). A human should still review it.
- **Suggested fix:** Check `incompleteBills` at the start of the critical section and return `502 dependency_failed` without calling Customer, which is what test 4 expects. Longer term, have Customer treat an identical charge for the same visit as an idempotent success, so a retry can finish the job.

### REV-008: The payment method reference is exported as a span attribute
- **Category:** §4 privacy (calibration class: a payment reference leaked into a span)
- **File:line:** `services/checkout/server.js:97` (called from `:351` and `:379`)
- **What I found:** `paymentAttrs()` sets `petclinic.payment.method_reference = a.mockMethodReference` on the `checkout.pay` and `checkout.record_cash` business spans. OBS-005 and OBS-021 forbid raw payment method details in telemetry, and the attribute isn't among OBS-031's listed attributes either. The 2026-10-05 OBS-021 audit (`docs/engineering-reviews/eng-02-observability-audit.md`, the OBS-021 row) says this field "is never passed into a span attribute". That is **no longer true** in this build, so the audit's conclusion should be reopened.
- **Severity:** high
- **Needs human sign-off:** yes
- **Suggested fix:** Delete line 97.

### REV-009: An authorized card payment whose Customer credit fails is never reconciled
- **Category:** §2
- **File:line:** `services/checkout/server.js:383-394, 407-419, 128-129`
- **What I found:** If `authorize()` succeeds and `account(credit)` then fails, the record stores `authorized_completion_failed`. Every same-key retry replays that stored error (`:128-129`) and never retries the credit. The provider has taken the money, but Customer and the bill's balance never reflect it. The customer's only option is a new key, which charges the card again for the same balance. The failure is reported honestly; the defect is that a retry can never finish the job. The engineering test (`engineering-review.test.mjs` test 3) covers only the case where `complete()` fails after the credit succeeds.
- **Severity:** medium
- **Needs human sign-off:** no
- **Suggested fix:** On a same-key replay of `authorized_completion_failed`, retry the remaining downstream steps (credit, which Customer already de-dupes by `paymentId`, then complete) rather than replaying the error. I haven't checked whether OBS-031/OBS-038 constrain this.

### REV-010: If promotion-to-zero succeeds but `complete()` fails, the reservation is stranded
- **Category:** §2
- **File:line:** `services/checkout/server.js:331-334` (and `:356`)
- **What I found:** The discount is confirmed by Customer and recorded locally (`c.promotion` is set at `:332`), and then `complete(c)` throws. A retry gets `409 already_applied` (`:315`), and any payment gets `409 already_settled` (`:356`), so nothing calls `complete()` again. The reservation stays `Accepted` while the bill reads $0.
- **Severity:** medium
- **Needs human sign-off:** no
- **Suggested fix:** When `c.promotion` is already set and the balance is 0, retry `complete()` (which is idempotent through `already_completed`) before returning `already_applied`.

### REV-011: `GET /availability` ignores the `active` flag, despite its comment and D-57
- **Category:** §5 flag never read
- **File:line:** `services/reservation/server.js:113-117`
- **What I found:** The comment says "a deactivated veterinarian offers no new slots", and D-57 (`docs/specs/business-decisions.md:67`) requires it. The filter checks only `veterinarianId` and never `v.active`. Deactivated veterinarians' slots are still offered, then rejected with 404 at booking (`:149`). The frontend also lists inactive veterinarians in the booking picker (`frontend/appointments.js:328-330`). `active` *is* read correctly at `services/reservation/server.js:149` and `:373` and at `services/customer/server.js:26`.
- **Severity:** medium
- **Needs human sign-off:** no
- **Suggested fix:** Add `v.active &&` to the filter, and filter the picker in the frontend.

### REV-012: Rejected bearer tokens are logged verbatim
- **Category:** §4 privacy
- **File:line:** `services/platform/runtime.js:270`
- **What I found:** Every 401 logs the full `Authorization` header to stderr. That includes expired but otherwise genuine tokens, and tokens a service rejected only because of clock skew, which are valid elsewhere. The auth contract (`spec/contracts/auth-contract.md`, Telemetry) says tokens and `Authorization` headers are never exported. Logs are a separate channel, but they are captured to stdout/stderr by the runtime contract. I verified this live.
- **Severity:** medium
- **Needs human sign-off:** yes
- **Suggested fix:** Log only the service name and a reason code, never the header.

### REV-013: `GET /customers?search=` builds a RegExp from user input
- **Category:** §4 errors / robustness
- **File:line:** `services/customer/server.js:98-106`
- **What I found:** `new RegExp(query.get("search"), "i")` with no escaping. An invalid pattern gives a 500 `internal_error` (verified with `search=(`). A catastrophic-backtracking pattern can block the single-threaded Customer process, and with it login, eligibility, and account changes, for everyone. The parameter isn't declared in the contract for this route that I could see, so it's also undocumented behavior.
- **Severity:** medium
- **Needs human sign-off:** yes (it's a denial-of-service vector)
- **Suggested fix:** Use a case-insensitive substring match, or escape the input, and validate it as a declared query parameter.

### REV-014: OBS-046/047/048 attributes and outcomes don't match the contract
- **Category:** §5 / OBS (calibration class: a missing OBS attribute on an untested rule)
- **File:line:** `services/reservation/server.js:92` (outcome `added`; OBS-046 specifies `created`), `:103` (OBS-047's required `petclinic.veterinarian.active` is never set), `:364-366` (OBS-048's required `reservation.id` is never set. Only `veterinarian.id` is). `services/platform/runtime.js:407` adds `added` to the success set, which hides the naming mismatch.
- **What I found:** The three MVP-02A operations still have no dedicated observability tests (as the earlier audit noted), and their implementations break their own draft contracts. That is the very gap the missing tests leave open.
- **Severity:** low
- **Needs human sign-off:** no
- **Suggested fix:** Use outcome `created`, set `"veterinarian.active": v.active` after the update, and set `"reservation.id": params.reservationId`. Then write the OBS-046–048 tests.

### REV-015: Undeclared span attribute on finalize, with a duplicated timezone helper
- **Category:** §5 / OBS-006
- **File:line:** `services/checkout/server.js:281-284` (helper at `:40-55`)
- **What I found:** `petclinic.checkout.billed_local_date` isn't in OBS-029's attribute list, and OBS-006 requires exactly the specified keys. It's computed with a local copy of the Chicago formatter instead of `app.date()` (`runtime.js:171-178`), which already does the same thing.
- **Severity:** low
- **Needs human sign-off:** no
- **Suggested fix:** Remove the attribute, or add it to the contract and use `app.date()`.

### REV-016: Checkout caches the assigned veterinarian at finalize, so reassignment doesn't reach it
- **Category:** §1 coupling / duplicated rule
- **File:line:** `services/checkout/server.js:275, 314, 350`; `services/reservation/server.js:380-386`
- **What I found:** D-48 allows reassignment after a visit is closed, including `CompletedOutstanding`, as long as no notes exist. Reservation updates `r.veterinarianId` and `v.veterinarianId`, but Checkout's `assignedVets` snapshot never changes. After a fill-in, the new veterinarian is refused promotion and cash recording (403 `not_assigned_veterinarian`) while the original veterinarian keeps those rights. Checkout is effectively keeping its own copy of Reservation's assignment rule.
- **Severity:** low
- **Needs human sign-off:** yes (it's a service boundary)
- **Suggested fix:** Look the visit's current `veterinarianId` up from Reservation at the time of the action, or have Reservation notify Checkout. Alternatively, document that a bill's attribution freezes at finalize.

### REV-017: The `roles` claim accepts `"service"` and isn't tied to `role`
- **Category:** §3 dual-role validation
- **File:line:** `services/platform/runtime.js:254-267`, `:519`
- **What I found:** The secondary-role allowlist includes `"service"`, so a user token carrying `roles: ["service"]` passes every service-only route. Nothing requires `role ∈ roles`, either. Forging such a token requires the secret (THREAT-01), so this is defense in depth rather than an open hole. It does mean the dual-role check is looser than D-44 describes ("today, always `veterinarian`" plus `administrator`).
- **Severity:** low
- **Needs human sign-off:** yes
- **Suggested fix:** Limit `roles` to `veterinarian` and `administrator`, require at least two entries, and require that `role` is among them.

### REV-018: `dependency()` passes downstream 4xx codes straight to the external caller
- **Category:** §4 errors
- **File:line:** `services/platform/runtime.js:376-387`
- **What I found:** Any downstream 4xx status and `code` is re-thrown as-is. This is how finalize ends up returning Customer's internal `409 already_applied` (REV-007). It could also surface a downstream `403 forbidden` that the external caller wasn't refused for. The leak is small (codes only, no stack traces or data), but external responses can then carry outcomes no contract lists.
- **Severity:** low
- **Needs human sign-off:** no
- **Suggested fix:** Map the unexpected downstream 4xx responses to `502 dependency_failed` at each call site, and pass through only the codes the caller's contract documents (for example, `unknown_service`).

### REV-019: Hardcoded booking-fee amount and copy-pasted helpers
- **Category:** §5
- **File:line:** `services/reservation/server.js:163` (`2000`), `:17-32` and `services/checkout/server.js:40-55` (identical `chicago()`), `frontend/appointments.js:165, 441` (the literal "$20.00"), `frontend/billing.js:49-53` (the booking fee is re-derived as total minus services)
- **What I found:** The booking fee is hardcoded in four places across three units (also as `const: 2000` in the Checkout schema), and the frontend reconstructs it by arithmetic instead of reading `reservation.bookingFeeAmount`, which it already fetches. None of this is wrong today, but it's drift-prone.
- **Severity:** note
- **Needs human sign-off:** no
- **Suggested fix:** Move the timezone helper into `platform/`, and have the frontend render `bookingFeeAmount` from the API.

### REV-020: The protected-file guard fails on 11 protected spec and test files
- **Category:** Gates / governance
- **File:line:** `spec/guard/check.js` output, which lists the files above
- **What I found:** The guard reports changed protected files, including step definitions and `spec/tests/support/business-traces.js`, which is the trace-assertion support. If those changes weren't made deliberately by a human and re-frozen, the protected test suite this build would be judged against can't be trusted. I couldn't establish provenance without looking at another copy.
- **Severity:** high (until provenance is confirmed)
- **Needs human sign-off:** yes
- **Suggested fix:** A human diffs these files against the last frozen version, then either re-freezes them (`npm --prefix spec run guard:freeze`) or reverts them. Also, either add a `guard:check` script to the root `package.json` or correct the command in the review prompt.

## Suspicions (not cited findings)

- `frontend/api.js:14-17` keeps the bearer token in `sessionStorage`. With CSP `default-src 'self'` and no `innerHTML` anywhere in `frontend/`, I found no XSS path. I'm noting it only as a standard trade-off.
- The payments route allows the `veterinarian` role (contract `x-roles`) with no assignment check (`services/checkout/server.js:348-350`). It matches the contract, but the comment says card payment is "customer-only".

## Calibration-class coverage

All six calibration classes listed in the prompt are present in this build:
1. copied business logic across services (REV-006)
2. a payment reference in a span (REV-008)
3. a token check skipping signature verification (REV-001)
4. cross-service store access (REV-006)
5. a missing OBS attribute on an untested rule (REV-014)
6. an admin-only route missing its role check (REV-005)

The defect that is new to this checklist is REV-002 combined with REV-004: a network-location trust bypass made reachable from the browser through permissive CORS. Consider adding "no auth decision based on peer address" and "CORS matches RT-006" to §3.
