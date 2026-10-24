# Factory consumer interface v1 (START-02)

Human-review draft. Status: BACKLOG.md. This defines a future boundary, not an
implemented CLI. Existing application contracts/assertions remain unchanged.
The factory may use Node.js; applications may use any language satisfying their
consumer-owned launch/HTTP contracts (existing JS and Python semantics retained).
No application-language enum or import of application implementation is permitted.

## Invocation and authority

Future entry point: `node <factory>/tools/factory/consumer.mjs verify --root <consumer>
--config factory.config.json --trust <trusted-policy> --mode full`.
`--root` is required, canonicalized, and must equal the consumer Git worktree root.
It may be outside the factory checkout and contain spaces. No cwd/sibling discovery.
Config `application.root` is exactly `.` relative to this explicit root, not the
config directory or factory checkout. The trusted policy is supplied by the human/CI
from its reviewed base revision, outside writable application execution; it is NOT
selected by configuration. Config and policy paths below are consumer-relative unless
explicitly supplied on the command line. Reject unknown keys and wrong types.

Trusted policy v1 contains `schemaVersion: 1`, `applicationId`, `repository`,
`factory: {repository, revision, interfaceVersion}`, `configSha256`, `requiredSuites` (nonempty unique
IDs), `requiredEvidence` (nonempty relative file paths), `protectedPaths`, and
`protectedManifestSha256`. Values bind the reviewed config bytes, factory pin and
consumer baseline; no wildcard pin. A missing/untrusted policy is TRUST_INVALID.
The human-owned root of trust includes this policy's source, config and pin, protected
manifest/path rules, suite selection/commands, required evidence, workflow and owners.
An external trusted-policy snapshot must itself be obtained from a human-approved
revision by the caller, not downloaded on the config's instructions.

Human approval can deliberately change requirements. A factory fetch, version upgrade,
or consumer config edit alone cannot. Verify trust before running any consumer command;
then verify protected file content, membership (including additions/deletions), and
all bindings. A local writable snapshot is not a sandbox against a malicious process;
CI isolation remains separate GATE-ISO-01 work. Never claim this contract supplies it.

## Configuration v1: closed object vocabulary

All fields listed here are required unless marked optional. Paths use `/`, are nonempty
relative paths without `..`; resolve symlinks and reject escape from consumer root.
Input paths must exist; output directories may be created, but cannot overlap inputs,
protected paths, `.git`, or factory checkout. Reject duplicate IDs and output collisions.
No environment interpolation or shell-string evaluation. Commands are argv arrays
with explicit `cwd`; use `{argv: [executable, ...args], cwd: relative-directory}`.
Environment values are strings; path values use `{path: relative-path}` resolved at run
time. An executable may be an absolute installed tool or a cwd-relative executable.

| Field | Type and meaning |
|---|---|
| `schemaVersion` | integer exactly 1; incompatible versions fail, never infer/migrate |
| `application` | `{id, repository, root}`; stable nonempty ID, owner/repo identity, root `.` |
| `factory` | `{repository, revision, interfaceVersion}`; repository URL, full lowercase 40-hex SHA, interfaceVersion exactly 1; SHA is the factory version, no registry/semver required |
| `locations` | `{domainContracts, apiContracts, bdd, performanceScenarios, performanceWorkloads, applicationPolicies, fixtures}`; each a nonempty array of relative files/directories |
| `runtime` | `{contract, projects, startupGroups, telemetry}`; contract is a consumer path; projects described below |
| `testing` | `{policy, cwd, results, evidence}`; paths to protected existing test policy, suite working directory, results directory, evidence directory |
| `trust` | `{protectedPaths, manifest, configuration}`; protected-paths JSON, manifest file and consumer trust policy source paths; these do not override the external trust snapshot |
| `contractVersions` | nonempty array `{id, version, path}`; version is opaque consumer label, path supplies content hash so mutable labels cannot impersonate old contracts |

Project fields: `id`, `kind` (`service`, `frontend`, `fake`, `collector`), `cwd`,
`setup`, `start` (command objects), `dependsOn` (runtime ID array), `environment`
(mapping), `health: {url, status: 200, json: {status: "ok"}, timeoutMs: 10000}`,
`stop: {signal: "SIGTERM", timeoutMs: 5000}`; optional `testFacilities` with
`enable: {variable, enabledValue, disabledValue}`, `reset: {method, path, status}`,
and optional `clock: {method, path, status, bodyField, initialEnvironmentVariable}`.
URLs are explicit HTTP loopback URLs for this local interface. No cloud endpoints.

