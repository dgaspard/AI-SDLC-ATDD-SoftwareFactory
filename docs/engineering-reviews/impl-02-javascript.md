# ENG-01 — JavaScript implementation review

Date: 2026-09-27. Workspace: `main`, based on
`0cf76015218e7943c6ae8496e01b14ac5e578eaa` (`eng-01-plan`).
Implementation checkpoint: tag `impl-02`, including this review.

**Decision: PASS for the JavaScript backend workspace.** The full `npm test`
aggregate exits zero after the authorized, human-frozen harness correction.
Review findings below are addressed; additional engineering checks and code checks
pass. FE-01 browser UI and PERF-01 remain future gates; this is not a
production-readiness assessment.

## Automated evidence

Environment: Node 24.21.0, npm 11.19.0, macOS. Local-network permission is required.
The two stale processes originally occupying 4318 and 4010 were verified by their
working directories as this repository's collector and payment fake before stopping
them. No unrelated application's process was stopped.

| Command | Result |
| --- | --- |
| Final `npm test` | All eight suites PASS: guard, 45 harness tests, 157 schema tests, 52 runtime tests, 242 authentication tests, 113 observability tests, 219 service scenarios, nine backend journeys. Exit 0. |
| `npm test` (initial complete attempt) | Guard, harness (45), schemas (157), authentication (242), and backend journeys (9) passed. Runtime failed four missing frontend-shell checks; observability failed one missing trace attribute; service BDD terminated at a service switch. These are distinct failures, not a green aggregate. |
| `npm --prefix spec run test:runtime` after fixes | 52/52 pass, including frontend runtime and human-corrected RT-009 |
| `npm --prefix spec run test:auth` after fixes | 242/242 pass |
| `npm --prefix spec run test:observability` after fixes | 113/113 pass |
| `npm --prefix spec run test:workflows` after fixes | 9/9 scenarios, 58/58 steps pass |
| `npm --prefix spec run test:bdd -- --tags @service:customer --format summary` | 72/72 scenarios pass |
| Same command with `@service:reservation` | 86/86 scenarios pass after correcting settled-to-outstanding rejection |
| Same command with `@service:checkout` | 42/42 scenarios pass |
| Same command with `@service:veterinarian-services` | 19/19 scenarios pass |
| `npm --prefix spec run test:bdd` after authorized lifecycle fix | 219/219 scenarios and 1,685/1,685 steps pass in one run |
| `npm run test:engineering` | 5/5 pass; supplements the frozen oracle |
| `npm run check` | ESLint static checks and Prettier formatting pass |
| `npm --prefix services/platform audit` | Dependency update/install audit reports zero vulnerabilities |
| `npm run trace:payment` | Successful cross-process payment trace captured and parent relationships asserted |
| `npm --prefix spec run guard:check` | Pass; existing human-frozen RT-009 correction preserved |
| `./services/customer/setup` and `./frontend/setup` | Lockfile installation and frontend syntax validation pass; identical service setup scripts reviewed |

All post-fix individual suite reruns completed successfully, including combined
service BDD after the authorized harness correction. Logs are retained in
`test-results/engineering/` (generated, Git-ignored evidence). See the
[final aggregate log](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/test-results/engineering/impl02-final-validation.log).
The [reviewed-source SHA-256 manifest](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/test-results/engineering/implementation-sha256.txt)
identifies the reviewed source at checkpoint `impl-02`; all hashes still match after
final validation. The reviewed protected-file diff is retained alongside it.

## Review findings and dispositions

1. **Harness lifecycle — fixed with user authorization and human freeze.** `spec/tests/support/world.js` kept
   dependency stubs in the Cucumber process across service groups. When a dependency
   becomes the service under test, `startProject` invokes `freePort`; that port is
   owned by Cucumber itself. The aggregate loses its runner before printing the
   scenario summary. Proposed correction: stop managed child processes and close
   owned stubs on service switches, retaining reuse within a service. The
   reviewed patch (applied and frozen; removed from `docs/` 2026-09-29, retrievable from commit `25ca13e`) changed no assertions.
   The user authorized it with “continue” after the specific correction was
   presented. It is applied and the combined run passes all 219 scenarios.
   The human-frozen manifest includes the correction and the guard passes.
   Final aggregate validation passes; the lifecycle blocker is resolved.
2. **Ownership fallback — fixed.** A resource with an explicit `customerId` must
   never authorize a different customer merely because its resource `id` matches
   that customer. The ownership helper now prefers the explicit owner. The focused
   regression failed before the fix and passes afterward.
3. **Input validation — fixed.** Required idempotency headers were checked only
   for presence. They now use the published UUID schema before any provider call.
   Appointment slot validation now rejects fractional milliseconds. Both added
   engineering checks failed before the implementation corrections and pass now.
4. **State-transition error — fixed.** Repeating the same completion yields
   `already_completed`; attempting `CompletedSettled` → `CompletedOutstanding`
   yields `invalid_state`. The frozen Reservation feature exposed the distinction.
5. **Trace completeness — fixed.** Duplicate finalization now includes the known
   reservation ID and verifies the assigned veterinarian before returning the
   conflict. The frozen OBS-029 assertion detected the missing ID.
