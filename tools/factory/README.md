# Local factory mechanisms

`consumer.mjs verify --root <consumer> --config factory.config.json --trust <trusted-policy> --mode full`
implements the frozen `spec/factory/consumer-contract.v1.md` boundary. Invoke with
Node from a clean factory checkout pinned to its full Git SHA. No registry or implicit
fetch/install is used. Consumer paths, runtime bindings, tests and requirements come
from the reviewed consumer configuration and external trusted policy.

- `core.mjs`: closed configuration validation, path containment, frozen-input checking,
  Git identity and consumer tree hashing.
- `processes.mjs`: argv-based launch, grouped startup, health/test facilities and owned
  process-group cleanup. It never frees ports owned by unrelated processes.
- `consumer.mjs`: required suite execution and separate consumer-evidence.v1 output.
  Fast mode conservatively runs required suites but reports INCOMPLETE. No cache reuse.
- `index.mjs` / `legacy-runner.mjs`: compatibility runner extracted from the existing
  protected runner. All application paths, service IDs and tree environment variable
  are explicit arguments. Existing evidence-v1 semantics remain distinct.

The separate PetClinic consumer’s `spec/run-all.js` is the thin compatibility adapter for `runLegacy`.
Consumer requirements, assertions, runtime bindings and evidence-v1 meanings stay
application-owned. See [BACKLOG START-02](../../BACKLOG.md) for integration evidence,
independent consumer proof and remaining separation milestones. Lifecycle delivery
is not implemented. Evidence-v1 retains spec/run-all.js, protected manifest and feature-directory
conventions; these are compatibility constraints, not application imports.

Verification commands (boundary cases require a clean committed factory snapshot):

```sh
node --test --test-concurrency=1 spec/tests/factory/consumer-boundary.test.js tools/factory/self-test.mjs
node --test tools/factory/legacy-runner.test.mjs
```

The additional tests use disposable synthetic consumers. The legacy regression driver
preserves the frozen CI-02 assertions with an isolated fixture using the extracted
runner. Neither driver replaces a consumer-owned application gate. Temporary local test
commits are not human-reviewed release pins. The external trust snapshot is the
caller's responsibility; local hashes do not isolate hostile code or certify evidence.

## Governed local changes

The frozen interface is [governed-change.v1](../../spec/factory/governed-change.v1.md).
From a clean, committed factory checkout:

```sh
node tools/factory/change.mjs run --root /absolute/consumer --task spec/change.json --authority /external/authority.json --runner /external/runner.json --output /external/new-run
node tools/factory/change.mjs check --evidence /external/new-run/governed-change-evidence.v1.json
node --test tools/factory/change.test.mjs
```

The additional regression tests also run through `self-test.mjs` in the required
boundary suite.

The authority binds the reviewed starting consumer commit, task digest, factory pin,
consumer trust and runner descriptor. Paths are resolved before output approval.
The coordinator retains private candidate and verification clones, a journal,
process logs, a reviewable diff and separate governed-change evidence. Explicit
create/update/delete grants permit only named application files. Protected inputs,
original checkout and Git metadata are checked independently. Ignored files also
participate in permission enforcement and stale-evidence checking; only declared
verifier output roots are excluded from verifier input comparison.

Only explicitly declared fixture launchers run. Their success is
`SIMULATED_VERIFIED` (exit 0), never a real application-change demonstration.
Otherwise-valid real launcher requests fail before execution with `TOOLING_UNAVAILABLE`
(exit 5): the implemented OS-enforced launcher, credential broker and independent
verifier integration still require complete profile qualification. Fixture processes run with
an allowlisted environment and process-group cleanup, but are trusted test code,
not a security sandbox. Post-execution checks cannot prevent a hostile fixture
from writing outside its workspace. Do not use fixture mode for application work.

Failures after output creation retain their run directories and report a nonzero
contract exit status; preflight failures create no run directory. SIGINT/SIGTERM
report 130 after successful cleanup; cleanup failure overrides that with exit 9. Metadata-tampering failures retain a JSON
filesystem change list without executing Git against the compromised metadata.
`check` rejects nonterminal runs and stale inputs/artifacts. Nothing automatically
resumes, commits, merges, publishes or deletes a retained run. Host-loss process
recovery is not qualified: process IDs are journaled after launch, leaving a crash
window. Human inspection and explicit cleanup remain necessary after host loss.
PetClinic implementation and any consumer pin upgrade remain separate work.