Zero projects/groups are allowed for verification-only consumers.
`startupGroups` is an ordered array of nonempty arrays of project IDs, each ID exactly
once. Start all members of a group before waiting for their health; all must become
healthy before the next group. Runtime `dependsOn` validates known endpoints but may
cycle; it is NOT a topological startup constraint. Reject unknown/missing/duplicate
members. Stop all processes started by this invocation on failure, including process
groups; report cleanup failure. Protected test policy may declare `runtimeOwnership: "suite"` (default `"factory"`).
In suite-owned mode, validate all configured startup groups and test facilities,
then stop and await all factory-owned runtime processes before executing suites.
Existing lifecycle tests own subsequent processes; no unrelated process is stopped.
PetClinic uses this mode to preserve its port, disabled-endpoint and performance tests.
Unknown ownership values fail TRUST_INVALID before startup.

Setup is explicitly separate and never implicit in
verify; missing tooling does not trigger installation/network fallback.

Telemetry: `{endpoint, protocol, tracesExporter, metricsExporter, logsExporter,
batchDelayMs, waitMs}`. PetClinic retains http/protobuf, otlp, none, none, 100, 5000;
its project environment retains exact OTEL service names. Clock/reset/auth, static ports,
seed behavior and test endpoints retain RT-001..009. The factory does not reinterpret
calendar time or synthesize auth. Reset/clock requests only target declared facilities
in enabled test mode; disabled endpoints still return 404 under existing tests.
Startup dependency ordering is orchestration metadata, not a new application API.

## PetClinic adoption bindings (no runtime change)

Use `spec/contracts/domain.openapi.json`; API files under `spec/contracts/`;
BDD `spec/features/` and steps/workflows under `spec/tests/`; performance scenarios
`spec/features/performance/`, workloads/policy `spec/tests/performance/`; policies
`spec/test-policy.json`, `spec/delivery/`, `tools/review/project-specific/`,
`tools/security/project-specific/`; fixtures `spec/seed-data/`, `spec/fakes/payment/`,
`spec/tests/support/`, `spec/frontend/`. The executable boundary tests construct a synthetic configuration using this wire
format; that fixture is not an operational PetClinic config/pin.
PetClinic configuration during extraction must enumerate all seven projects from
`spec/harness/config.js`, using their existing setup/start scripts and environment:

| Group | Project IDs / ports | Bindings retained |
|---|---|---|
| 1 | collector / 4318, payment / 4010 | collector OTLP; payment reset/call counts |
| 2 | customer / 4001, reservation / 4002, veterinarian-services / 4003, checkout / 4004 | cyclic runtime dependencies from config.js; independent health; reset/clock |
| 3 | frontend / 3000 | existing backend URLs; no invented reset/clock |

Preserve `CLINIC_NOW`, `PETCLINIC_TEST_ENDPOINTS`, `AUTH_TOKEN_SECRET`,
`SEED_DATA_DIR`, `FRONTEND_ORIGIN`, dependency URL names and existing OTEL values.
`config.js` includes Customer→Reservation; the older runtime-contract dependency
variable table omits this existing binding. Extraction must preserve the actual
approved roster behavior, not remove that dependency to fit the older table.
No rename of environment variables, API schema, BDD/OBS IDs or risk tags is proposed.

Performance ownership includes workers=5, warmup=2s, measurement=10s, cadence=500ms,
per-operation p95<200ms, >=20 samples, 2s timeout, zero unexpected errors and financial
correctness, same host/telemetry assumptions, no concurrent validation suites, and
60s deadlock safeguard. Keep `gate.js` including assertPaid with PetClinic. Only a
parameterized generic scheduling/measurement mechanism may be extracted later;
factory defaults cannot replace thresholds, timing windows or workload assertions.

## Selection and failure contract

Full mode runs the trusted required suites, including guard, regardless of config
selection or fast-mode rules. The current PetClinic full-tier IDs remain guard,
harness, schema, runtime, auth, observability, features, workflows, browser,
performance, accepted-risks, delivery, evidence, dora. REVIEW-02 remains outside
that tier as currently specified. Required suite removal, command alteration or
full-tier reduction changes protected config/policy and requires human freeze.
Fast mode may select by existing policy; it returns `INCOMPLETE`, never `COMPLETE`.
Exit 0 in fast mode means selected checks passed, not full verification.
This specification phase does not run the real full command or guard.

The CLI emits one JSON object to stdout (logs on stderr), with `interfaceVersion: 1`,
`status: COMPLETE|FAILED|INCOMPLETE`, `category` (null only for success), `message`,
`suites` (IDs, exit codes, log paths), and `evidence` path or null. Never classify a
missing implementation as passing. Validation precedes startup, which precedes tests,
which precede evidence verification. Report all observed failures, primary category
from the first failed phase; within a phase use the table order. Stop on preflight
failure; don't fabricate later test results.

