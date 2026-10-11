# AI-SDLC Software Factory

A repeatable way to build software with AI agents: humans decide and freeze executable
expectations (business examples, API and domain contracts, observability rules,
delivery controls), agents build against them inside enforced boundaries, and
independent evidence supports every decision to ship.

This repository is the factory's working prototype. Its reference project is a
four-service veterinary clinic (PetClinic) built entirely from frozen specifications:

1. Lock business decisions, the domain model, and schemas.
2. Write feature files for each service, then derive API contracts.
3. Write service and schema contract tests an AI agent cannot modify. Every test fails on creation.
4. Write workflow features and tests for journeys that span services.
5. Ask an AI agent to build the application until every test passes.
6. Delete a service and have a fresh agent rebuild it from the specifications and tests.

## Where it stands

The reference project is complete: four JavaScript services, a frontend, contract,
authentication, observability, workflow, browser and performance suites, and a fresh
agent has rebuilt the Checkout service in Python from the frozen expectations with zero
interventions. Delivery controls are specified in `spec/delivery/` and the system runs
locally in containers. Next is governed delivery to the cloud, then operation, durable
state, and extracting the factory core for a second project. The roadmap is in
[PROJECT-PLAN.md](PROJECT-PLAN.md); status is in [BACKLOG.md](BACKLOG.md). The original
single-app version is preserved at tag `1.0`.

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
docs/observability.md              Telemetry rules OBS-001..OBS-048 and coverage
docs/decisions/architecture.md     Architecture and delivery decisions A-01..A-25
docs/design/                       One design note per backlog item
docs/engineering-reviews/, docs/rehearsals/, docs/handoffs/   Evidence records
docs/history/                      Completed backlog items and superseded plans
PROJECT-PLAN.md                    Objective, factory shape, roadmap, experiment protocol, risks
BACKLOG.md                         Work items in roadmap order, proposals, deferred work
docs/development-workflow.md       Working sequence and handoff rules
AGENTS.md                          Guardrails for coding agents
```

Where each kind of document belongs, and the rules for adding one:
[docs/README.md](docs/README.md).

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

Full validation requires permission to bind local test ports. Evidence for each
completed item (engineering reviews, rehearsals, handoffs) is indexed in
[docs/README.md](docs/README.md).
The browser suite runs in the pinned Playwright container
(`spec/tests/browser/run-in-container.sh`) so screenshots match on every host.
Only a human reviews and freezes protected changes.