The proposed [local broker setup](../../docs/design/start-02-factory-core.md#local-model-broker-setup-for-review)
and [disabled configuration template](broker.config.example.json) describe the credential
boundary for review. The template is not a runnable launcher or accepted coordinator
configuration. Keep credentials external; no broker or model call is enabled by it.


`model-broker.mjs` exports the single-run relay component; `credential-store.mjs`
exports a local-file implementation of `readSecret({signal})`. This separates the
credential “wallet” from model forwarding. The AWS Secrets Manager adapter is
implemented and tested offline; live configuration and qualification remain pending.
OS-keychain support remains future work. Neither adapter gives the runner the upstream secret. The local file
is not an encrypted wallet. For the bearer Responses transport, the component supports bounded text/structured-message
requests, local function/custom-tool roundtrips and buffered Responses SSE. Streams
are withheld until completion, item consistency and decoded secret checks pass.
Hosted tools, namespaces, remote inputs and unknown request fields fail closed. Client tracing
and cache metadata are discarded; output limits are supplied when the client omits
them. Owner-side coordinator integration exists behind the disabled real-profile
qualification gate. Run offline checks with `node --test tools/factory/model-broker.test.mjs`;
they also participate in the required boundary suite. No live credentials are needed.


An explicit offline compatibility probe uses an installed Codex executable with a
private temporary HOME, no saved authentication, disabled web search/multi-agent
features and a fake model endpoint behind the real broker:

```sh
node tools/factory/broker-codex-probe.mjs --codex /absolute/path/to/codex
```

The macOS probe retains its report under `/private/tmp/`, records the executable
SHA256/version, and requires a successful neutral `printf` tool roundtrip plus a
final response. It checks cleanup before reporting success and uses the shared
bounded process-group stop mechanism. It is explicit rather than part of the
portable gate because the Codex executable is externally provisioned. The regular
boundary gate always runs protocol and adversarial tests without that executable.
Synthetic model responses prove wire compatibility only; they are not a real coding
agent demonstration. No model catalog/API access, Linux image compatibility or
mandatory launcher conformance is inferred. Broker deployment remains separate work. Offline Linux component packaging is
described below; the disabled template does not start a service.

### Offline Linux component packaging

`packaging/inputs.json` pins the Linux arm64 Codex archive by SHA-512 and the
cached Node base by image digest. Provision that exact archive explicitly from its
recorded URL, then run:

```bash
python3 tools/factory/packaging/build-local.py --archive /absolute/codex.tgz --output /absolute/new-external-directory
PYTHONDONTWRITEBYTECODE=1 python3 tools/factory/packaging/build-local.test.py
```

The builder rejects existing output, factory overlap through shortcuts, mismatched
archives and unsafe archive members before staging. It requires the pinned base to
already exist locally, builds with `--network=none --pull=false`, and records input
hashes and resulting immutable image IDs. It does not fetch packages or run npm
installation hooks. Keep the output as a packaging record; failed output is retained.
Only Linux arm64 is covered. The full pinned platform package is preserved, including
its bundled resources; no mutable transitive npm resolution is performed.

These images are components, not a governed launcher. The runner's default command
only reports its version; the broker image runs neutral offline tests and starts no
credential-bearing service. For smoke checks use recorded image IDs with
`docker run --rm --pull=never --network=none --read-only --cap-drop=ALL
--security-opt=no-new-privileges --pids-limit=128 --memory=512m --cpus=2
--tmpfs=/tmp:rw,nosuid,nodev,size=128m,mode=1777 <image-id>`.
No host folders, sockets or credentials are mounted. A version check and passing
broker tests do not prove coding-agent isolation, denial auditing or independent
consumer verification. Production runner startup must provision its private HOME;
the version-only smoke may warn that CODEX_HOME does not yet exist.

### Container ownership and recovery component

`container-session.mjs` separates prepare, start, completion and explicit recovery.
It writes and flushes a unique container name and run label before Docker creates
anything, then records the resolved container ID before starting workload code.
A lost create response can therefore be reconciled by the recorded name and label.
Recovery checks ID, name, label and pinned image before stopping a container. It
never restarts work, converts interruption to success, or rewrites terminal history.
Journals and stopped containers are retained; deletion is not part of recovery.

The fixed component profile has no network, host mounts or forwarded credentials,
a read-only root, dropped capabilities, an unprivileged UID, private temporary
storage and bounded resources/logs. Images with implicit volumes are rejected.
Callers supply an absolute Docker executable, cached image ID, argv and new external
session directory; they must include all consumer/trust roots in `forbiddenRoots`.
The factory checkout is always excluded. This is a trusted host library, not an
untrusted-runner API or approved launcher descriptor parser. Arguments and image
configuration must contain no secrets. Docker remains owner-provisioned host tooling.

`finishSession` waits for exit or an explicit timeout/AbortSignal, then stops remaining
work and verifies the container is stopped with PID zero before recording a result.
The timeout starts when `finishSession` is called. Callers must use it immediately
after start and must connect coordinator signals to its AbortSignal; this component
does not install global signal handlers. A caller crash leaves the durable journal
for explicit recovery. Docker unavailability fails closed and requires retrying
recovery once the daemon is available. A component `COMPLETE` means only zero process
exit with confirmed cleanup; it is never consumer evidence or VERIFIED_CANDIDATE.

Run its explicit Docker tests against the reviewed local broker component image:

```bash
FACTORY_DOCKER=/absolute/path/to/docker \
FACTORY_COMPONENT_IMAGE=sha256:<recorded-broker-image-id> \
node --test tools/factory/container-session.test.mjs
```

These optional platform tests retain private temporary journals and remove only
stopped test-owned containers. They are separate from the portable gate, which has
no Docker prerequisite. This module is not integrated with `change.mjs`; the fixture
coordinator's PID-journaling limitation, denial-attempt audit, scoped source writes,
private model network and independent verifier qualification remain separate work.

### Fixed independent denial-audit experiment

`audit-probe/` tests a root-owned syscall observer against a fixed unprivileged
workload that suppresses its errors and reports success. The observer checks denied
direct/symlink/hardlink writes, protected create/delete, a descendant's write,
audit-log read/overwrite and signalling the observer. It also checks unchanged
protected bytes and allowed private scratch. These are neutral fixtures baked into
the image; no consumer, factory checkout, host socket or credential is mounted.

The optional packaging input `--strace-archive /absolute/strace.deb` adds an auditor
image. `packaging/inputs.json` pins the exact Debian arm64 archive and SHA-256; its
libc dependency comes from the pinned base. Downloading is explicit provisioning;
the builder validates bytes before staging, does not run package-maintainer scripts,
and builds without network access. The artifact is a probe image, not a deployed
audit service or qualified runner. No publisher-signature verification is claimed.

```bash
python3 tools/factory/packaging/build-local.py \
  --archive /absolute/codex.tgz --strace-archive /absolute/strace.deb \
  --output /absolute/new-packaging-directory
python3 tools/factory/audit-probe/run-probe.py \
  --docker /absolute/path/to/docker --image sha256:<recorded-auditor-image-id> \
  --output /absolute/new-probe-directory
```

The explicit test driver records the create arguments and container ID before
start. It uses no network, a read-only root, dropped default capabilities, private
0700 audit storage and bounded resources. Only the trusted observer receives
SYS_PTRACE/SETUID/SETGID/KILL; the traced workload runs as `nobody`. The independent
container-lifecycle component is not changed to grant these capabilities. The driver
also tests missing SYS_PTRACE and an explicitly unfiltered negative control. It confirms outer container shutdown before evaluating
results and removes only stopped test-owned containers after successful validation.
Failed test records and containers remain inspectable. This driver is a fixed test
harness, not a general launcher or recovery implementation.

Raw traces are retained solely for this credential-free fixed workload. They must
not be enabled for credential-bearing work without a separate disclosure review.
The recognizer is tied to this workload and strace dialect. It does not establish
complete syscall coverage, tracing-escape resistance, grant enforcement, arbitrary
agent compatibility or independent verifier qualification. `PROBE_PASSED` means this
experiment passed; `realRunnerQualified` remains false. Missing observation or
unconfirmed cleanup cannot produce a passing probe.

The probe now starts its tracee through `isolation/syscall-guard.c`, compiled offline
using the separately pinned compiler image recorded in `packaging/inputs.json`.
Both runtime and compiler images must already be cached; no compiler or dependency
is fetched by a run. The runtime remains Node 24; the Node 20 build image supplies
only the pinned C toolchain. This filter is Linux little-endian arm64 only. It refuses
to execute the workload if mandatory filter installation fails.

The filter rejects `clone(CLONE_UNTRACED)` and returns ENOSYS for `clone3` so ordinary
fork/thread creation can fall back to traced `clone`. It also rejects ptrace, process
memory and descriptor access, io_uring and legacy asynchronous I/O, userfaultfd,
unshare/setns namespace operations and process-group/session escape operations. The three fixed runs
must show: guarded denials plus ordinary-child observation; missing observer capability
without a passing report; and an unfiltered child that runs but whose protected-write
attempt is absent from the trace. The unfiltered control returns ESCAPE_REPRODUCED,
never a qualified-runner result. These control modes exist only in the probe image.

The CLONE_UNTRACED comparison demonstrates a specific corrected audit gap. Other
EPERM results may also reflect Docker's existing controls; they do not independently
prove new-filter causality. The component is not yet installed in the coding-runner
image or change coordinator. Fixed inherited-descriptor and update-only literal
mount checks pass as components. Complete syscall/alias coverage and their integration
with the independent verifier still require end-to-end qualification. The filter is defense in depth, not a filesystem authorization engine.

### Update-only workspace confinement and verifier prerequisite

`container-session.mjs` accepts an optional `filesystem` profile with a canonical
private `root` and explicit `permissions:{create:[],update:[...],delete:[]}`. It binds
that tree read-only at `/workspace` and overlays only existing, unaliased, single-link
regular update files as writable. Nonempty source create/delete grants fail closed;
this backend does not claim general lifecycle support. The caller must supply a
coordinator-owned private staging tree, keep it stable during launch, include the
original consumer/trusted roots in `forbiddenRoots`, and validate task authority and
protected-path exclusions before requesting mounts. This low-level helper is not an
authority validator. Special files throughout the tree are rejected because a
read-only mount does not prevent connecting to a Unix socket. Scratch remains private
container tmpfs. Mount tests are explicit Docker component checks, not portable gate
or arbitrary-workload conformance. The tracee syscall guard closes inherited file
descriptors numbered 3 and above; its launcher must provide trusted stdio.

Records under `test-results/start02-verifier-profile/` include the native descriptor
regression, fixed audit controls and mount tests. Real execution in `change.mjs`
remains disabled. The original PetClinic protected browser adapter starts Docker,
mounts a writable checkout and can install dependencies at runtime. The reviewed consumer change `1e477272b3a548af46356e739ffe50dc7cc1d9d8` adds an explicit preprovisioned mode, preserving
the pinned reference image, lockfile checks, complete test command and arguments.
It performs no install and exposes no Docker socket. Its read-only image marker is
only a dispatch precondition: a trusted coordinator must additionally bind and verify
the actual immutable verifier image. The owner applied, froze and committed this adapter change;
that approval does not qualify the complete verifier profile. No application behavior or acceptance test is changed.

### AWS broker: Kimi K3 through Converse

The owner-selected local configuration is Region `us-east-1`, AWS profile
`software-factory-dev`, foundation model `moonshotai.kimi-k3` and US inference
profile **`us.moonshotai.kimi-k3`**. AWS discovery returned the profile ACTIVE and
model agreement, entitlement and Region AVAILABLE, with authorization AUTHORIZED.
These are control-plane checks, not proof of an inference invocation. US inference
can route to `us-east-1`, `us-east-2` or `us-west-2`; this is not a single-Region pin.
Non-prod/prod environments remain later work.

`aws/converse.mjs` exports `createProfileModelBroker({runId, region, profile, model,
...limits})`, which wires the pinned Bedrock Runtime SDK into `model-broker.mjs`.
Supply the exact identifiers above from the reviewed configuration. It returns the
existing broker server/token/close interface; it neither listens nor launches a
runner automatically. Authentication uses the explicitly named AWS profile via
`fromIni`, with no default/environment credential-chain fallback. Credentials stay
inside the broker process and never appear in the configuration, runner or evidence.
The profile must remain valid (including its SSO session). Invoke permission requires
`bedrock:InvokeModel` for the selected inference profile and its routed models.

`bedrock-converse.mjs` translates the bounded Responses request to Converse text
and JSON function tools. Completed output is validated before JSON or buffered SSE
is released. Truncation, filtering, invalid tool identities, forbidden parallel calls
and unsupported input fail closed. Previous-turn reasoning blocks are omitted as
required by the [Kimi K3 Converse limitations](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k3.html).
Strict function schemas, explicit reasoning/verbosity controls, document input and
custom/grammar tools are unsupported and rejected before invocation; this does **not** establish full Codex-runner compatibility.
The existing runner probe must pass against the actual adapter before live governed
work. No fake transport substitutes for that demonstration.

The disabled `broker.config.example.json` records these identifiers. Keep it disabled
until launcher qualification and immutable image bindings are complete. The SDK's
exact versions and transitive integrity hashes are in `aws/package-lock.json`.
Run `node --test tools/factory/bedrock-converse.test.mjs tools/factory/model-broker.test.mjs`
and `node --test tools/factory/aws/converse.test.mjs` for credential-free checks.
For offline packaging use `--aws --aws-cache /absolute/preprovisioned/npm-cache`;
clean `npm ci --offline --ignore-scripts` fails on an incomplete cache and excludes
stale installed files. Existing `aws-secrets.mjs` and Responses endpoint helpers
remain optional components for other bindings; Kimi Converse does not use a bearer
key or require a Secrets Manager ARN/version.

### Independent verifier baseline

The corrected independent-verifier experiment runs frozen consumer
`1e477272b3a548af46356e739ffe50dc7cc1d9d8` with its existing factory pin
`9809c120cafd0ad867be6568621fac3ef54f1780`, inside immutable image
`sha256:c02aaabd1cb99508e0848ee722214946fc18a391ec081a231683920fc2bd62b6`.
Consumer/factory files are read-only, only declared result/evidence directories are
writable, external networking is disabled and no Docker socket or AWS credentials
are present. Private scratch permits execution because frozen CI-authority tests
create a local Git shim. Dependencies for consumer and factory were installed from
local cache with lock integrity and scripts disabled before image construction.
The full gate returned exit 1 for exactly the two unimplemented D-67 scenarios
GPC-001/GPC-005 (400 instead of 409); all other required suites passed, including
browser 9/9, performance 4/4 and evidence/DORA tests. A separate permission probe
confirmed denied source, policy, Git and factory writes, aliases and descendant
writes, while allowing evidence output and loopback. Cleanup preceded hashes.
Records: `test-results/start02-independent-verifier/`. This is retained baseline and
profile evidence, not a governed candidate, real-agent demonstration, complete
consumer gate or current-factory pin upgrade. Reusable coordinator integration and
arbitrary-runner denial audit conformance remain outstanding.


### Independent verifier lifecycle integration

`verifier-session.mjs` runs a provisioned image through the shared container-session
lifecycle, mounting an isolated candidate read-only at `/workspace` and forcing that
working directory. Within the candidate mount, only declared output directories are
writable; private scratch remains writable. Trusted consumer
configuration must supply the protected paths and output bindings; existing output
shortcuts and protected overlap are rejected before Docker operations. The profile
cannot also grant application writes. No dependencies are installed by this component.

The journal remains `PENDING_EVIDENCE` after zero exit until post-cleanup collection.
After zero exit, nonregular and aliased outputs fail with `EVIDENCE_INVALID`;
when collection fails, existing failure/interruption phases retain their outcome
with collection status INVALID. Successful collection is
`OUTPUTS_COLLECTED`, **not** consumer COMPLETE or governed VERIFIED_CANDIDATE. The
caller must supply validated authority and current-tree expectations and perform
subsequent stale checks. Without a consumerEvidence binding, envelope validation
remains the caller’s responsibility. Failed tests and interruption remain
non-success outcomes. Outputs and stopped containers remain inspectable.

Run explicit offline Docker integration checks with `FACTORY_DOCKER` and
`FACTORY_COMPONENT_IMAGE` (immutable cached image ID):
`node --test tools/factory/verifier-session.test.mjs tools/factory/container-session.test.mjs`.
These tests are separate from the portable factory gate. A trusted verifier profile
may supply bounded `resources` (memoryMiB, pids, scratchMiB, shmMiB and
executableScratch). Defaults remain 512 MiB, 128 PIDs and non-executable scratch;
only verification can opt into larger limits and executable scratch. Limits are
validated before Docker and recorded in the journal. This does not enable the real
coding runner. The shared profile has reproduced the frozen PetClinic baseline
with 2048 MiB, 512 PIDs, 512 MiB executable scratch and 256 MiB shared memory.


The shared `consumer-proof.mjs` validator is used by the change coordinator and by
`runVerifierSession` when an explicit `consumerEvidence` binding is supplied. The
binding contains the envelope path and expectations derived independently from trusted
consumer authority: repository/revisions, tree/configuration/trust hashes, required
suites and required evidence. Callers must derive these expectations independently, never from the envelope itself. Validation
runs after cleanup and artifact collection; stale identity, missing/failed/duplicate
suites and missing/stale/duplicate artifacts reject. A zero-exit verifier with invalid
proof records EVIDENCE_INVALID. Collection without a binding remains only collection;
neither path activates the real runner or produces governed success. The caller still
owns current-input fingerprinting, authority validation and subsequent stale checks.


Credential-free external-container qualification is approved. The original nested
CLI sandbox failed namespace creation; those diagnostics remain under
`test-results/start02-linux-cli-audit/`. The approved profile uses the actual CLI's
`danger-full-access` mode only within external Docker enforcement. The optional
native `--container-owned` mode permits process sessions; it is a caller assertion
of whole-container ownership, not an isolation attestation. Default host mode still
denies those calls. The disabled proposal is retained unchanged.

Run the component checks against an explicitly provisioned immutable local image:

```sh
node tools/factory/external-qualification.mjs --docker /absolute/docker --image sha256:IMAGE_DIGEST --output /new/external/output
```

The image must provide `/opt/protocol/broker-codex-probe.mjs`, `/opt/guarded-codex`,
`/opt/guard-check`, and `/opt/factory/syscall-guard`. This command uses synthetic
responses and no live credentials. It verifies the actual command roundtrip, both
native guard modes and detached-writer cleanup. The inner protocol report always
leaves cleanup unconfirmed; the host checks the independent container journal.
A protocol result alone is never governed success. The fixed-path denial experiment
is separate; neither component tool establishes arbitrary-workload audit coverage
or enables the real launcher. See `test-results/start02-external-qualification/`.

`syscall-audit.mjs` analyzes retained observer bytes independently of runner output.
`analyzeSyscallTrace(Buffer)` reconstructs interleaved calls and retains every
EACCES, EPERM and EROFS result, including reads and process operations. Its outcomes
are DENIAL_OBSERVED, UNRESOLVED_MUTATION_FAILURE or NO_DENIAL_OBSERVED; none is a successful qualification.
Malformed/truncated input throws. Arguments remain raw trace text, not canonical
paths or contract violation objects. The caller must separately establish trusted
collection, syscall coverage, containment, shutdown and trace identity. A syntactically
valid trace can still omit unobserved activity, so analysis cannot authorize execution.

`audit-session.mjs` integrates credential-free collection with the shared container
lifecycle. `runAuditSession` forces the trusted image entry point
`/opt/factory/audited-runner.mjs`; the latter traces all syscalls as root while the
coding workload runs as nobody behind the native guard. An explicitly labeled native
Docker volume retains observer-owned 0700 audit files. Host bind permissions are not
an audit boundary on Docker Desktop. After verified shutdown, the host validates
volume ownership, copies known artifacts, validates the receipt and hashes, and
analyzes the trace. `checkAuditSession` rejects subsequent collected-artifact edits.
Volumes and stopped containers are retained for inspection; these are local test
resources, not application repositories or deployment resources.

Terminal AUDIT_COLLECTED means component collection only. PERMISSION_DENIED,
AUDIT_UNRESOLVED, AUDIT_INVALID, FAILED, INTERRUPTED and TIMED_OUT cannot qualify the
runner. Non-permission failed mutations remain in `mutationFailures`; no textual
scratch-prefix exception is applied. `audit-session.test.mjs` requires explicit
FACTORY_DOCKER and immutable FACTORY_AUDIT_IMAGE, so Docker tests are run separately
from the portable gate. The design records the unresolved syscall-time identity
requirement before real activation.

### Native syscall-observer prerequisites

The human-frozen SCT requirements and case matrix live in
`spec/factory/governed-change.v1.md` and
`spec/factory/syscall-observer-cases.v1.json`. The separate native component described below is not a real-runner activation.
`isolation/syscall-stop-probe.c` is a fixed two-thread Linux fixture,
not a launcher or substitute for the eight platform cases. It checks acknowledged
ptrace stops, remote-memory access and private-path/held-descriptor identity using
only the existing capabilities. The original failed probes remain in test-results.

Build from cached pinned images and run the positive/negative prerequisites:

```sh
docker build --network=none --pull=false --iidfile /tmp/sct-probe-image \
  -f tools/factory/isolation/stop-probe.Dockerfile tools/factory/isolation
python3 tools/factory/isolation/run-stop-probe.py --image "$(cat /tmp/sct-probe-image)"
python3 tools/factory/isolation/run-stop-probe.py --without-ptrace --image "$(cat /tmp/sct-probe-image)"
python3 tools/factory/isolation/run-stop-probe.test.py
```

The missing-capability run must exit 5. The host driver retains the exited container
and reports only after checking shutdown and validating the native receipt; an
exit-zero container without a valid receipt does not pass. These tests use no AWS
credentials or model calls. The offline real-CLI probe disables shell snapshots and
uses non-login `/bin/sh` for its fixed command to avoid forbidden terminal probes;
that is a qualification configuration, not a restriction already enforced on arbitrary
model-selected commands.


### Native observer component qualification

`isolation/syscall-observer.c` runs only inside the Linux arm64 container, with the
existing SETUID/SETGID/SYS_PTRACE capability set. It launches the nobody tracee through
the mandatory syscall guard, tracks descendants, stops all known writers before
binding a mutation, and resumes only the selected syscall through its disposition.
Target evidence includes mount/inode identity, relative-path base identity, root/cwd
context, stopped-task start times and the original requested path as hex. Each identity
record is linked to its syscall entry. Kernel and injected denial results are separate.
Unsupported forms (including linkat source-following/empty-path flags and nonleader
exec) fail closed. Plain linkat binds the source inode without following its final
symlink and the destination parent; both must be authorized scratch targets.

`native-audit-session.mjs` reuses the existing container lifecycle and collects only
after whole-container shutdown. Independent validation rejects sequence gaps, missing
identities, incomplete stopped sets and stale artifact hashes. Native exit codes are
0 for component success, 5 for unavailable/incomplete observation, 6 for denied
attempts and 10 for workload failure. This component does not return governed-change
COMPLETE or enable the real coordinator. Task-granted writes use the separate
`task-session.mjs` component described below.

Build from an explicitly selected existing local qualification image containing the
pinned CLI and neutral protected fixture. The builder creates a temporary context,
records source hashes and returns the immutable output image ID. No registry pull,
credential discovery or cloud operation is involved. The tested base and exact output
identities are retained with the qualification evidence.

```sh
python3 tools/factory/isolation/build-native-observer.py --docker /absolute/path/to/docker --base sha256:<approved-local-base>
python3 tools/factory/isolation/build-native-observer.py --docker /absolute/path/to/docker --base sha256:<approved-local-base> --omit-record
FACTORY_DOCKER=/absolute/path/to/docker FACTORY_NATIVE_IMAGE=sha256:<normal-output> FACTORY_NATIVE_FAULT_IMAGE=sha256:<omitted-record-output> node --test tools/factory/native-audit-session.test.mjs
node --test tools/factory/native-audit-proof.test.mjs
```

The platform test uses the actual CLI plus synthetic local model responses for SCT-001,
barrier-synchronized native workloads for SCT-002–006, a compiled record-omission fault
for SCT-007, and readiness-triggered observer termination with an active descendant
writer for SCT-008. The tested neutral fixture contains `frozen`; another base requires
review of its fixture and executable identity. No case is a live-model demonstration.
The trace budget is 64 MiB; identities/stdout/stderr are each bounded to 16 MiB. The
external CLI probe has a 45-second deadline, inside the observer's default 60-second
deadline. Task sessions accept an explicit 1–1,800,000 ms deadline before Docker
execution; the trusted observer receives its rounded-up seconds, bounded to 1–1800,
while the host retains the unrounded timeout and includes startup in its budget.
These are qualification overhead budgets, not PetClinic runtime/performance changes.
Original failure records and subsequent passing records are kept separately.


### Task-scoped update and model-channel components

`task-session.mjs` grants only literal existing single-link regular files for byte
updates. Create/delete, atomic replacement, metadata changes, protected aliases and
ungranted writes remain denied. A private staged copy receives the writes; successful
audited cleanup precedes transfer to the isolated candidate. Failed partial work is
retained for inspection without replacing candidate bytes. Staging preserves hardlinks
within the copied tree and never links back to the original. Metadata operations use
final-component symlink semantics from their syscall flags; inherited output write
authority does not grant metadata authority over audit files.

`model-channel-session.mjs` connects an owner broker to the immutable container over
Docker exec. The container retains network-none. A separate relay UID exposes only a
loopback model endpoint and per-run capability to the coding process; AWS credentials
remain with the owner process. Relay loss fails the session. Synthetic Converse tests
exercise the actual pinned CLI but do not establish live model capability.

`real-profile.mjs`, `real-launcher.mjs` and `real-coordinator.mjs` integrate these
components with governed change and a read-only independent verifier. Activation requires
an owner-reviewed profile and a complete qualification record matching the exact
current candidate. The validator rejects
missing suites, incomplete or substituted assertion rosters, stale raw test events,
and source/profile drift. Standalone PASS labels are not evidence. The trusted
coordinator qualification harness (`real-coordinator.test.mjs`) runs four end-to-end
cases through `change-engine.mjs` using neutral frozen fixtures and a synthetic broker.
It invokes the actual coding CLI and verifier containers, but successful outcomes are
SIMULATED_VERIFIED. The production `change.mjs` CLI exposes no injection argument or
environment variable; injection is rejected for real descriptors. All six required
suite reports must be bound to the reviewed execution profile and source tree before
real activation. Component results cannot substitute for those reports. Qualification must bind the entire execution profile,
source modules, SDK and dependency trees, and immutable images. The independent
verifier requires existing empty nested dependency mount targets in its private clone.

Explicit platform checks require FACTORY_DOCKER plus FACTORY_NATIVE_IMAGE for
`task-session.test.mjs` and `model-channel.test.mjs`; `verifier-session.test.mjs` uses
FACTORY_COMPONENT_IMAGE. `real-coordinator.test.mjs` requires all three variables
and a clean factory checkout. Its optional FACTORY_QUALIFICATION_PROFILE selects the
trusted offline profile inputs; this variable is read only by the test harness, never
by the production CLI. Keep failed records alongside passing reruns. These commands
never replace the full factory gate or the reviewed immutable consumer pin.


### Suppressed no-terminal probe

The frozen terminal policy handles the pinned CLI's default shell startup without
opening a writable terminal. Under the stopped-writer invariant, the observer binds
an exact `openat` 0x802 request to character device 5:0 and to the selected task's
start time, session and zero controlling-terminal field. It suppresses the kernel
open and records synthetic `-ENXIO` with a distinct disposition. Other flags or
identities follow ordinary authorization; uncertain evidence blocks the run.
`TIOCGPGRP` is bound to a descriptor with known nonmutating semantics. Unknown or
mutating terminal requests remain unsupported. Read-only filesystem metadata
queries used by shell startup do not add write authority.

Qualification includes omitted shell/login arguments through the actual CLI,
direct and aliased probes, a synchronized alias race, and a real private-PTY fixture
built with `build-native-observer.py --terminal-fixture`. That separate fixture image
is for controlling-terminal negative coverage only; it is never the production
runner image. It uses existing container capabilities and closes the PTY descriptors
before workload execution. Proof checks reject missing or substituted process,
target, disposition and whole binding groups; artifact checks still reject stale
records. Runtime activation requires the reviewed image/profile and consumer pin.


### Namespace-local routing socket compatibility

Interface discovery on Linux uses a local `NETLINK_ROUTE` socket. The observer
supports an exact `sockaddr_nl` bind with padding, requested port, and groups all zero.
It duplicates the stopped task's current descriptor with `pidfd_getfd`, verifies
socket identity, raw type, domain, protocol and zero memberships, and compares its
network-namespace cookie with the observer's namespace. No capability or external
network access is added. If descriptor inspection is unavailable, including for an
unsupported nonleader thread, the operation fails closed.

Zero-flag receive operations use the same identity checks and preserve native
kernel results. This is not a general read-only classification of NETLINK_ROUTE:
route-changing requests remain constrained by the existing dropped capabilities.
Qualification explicitly verifies kernel EPERM and unchanged loopback state, in
addition to network escape checks, wrong protocols/addresses, fd reuse and evidence
substitution. Bind address context and socket identity must agree; missing binding
groups cannot produce successful proof. Main-thread and worker-thread Node interface discovery are
covered platform cases. Route inspection requires Linux 6.9+ `PIDFD_THREAD` for the
exact stopped caller, with no process-leader fallback. Audit validation binds the
thread ID and flag to the syscall entry; missing or substituted bindings fail.
Unsupported kernels fail closed without extra capabilities.


Read-only `fcntl(F_GETPIPE_SZ)` is supported for pipe-capacity inspection. Native
success and error results are preserved; query support does not authorize pipe
resizing. Qualification checks that buffered bytes and capacity remain unchanged,
closed descriptors preserve EBADF, and `F_SETPIPE_SZ` still blocks qualification.

Owner-side Docker inspect/list queries retry an explicit daemon-connection failure
at most twice, with 100 ms between attempts and one shared 30-second command budget.
Only a successful fresh query supplies state; an unavailable daemon never means a
container is absent or stopped. Mutations, timeout/signal failures and other Docker
errors are not retried. Persistent query failures preserve the existing failure and
recovery path; no retry authorizes success without cleanup and evidence validation.

Read-only `getgroups` queries preserve the kernel supplementary-group count and
list/error results. They do not change process credentials or authorize `setgroups`.
Native qualification checks the sandbox's empty group list, unchanged output buffer,
negative-size EINVAL and unchanged group count; the mutation case remains blocking.

The coding-stage prompt directs bounded requirement/source inspection and only the
granted implementation edit. It tells the agent to leave package managers, running
application services and test suites to the provisioned independent verifier. This
instruction does not replace or waive any gate: successful implementation still
requires separate full verification and evidence validation after cleanup. The
observer event budget and all permission checks remain unchanged.

The isolated coding client sets `GIT_OPTIONAL_LOCKS=0` and supplies
`diff.autoRefreshIndex=false` through Git’s process-scoped configuration environment
so Git inspection avoids optional index refreshes. Git metadata remains protected: necessary writes such as
`git add` are still denied by the observer, and any denial still fails the run.
Qualification exercises both diff/status inspection and prohibited staging through
the actual pinned CLI, with cleanup and independent verification checks.
