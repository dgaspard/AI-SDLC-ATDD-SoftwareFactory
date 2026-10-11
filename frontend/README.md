# Frontend

Plain HTML/JS (A-04). Port 3000. Calls services only through their
published APIs and uses accessible labels and roles so Playwright scenarios read
like a user's actions. Playwright scenarios live in `spec/` and do not change when a
backend service is rebuilt in another language.

The executable `setup`/`start` scripts and Node HTTP server satisfy the runtime
contract: `PORT` (default 3000), `GET /health`, and graceful shutdown. `setup` checks
every JavaScript module; no frontend package installation is required. The server
serves the application routes and an explicit static-file allowlist. `/config.json`
provides the four service URLs from the runtime environment.

FE-01's approved Cedar & Paw design, screen behavior, and retained assets live in
[`spec/frontend/`](../spec/frontend/design.md). The browser coverage plan is in
[`spec/tests/browser/`](../spec/tests/browser/README.md). Human approval and freeze
are recorded in the [handoff](../docs/handoffs/fe-01.md), despite original draft
wording retained inside the frozen documents. The application implements login,
appointment request/assigned-vet acceptance, visit recording, bill finalization,
and customer payments. Run `npm --prefix spec run test:browser` from the repo root
for five headless Chromium checks, including three visual comparisons.

The app uses only published APIs. It keeps the user token and unresolved payment
UUID/payload in tab-scoped sessionStorage. It clears that state on sign out and
never collects real card details. See the [engineering review](../docs/engineering-reviews/fe-01-javascript.md)
for validation and recovery limitations. TEST-02 remains a separate backend suite.

The later reconstruction
experiment deletes frontend application code but retains approved design assets
and independent expectations (DEMO-04, after the Checkout experiment).
