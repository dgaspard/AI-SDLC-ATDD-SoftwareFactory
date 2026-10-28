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
(exit 5): an OS-enforced launcher, credential broker and independent verification
profile still require implementation and qualification. Fixture processes run with
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
credential “wallet” from model forwarding, allowing a future OS-keychain or cloud
secret-manager adapter without giving the runner the upstream secret. The local file
is not an encrypted wallet. The component supports bounded text/structured-message
requests, local function/custom-tool roundtrips and buffered Responses SSE. Streams
are withheld until completion, item consistency and decoded secret checks pass.
Hosted tools, namespaces, remote inputs and unknown request fields fail closed. Client tracing
and cache metadata are discarded; output limits are supplied when the client omits
them. This is not yet connected to the governed-change coordinator. Run offline checks with `node --test tools/factory/model-broker.test.mjs`;
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
also tests missing SYS_PTRACE. It confirms outer container shutdown before evaluating
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