| Category | Exit | Required behavior |
|---|---|---|
| CONFIG_INVALID | 2 | Missing/malformed config, wrong types, absent referenced input, path escape/collision, invalid project/group; execute nothing |
| VERSION_INCOMPATIBLE | 3 | Unsupported schema/interface, factory checkout revision mismatch/dirty checkout or missing pinned commit; no fallback/fetch upgrade |
| TRUST_INVALID | 4 | Missing trusted policy, hash/membership mismatch, weakened required suites/evidence, unreviewed pin/config; execute nothing |
| TOOLING_UNAVAILABLE | 5 | Executable/runtime/container unavailable; distinguish from product failure; no implicit install |
| STARTUP_FAILED | 6 | Start exits, health wrong/times out, or required reset/clock fails; identify project/log, clean up owned processes |
| APPLICATION_TEST_FAILED | 7 | Any required suite exits nonzero or times out; CLI nonzero even if later suites pass |
| EVIDENCE_MISSING | 8 | Required evidence absent/malformed/stale/wrong identity; cannot report COMPLETE |
| FACTORY_ERROR | 9 | Unexpected verifier/output/cleanup error; fail closed with diagnostic, not product failure |

## Evidence envelope v1

Add a separate `consumer-evidence.v1` envelope; do not mutate change-evidence.v1 or
claim its single-tree verifier already understands two repositories. Required fields:
`schemaVersion: 1`, `applicationId`, `consumer: {repository, revision, treeSha256,
dirty}`, `factory: {repository, revision, interfaceVersion}`, `configuration:
{schemaVersion, sha256}`, `trust: {policySha256, manifestSha256}`, `contracts`
(array `{id, version, path, sha256}`), `mode`, `status`, `category`, `suites`,
`artifacts` (relative path and SHA256), `toolVersions`, `startedAt`, `finishedAt`.
Git revision is a full commit SHA; dirty consumer content must not be labeled clean.
Hash raw config/policy/contract bytes. Tree hash: SHA256 of sorted UTF-8 POSIX-path
records `sha256(two spaces)path(newline)` for tracked and nonignored untracked regular
input files, excluding .git and declared outputs; reject escaping symlinks. Include
file mode in a separate sorted `mode(two spaces)path(newline)` section appended to
these records. Use identical tree rules for cache identity; pin/config/contracts/trust
changes invalidate prior evidence. Outputs must not change input identity.

Required evidence files are read after suites complete and bound to this run, not
accepted merely for existing. Each artifact includes run ID, consumer tree and factory
revision; stale identity fails. Envelope itself is not a required input artifact (no
recursive self-hash). Attach any unchanged v1 report as an artifact; never upgrade its
claims by wrapping it. Local evidence is unsigned; CI remains authoritative.

Suite commands receive `FACTORY_APPLICATION_ROOT` (canonical absolute root),
`FACTORY_RUN_ID` (unique per invocation), `FACTORY_CONSUMER_TREE` and
`FACTORY_REVISION` and `FACTORY_CHECKOUT` (canonical executing factory root).
The reviewed PetClinic runner adapter imports its mechanism from that explicit root
during consumer verification; ordinary legacy invocation retains its local binding.
These override same-named consumer environment values and are
provenance context, not authentication. Suites emit required JSON artifacts with
`runId`, `consumerTree` and `factoryRevision`. Legacy reports need a reviewed adapter
that binds their hashes to this context without changing their meaning. The factory
must not manufacture a successful test result when such an adapter is absent.

## Boundary test execution

Run directly: `node --test spec/tests/factory/consumer-boundary.test.js`.
The test fixture creates only disposable synthetic Git repositories and its own
baseline text; it never calls/imports guard or changes `spec/protected.sha256`.
Run future positive tests from the reviewed clean factory revision: rejecting a dirty
factory is intentional, so a dirty development checkout cannot provide positive
immutable-consumption evidence. No production CLI is provided in this specification.
Additional extraction checks must cover group health timeout/cleanup, disabled test
facilities, symlink escape, fast-mode INCOMPLETE, and protected membership changes;
the current tests do not claim full runtime-contract coverage. Existing RT tests
remain authoritative for application HTTP behavior.

## PetClinic local adoption authority and legacy binding

`spec/factory/petclinic/config.json`, `policy.json` and `authority.json` are protected consumer inputs. The authority source declares required suites/evidence; the caller materializes config/manifest hashes from an explicit human-reviewed commit into an external trusted-policy snapshot. This avoids a self-referential manifest hash: the generated external snapshot is not its own protected source. Materialization does not constitute approval or freeze.

The reviewed `tools/petclinic/suite.mjs` adapter is protected. It executes each unchanged legacy full-tier suite without cache, records its v1 run ID against FACTORY_RUN_ID, and requires every selected passing record to belong to this invocation before producing the binding. The protected suite order preserves finalization after the last legacy suite. The original v1 generator/verifier remain authoritative for v1 meaning.

The required binding JSON carries runId, consumerTree, factoryRevision and `artifacts` (relative output paths and SHA256 hashes). After runtime cleanup the factory verifies each bound file hash and includes those paths/hashes in the separate envelope. It neither rewrites the legacy report nor adds two-repository claims to it. PetClinic outputs are test-results/ and factory-evidence/. Local snapshot pins are review candidates, not released revisions or independent-repository proof.
