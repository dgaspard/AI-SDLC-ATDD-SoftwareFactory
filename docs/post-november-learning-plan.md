# Post-November: four learning initiatives (brainstorm, no order decided yet)

Status: **brainstorm only.** Nothing here is scheduled, scoped, or
authorized. The goal of this document is to lay out the real dependencies
and trade-offs between the four initiatives so the order gets picked on
purpose, not by whichever one comes to mind first. Decide the order in a
follow-up conversation once the questions below are answered.

Framing shift from everything before this point: the November work is a
scoped demo with an audience and a deadline (one example per enterprise
check type, don't over-engineer for demo effect — see project memory). This
phase is explicitly different: a **personal learning exercise**, no audience,
no deadline pressure, depth preferred over breadth where it serves learning.
Don't import the demo's "stay minimal" instinct here without noticing it's a
different goal now.

## The four initiatives, and what already exists for each

1. **Production CI/CD to the cloud.** Nothing exists yet beyond local
   scripts and (once built) a repo-local CI check. No cloud provider chosen,
   no deployment target, no infra-as-code.
2. **Security.** SEC-01 (code-level scanning, calibrated, complete) and the
   planned [CI-01](../BACKLOG.md#ci-01--wire-sec-01s-security-gates-into-cicd-on-push-to-main)
   (wiring those same scanners into a required CI gate) cover *application
   code* security. Neither touches *cloud/infrastructure* security — IAM,
   network boundaries, secrets management in a real cloud secrets store,
   image/container scanning. That's a materially different problem and
   doesn't exist in any form yet.
3. **Observability.** The project already has real OTLP tracing, a test
   collector, and OBS rules tied to business behavior (A-08, A-10,
   `docs/observability.md`). That's trace-level, demo-scale, and
   assertion-driven. Production observability — metrics, logs, dashboards,
   alerting, SLOs, on-call-style signal — is a different layer on top, not
   yet started.
4. **Data persistence.** Currently explicit non-scope ([DATA-01](../BACKLOG.md#data-01--personal-historical-data-and-archival-learning-demo),
   deferred "until explicitly requested" — now requested). Everything today
   is in-memory, reset between runs. This is also the one initiative that
   directly challenges this project's core reconstruction thesis: DEMO-01's
   "delete a service, rebuild it from spec, prove it still behaves
   correctly" story has never had to survive a service that owns durable,
   evolving state. That's a real open question, not a solved problem being
   re-applied.

## Dependency map — what actually gates what

- **CI/CD-to-cloud** is the one true prerequisite among the four: cloud
  security and production observability are both *about* a deployed system.
  Without a real deployment target, "cloud security" and "production
  observability" stay abstract exercises rather than things you can actually
  point at and learn from.
- **Security (cloud/infra flavor)** and **observability (production flavor)**
  don't depend on each other, and both benefit from a live target existing
  first, but neither strictly blocks the other.
- **Data persistence** is the outlier: it doesn't need cloud deployment at
  all — a real database can run locally (or in a container) independent of
  any of the other three. It's also the initiative most likely to force a
  revisit of DEMO-01's reconstruction protocol, since "delete and rebuild
  from spec" means something different when the thing you deleted also owned
  a schema and real rows.

## Three plausible sequencing philosophies (not a recommendation — pick one knowingly)

**A — Foundation first.** CI/CD-to-cloud → cloud security → production
observability → data persistence last. Rationale: build the safety net
(deployment pipeline, security gate, visibility) before experimenting with
the riskiest, most novel piece. Data persistence lands last partly *because*
it's the biggest unknown — you want the rest of the scaffolding solid before
poking the thing most likely to break your existing assumptions.

**B — Highest-novelty first.** Data persistence → CI/CD-to-cloud → security
and observability together, layered onto the now-real, now-deployed, now-
stateful system. Rationale: the data-persistence question is the one this
project has explicitly flagged as unresolved and interesting ("a dedicated
brainstorming session on database creation, schema change over time, and
data interaction in AI workflows") — resolve the open question first while
it's fresh, and let the infra work come after there's a real stateful
service worth deploying and securing.

**C — Thin vertical slice.** Stand up a minimal version of all four at once,
narrowly (e.g., just Checkout: one cloud provider, a real Postgres instance,
a basic deploy pipeline, one security scan step, one dashboard), then deepen
each pillar in turn. Rationale: mirrors this project's own founding
philosophy (A-01's "small real system, not a comprehensive one") applied one
layer up — a working skeleton across all four beats a deep trench in one.

## Decided (2026-10-04)

- **Sequencing: Foundation first.** CI/CD-to-cloud → cloud security →
  production observability → data persistence last.
- **First deep-dive: production CI/CD to the cloud.** This is the actual
  personal learning priority, not just the first item in the sequence —
  worth protecting real depth here rather than treating it as a quick step
  on the way to the other three.
- **Stack: Terraform on AWS.** Chosen for marketability/reach, not because
  it's already familiar — this reinforces "foundation first," since the
  infra tooling itself is also new ground, not just the deployment target.

Still open (answer before scoping CI/CD-to-cloud as a real backlog item):

- Single-threaded or interleaved work style — not yet asked.
- Whether data persistence (last in the sequence) stays scoped to "add a
  real database" or pulls in DATA-01's original broader scope (historical-
  data governance, archival, retrieval, reporting).
- Whether DEMO-01's reconstruction protocol gets revisited once a service
  has durable state, or reconstruction stays proven only for the in-memory
  case and persistence is purely additive.
- What actually gets deployed first under the new CI/CD pipeline — all four
  services, one representative service (mirroring this project's own
  "small real example first" pattern), or just the frontend/static assets
  as the simplest possible first deploy target.

## Added after the sequence (2026-10-07)

- **The first 15 minutes** ([START-01](../BACKLOG.md#start-01--the-first-15-minutes)):
  make it easy for a remote, multi-role group in a regulated organization to start a
  project with this workflow. Comes after CI/CD and data persistence.
- **Software factory** (2026-10-10; candidate START-02 in
  [the 2026-10-10 recap](recaps/2026-10-10-delivery-governance.md)): productize the
  method as a dev container, a template repo and an organization layer. **Decided:
  after data persistence.** Understand every layer of an application, including durable
  state, before productizing it.

## Decided (2026-10-10): CI/CD-to-cloud scoped as SPEC-08

The CI/CD deep-dive is now scoped. Design: [SPEC-08](spec-08-delivery-design.md).
Backlog: [After the talks](../BACKLOG.md#after-the-talks-2026-11-13--governed-delivery).

- **The goal is the developer and agent experience, not deployment speed.** Delivery
  code is an agent-built by-product of a frozen, executable spec (`spec/delivery/`),
  and evidence is a by-product of delivery.
- **Stack: AWS CDK synthesized to CloudFormation, plus CloudFormation Guard (A-18).**
  This supersedes "Terraform on AWS" above. AWS-native keeps the infrastructure
  contract as template JSON an agent can be tested against offline.
- **Compliance:** NIST SP 800-53 Rev 5 Moderate and SSDF (A-16).
- **Runtime:** ECS on Fargate (A-17).
- **Accounts:** AWS Organizations with SCPs.
- **Budget:** $25/month, which makes environments ephemeral.
- **Answers to the open questions above:**
  - Work style: specs now, build after the talks.
  - What deploys first: the whole system, since the services call each other, but
    only into ephemeral environments.
  - Persistence questions stay open until DATA-01.
- **Stale note below:** the ENG-02 carry-over about CODEOWNERS not protecting the
  `portable/` folders is out of date. `.github/CODEOWNERS` now covers both.

## Carried over from ENG-02 scaffolding (2026-10-04)

Two items deliberately deferred here rather than fixed during ENG-02's
`tools/review/` scaffolding pass, since they're really CI/CD-to-cloud-era
concerns (production security gating) more than today's local-review work:

- `.github/CODEOWNERS` still doesn't actually protect `tools/security/portable/`
  or `tools/review/portable/`, despite both folders' READMEs describing
  CODEOWNERS review as their protection model. Fold into the CI-01 scope
  (branch ruleset / required-check work) rather than patching it in isolation.
- `tools/review/project-specific/ownership.test.mjs` (moved from
  `tools/ownership.test.mjs`) is a resource-ownership access-control test,
  not the import-boundary check its old name suggested. Worth a real rename
  or reclassification pass once the actual import-boundary engine exists —
  revisit alongside CI-01/ENG-02 hardening, not before.

## Not scoped yet

This document records sequencing and stack decisions only. No Terraform
code, no AWS account/resource decisions, no backlog item exists for this
yet — that's deliberate, since November prep (DEMO-02, MVP-02A, ENG-02,
PLAY-01) is still the active priority. Pick this back up as its own planning
pass once the November dates have passed.