6. **Runnable-project contract — fixed.** Added the frontend's required startup,
   health, alternate-port, and shutdown shell. It returns 404 for UI routes; no
   FE-01 workflow is claimed or inferred from these runtime tests.
7. **Dependencies and readability — fixed.** Replaced vulnerable OpenTelemetry and
   Ajv versions with pinned audited versions and a lockfile. Added ESLint 10.11.0
   and Prettier 3.9.9, formatted the complete implementation, and removed unused
   imports. Export timeouts are bounded at one second so collector teardown does
   not delay service shutdown beyond the runtime contract.

## Service ownership and complete diff review

Reviewed all four `server.js` implementations, their package/setup/start files,
`services/platform/runtime.js` and dependency manifests, the frontend shell,
root code-check configuration, and the additional engineering evidence scripts.
The shared runtime supplies transport, schema validation, auth, locks, and SDK
instrumentation. It contains no domain stores. Each service owns its process-local
maps; Checkout reads Customer, Reservation, and VeterinarianServices only over
published HTTP APIs. The payment fake remains in protected `spec/fakes/payment`.

The runtime reads published OpenAPI schemas; it does not import test behavior or
fake payment code. Reservation's read-only seeded service-ID validation follows
GAP-03 in `docs/history/test-slices-5-6.md`; catalog fees and immutable bill snapshots are
owned by VeterinarianServices and Checkout respectively. Shared JavaScript
infrastructure stays with the surviving services during Python reconstruction,
and Python must supply its own runtime and official SDK.

The protected working-tree differences are the previously authorized,
human-frozen RT-009 correction and its manifest entry, plus the newly authorized
human-frozen service-BDD lifecycle correction. No features, response
contracts, access checks, telemetry assertions, or surviving-service expectations
were weakened. The patch artifact outside protected paths records the approved
harness change.

## Payment path, concurrency, and partial failure

Checkout takes a per-bill lock shared by card, cash, and promotion operations.
Booking payments have a separate per-reservation lock and key namespace.
Finalization has a per-visit lock. Within the payment lock, Checkout checks the
request fingerprint/key before current-balance rejection, creates one attempt,
calls the fake provider for cards only, records the outcome, credits Customer
only for successful payments, and completes Reservation according to the balance.
It snapshots the original response for retries, including declines and errors;
later payments cannot rewrite an earlier retry result.

All monetary values remain integer cents; division by 100 is used only for the
human-readable denial message. Catalog changes do not alter stored billed lines.
The $20 booking payment precedes acceptance and is credited once against the bill.
A booking decline leaves the reservation Requested. Authorized partial payment
leaves CompletedOutstanding; clearing the balance yields CompletedSettled.
The same lock prevents concurrent different-key payments from overcollecting.

The frozen suites check normal sequential/concurrent retries, declines, cash,
partial payments, promotions, and cross-service state. Added engineering checks
verify concurrent and sequential retries after authorization followed by completion
failure: one provider call, one account credit, one completion request, and the
same `502 authorized_completion_failed` payment-attempt reference. An uncertain
initial account charge blocks a second finalization write in that process.

Downstream failures do not trigger automatic financial recovery. A provider success
can leave Checkout's recorded paid amount ahead of Customer or Reservation; the
error reports failure to complete, not a decline or successful settlement. A failed
promotion can similarly require manual reconciliation. There is no recovery UI,
refund mechanism, distributed transaction, or durable retry ledger. These are
explicit in-memory/manual-recovery limits, not production payment handling.

## Access, telemetry, and connected trace

Protected route role declarations are enforced before execution; customer-owned
resources use owner checks and visit/appointment writes use assigned-veterinarian
checks. Internal HTTP calls carry short-lived service-role tokens. No user token,
password, clinical text, or payment-method reference is deliberately included in
span attributes or error details. AsyncLocalStorage keeps request contexts apart;
client spans inject their own W3C parent and business spans remain under SERVER
spans. Export uses the official OpenTelemetry SDK and OTLP/HTTP protobuf.

Captured trace `40bbb6c045f07270f5f8d392bec95dbc`, nine spans, initiating request
approximately 6.5 ms (an example, **not** a performance benchmark):

```text
Checkout POST /checkouts/{checkoutId}/payments [SERVER]
  checkout.pay [settled, OK]
    payment.authorize [CLIENT, authorized, OK]
    POST Customer account-changes [CLIENT]
      Customer account-changes [SERVER]
        customer.apply_account_change [applied, OK]
    POST Reservation complete [CLIENT]
      Reservation complete [SERVER]
        reservation.complete [completed_settled, OK]
```

The fake payment provider is an external boundary; it does not supply a server
span. Both real downstream services share the initiating trace and have matching
CLIENT → SERVER parent relationships. The capture script checks those relationships.
Broader exporter-failure, privacy, sampling, and logging/metrics gaps in
`docs/observability.md` remain separate from scoped passing assertions.

## Reconstruction parity and remaining demo work

The JavaScript backend gate is complete and checkpointed at tag `impl-02`.
Retain this checklist
for Python: equivalent ownership/payment/privacy review, Python formatting/lint
and useful static checks, the same frozen suites and trace, and the same browser
journey once FE-01 exists. No Python review or browser success is claimed here.
