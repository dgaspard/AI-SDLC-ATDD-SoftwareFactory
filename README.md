# AI SDLC PetClinic

A demonstration of **controlling AI development with executable specifications**,
prepared for a November presentation.

The approach is test-driven:

1. Lock business decisions, the domain model, and schemas.
2. Write feature files for each service, then derive API contracts.
3. Write service and schema contract tests an AI agent cannot modify. Every test fails on creation.
4. Write workflow features and tests for journeys that span services.
5. Ask an AI agent to build the entire application until every test passes.
6. Delete a service and have the agent rebuild it from the specifications and tests.

## Current state

Tag `test-01` marks completion of service-level executable specification work.
Business decisions D-01–D-38, domain schemas, per-service API contracts, and 166
service scenarios are present. The latest access-control and telemetry rehearsal
passed 310 checks against temporary services and detected 13 deliberate defects;
see the [rehearsal report](docs/history/test-slices-5-6-rehearsal.md).

The four JavaScript services are implemented with independent in-memory stores,
HTTP APIs, authentication, and OpenTelemetry export. Reviewed and frozen SPEC-05
adds complete self-registration, partial payments, clinical corrections, and
catalog updates; there are now 219 service scenarios. The frontend implements the
approved login, appointment, visit, billing, and payment journey. IMPL-02 validation and ENG-01 findings are
recorded in the [JavaScript engineering review](docs/engineering-reviews/impl-02-javascript.md).

TEST-02 now has nine frozen backend journeys using Playwright HTTP requests without
launching a browser. These retain the existing workflows without extra UI/setup
flows. IMPL-02 and the JavaScript
[Engineering Discipline review](docs/history/backlog-completed.md#eng-01--review-implementation-quality-across-the-language-swap)
passed the complete `npm test` aggregate at tag `impl-02`.
FE-01 adds approved, human-frozen design assets, three visual references,
and five headless Chromium checks. Its implementation and validation are recorded in the
[FE-01 handoff](docs/handoffs/fe-01.md) and [design preview](docs/design/fe-01-design-preview.html).
[BACKLOG.md](BACKLOG.md) tracks verification and task status. The earlier
single-app version remains preserved at tag `1.0`.

## Services

| Service | Owns |
| --- | --- |
| Customer | Customer and pet profiles, account balance, booking eligibility |
| Reservation | Calendar, reservation lifecycle, clinical visit records |
| VeterinarianServices | Service catalog and fees in USD |
| Checkout | Bills, promotions, booking-fee and visit payments (fake provider), cash |

Each runs as a separate local HTTP process with in-memory storage.

## Where things live

```text
services/<name>/                   JavaScript services with executable setup/start scripts
services/platform/                 Shared HTTP/auth/schema/telemetry infrastructure
frontend/                          Vanilla JavaScript clinic UI and HTTP server
spec/                              Protected: features, contracts, seed data, tests, harness, fakes
docs/specs/                        Protected: decisions, domain model, schema decisions
docs/observability.md              Telemetry rules OBS-001..OBS-042 and coverage
PROJECT-PLAN.md                    Milestones, experiment protocol, demo gate
BACKLOG.md                         Task status and open items
docs/development-workflow.md       Working sequence and handoff rules
AGENTS.md                          Guardrails for coding agents
```

## Prerequisites and commands

Node.js 22, 24, or 26+ (matching the package engine declarations), and Docker (the
browser suite and the local system run in containers, A-17).

```bash
npm ci
npm --prefix spec ci
./services/customer/setup           # installs the shared, locked JavaScript dependencies
npm test                            # runs every suite and prints an aggregate summary
npm run check                       # implementation lint and formatting checks
npm run test:engineering            # additional engineering regression evidence
npm run trace:payment               # capture a real-service checkout trace
npm --prefix spec run guard:check    # verifies frozen protected files and skip/focus rules
npm --prefix spec run test:bdd       # service scenarios only
npm --prefix spec run test:workflows # real-service journeys using Playwright HTTP
npm run test:suite -- browser        # frontend checks in the pinned Playwright container
npm --prefix spec run test:performance # local HTTP load, latency and financial checks
```

Run the whole system locally in the same images the cloud will use (ENV-01):

```bash
docker compose up --build -d        # open http://localhost:3000 (jordan.rivera / petclinic-demo)
node tools/compose-smoke.mjs        # health, login, CORS and traces through the stack
docker compose down                 # stop it before npm test: they share ports
```

Full validation requires permission to bind local test ports. The service-BDD
harness lifecycle correction is authorized and human-frozen; all 219 service
scenarios and nine backend journeys pass in the complete aggregate run.
The [engineering review](docs/engineering-reviews/impl-02-javascript.md) records
the fixes, evidence, and in-memory limitations. The [frontend engineering review](docs/engineering-reviews/fe-01-javascript.md)
records FE-01 evidence. PERF-01's local performance checks are human-frozen and
pass; see its [handoff](docs/handoffs/perf-01.md).
The browser suite runs in the pinned Playwright container
(`spec/tests/browser/run-in-container.sh`) so screenshots match on every host.
Only a human reviews and freezes protected changes.
