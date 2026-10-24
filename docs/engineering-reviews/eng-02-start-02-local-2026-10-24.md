# ENG-02: START-02 local extraction review — 2026-10-24

**REV-003 documentation resolution:** resolved, low severity, no separate human security sign-off required. The factory README now describes the integrated PetClinic adapter and verified local consumer-CLI proof accurately. Independent repository separation remains a later milestone. This resolution does not approve security/boundary findings or the pending factory-pin upgrade.

The original findings and dated follow-ups below are preserved as review history; earlier statements that REV-003 is open describe their reviewed snapshots, not its current disposition. Milestone status remains in BACKLOG.md.

## Initial review (historical)

Reviewed isolated snapshot `/private/tmp/start02-integrated-review-0tj2wswm` against frozen baseline `0fca4ef`, with no memory of implementation. Read the working agreement, ENG-02 design and reviewer checklist, frozen consumer contract, ownership/roadmap decisions and documentation checklist. No implementation or protected files were edited; no remote operations were performed.

Initial verdict (historical): changes need correction before local-extraction acceptance. Two concrete defects in the new consumer boundary remain despite passing ordinary boundary examples. They are local implementation blockers, not reasons to defer the already-approved architecture or await repository separation. Security/boundary findings require human sign-off under ENG-02.

## Code findings

### REV-001 — Canonical output aliases bypass protected/input overlap checks

- Category: security / boundaries; severity: high; human sign-off: yes.
- Location: `tools/factory/core.mjs:44–48`, consumed by output checks at `tools/factory/core.mjs:285–296` and protected overlap checks inside `verifyTrust`.
- `resolve` checks that a symlink's real target remains inside the consumer, but returns the lexical path. Output collision checks compare that lexical path against input and protected paths. Creating `alias -> spec` and setting `testing.results` to `alias/results` passes both `validate` and `verifyTrust` with `spec/` protected. It therefore permits output creation inside the protected tree, contrary to the frozen contract's requirement to reject overlap before running commands. Later content checks do not make writes into protected inputs acceptable.
- Exact reproduction: `node /private/tmp/start02-review-probes.cjs`. This reuses the existing self-test synthetic fixture outside the checkout, canonicalizes its root, creates the alias, seals its deliberately reviewed synthetic configuration, then calls the actual exported validators. Observed: `SYMLINK OUTPUT ACCEPTED`, with an output path ending `/alias/results`. No actual protected repository file was changed.
- Suggested fix: canonicalize existing ancestors and append missing suffixes for comparisons; consistently compare canonical input, output, factory and protected paths. Add tests for internal symlink aliases as well as escaping symlinks. Reject before execution with CONFIG_INVALID.

### REV-002 — COMPLETE evidence can refer to an artifact changed during cleanup

- Category: evidence integrity / lifecycle; severity: high; human sign-off: yes.
- Location: `tools/factory/consumer.mjs:135–147` (artifact validation and hashing precede runtime stop).
- Required artifacts are checked and hashed before stopping runtime children. A normal SIGTERM cleanup handler can change an output artifact afterward. Subsequent checks exclude declared outputs and never revalidate the artifact. The CLI then emits COMPLETE and an envelope whose artifact hash no longer matches the actual file.
- Exact reproduction: `node /private/tmp/start02-review-cleanup.mjs`. It uses the existing synthetic fixture, a real persistent runtime child, and a SIGTERM handler writing `{}` to `out/evidence/application.json`. Health HTTP is mocked in an external preload solely to avoid sandbox socket restrictions; no application ports or application code are involved. The actual CLI reports exit 0 / COMPLETE. The resulting artifact's hash is `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`, while the envelope records the earlier valid artifact's different hash. The final file also lacks every required run-identity field.
- Suggested fix: complete and confirm process-group cleanup before final artifact validation/hash collection. Revalidate artifact identities and bytes after cleanup, and report EVIDENCE_MISSING if they changed incompatibly. Preserve existing input and factory post-cleanup checks.

## Documentation finding

### REV-003 — Original documentation finding (resolved)

- Category: documentation; severity: low; human sign-off: no.
- Location: `tools/factory/README.md:19–21`, `BACKLOG.md:25–27` and its local-extraction row.
- The README says PetClinic has not switched adapters and `spec/run-all.js` remains untouched, but that file now imports and invokes `runLegacy` from `tools/factory/index.mjs`. The backlog still describes the unchanged protected runner. These statements obscure the actual integration under review.
- Suggested diff for README (backlog should keep the authoritative detailed status):

```diff
-PetClinic has not switched adapters. `spec/run-all.js` and all existing protected
-requirements/tests remain untouched. See BACKLOG START-02 for integration status and
-its exact protected seam.
+PetClinic's reviewed `spec/run-all.js` adapter invokes the extracted compatibility
+runner. Consumer assertions remain owned by PetClinic. See BACKLOG START-02 for
+integration and verification status.
```

The review file belongs in the engineering-reviews home explicitly required by ENG-02. No new architectural decision is proposed. Documentation must distinguish this integrated legacy adapter from adoption of the separate consumer CLI.

## Verification and limits

Ran `node --test --test-concurrency=1 spec/tests/factory/consumer-boundary.test.js tools/factory/self-test.mjs tools/factory/legacy-runner.test.mjs` from the clean isolated snapshot: 31 passed, one failed. All 14 frozen boundary examples and 11 compatibility-runner regression tests passed. The one failure was the disabled-test-facilities case; a retained reproduction proved `listen EPERM` on 127.0.0.1:49874, so this result is an environment limitation, not evidence of a product regression. Health-timeout cleanup passed. Stopped socket tests after coordinating with the parent to avoid collisions.

The two independent defect probes above exercise failures missing from those tests. Neither changes the frozen contract, test expectations or protected baseline. The second explicitly mocks health and is not claimed as application HTTP/runtime-contract proof.

Application gates, engineering gates, trace coverage and audit are run separately by the coordinating agent, sequentially to avoid port collisions; their exact records should be attached before acceptance. This review does not claim to have independently run those application services or an online vulnerability advisory lookup.

## Remaining coupling and scope

The extracted compatibility runner receives root, suite root, results directory, policy, service IDs, invocation string and the legacy tree environment variable from the consumer adapter. I found no application implementation import in the new core. The adapter's import of `spec/harness/config.js` is a consumer-owned roster binding, not a factory-to-PetClinic dependency.

Current local capability is therefore narrower than independent consumer adoption. Existing PetClinic harness, fixtures, ports, policy, domain/BDD/OBS assertions, performance workload and thresholds, security/review bindings and legacy evidence still reside in this checkout. The new consumer CLI has synthetic external-root proof, while PetClinic currently exercises the compatibility runner. There is no operational PetClinic config/trusted policy/full immutable consumer pin proving separate repositories. Those are explicitly deferred separation/adoption work, not newly discovered local-extraction defects. Second-consumer validation and lifecycle implementation are later milestones. No claims of isolation from hostile writable processes, CI authority, production readiness or cross-repository evidence certification follow from local hashes.

## Follow-up review — 2026-10-24, corrected isolated snapshot

Independently inspected `/private/tmp/start02-fixed-review-6yw3bn68`, including the canonical-path resolver, preserved protected-symlink rejection, reordered cleanup/evidence checks, child-exit wait, and three new regression tests. No code changes or socket tests were performed by this reviewer.

- REV-001 resolved: `node /private/tmp/start02-fixed-probes.cjs` runs the same alias reproduction against the corrected source and now reports `CONFIG_INVALID Output overlaps protected paths`. The resolver canonicalizes the nearest existing ancestor and reattaches the missing suffix; output comparisons therefore see the real protected destination. Output-to-output aliases also have a dedicated regression case.
- REV-002 resolved: `node /private/tmp/start02-fixed-cleanup.mjs` runs the same real-child SIGTERM artifact rewrite with only HTTP health mocked. It now exits 8, reports `FAILED / EVIDENCE_MISSING`, names the stale artifact, and returns no envelope. The stop path awaits the owned child's exit, and required artifact validation/hashing happens after cleanup and final trust/input checks.
- REV-003 remains in this snapshot: README and backlog still describe the protected runner as unchanged. The coordinating agent should correct those status claims in the final documentation pass.

Updated verdict: no remaining definite code blocker identified in this fix review. The two initial implementation findings are resolved; acceptance still depends on final application gate evidence and correction of stale documentation. This is not an independent-repository adoption approval. Human sign-off on the boundary findings remains part of ENG-02 governance.

The coordinating agent reports further validation in progress: elevated synthetic checks; engineering-gate retry in the pinned cached browser container after host Playwright absence; payment trace coverage passing. Semgrep/jscpd are unavailable locally, and offline npm audit is not a live advisory lookup. These are reported coordination facts, not substitute reviewer-run evidence; attach final commands/results and records when available. This follow-up does not upgrade the initial sandbox-limited test run to a claimed all-pass result.

## Final scope reconciliation and six-section checklist — 2026-10-24

Correction to the earlier scope assessment: the frozen contract explicitly says PetClinic configuration **during extraction** must enumerate all seven projects (`spec/factory/consumer-contract.v1.md:93–106`). It cannot be reclassified as separation-only work merely because the generic CLI and compatibility seam pass. The earlier statement deferring operational configuration is superseded by this finding.

### REV-004 — Operational seven-project adoption configuration is absent

- Category: service/factory boundary and approved-requirement coverage; severity: high for broad local-extraction acceptance; human sign-off: yes.
- Locations: `spec/factory/consumer-contract.v1.md:93–106` (binding requirement); `spec/run-all.js:4–12` (current limited adapter); `spec/harness/config.js:22` (consumer roster).
- The snapshot contains no operational factory configuration/trust binding enumerating all seven PetClinic projects for the new consumer interface. The integrated adapter passes only service IDs and legacy runner arguments, while runtime orchestration remains in the existing consumer harness. Synthetic configurations do not establish preservation of all seven real launch/environment/facility bindings.
- Reproduction: inspect the adapter and run `rg --files -g '*factory*config*' -g '*trust*'` in the corrected snapshot. Only unrelated delivery trust paths are found; synthetic fixture construction remains in the boundary/self-test files.
- Suggested resolution: implement the reviewed operational seven-project consumer configuration and its trust/evidence adapters under the applicable human review/freeze process, then prove real consumer CLI behavior; alternatively the human may explicitly approve a narrower milestone, without declaring the frozen broader local-extraction obligation satisfied. No specification waiver is inferred here.
- Distinction: destination repository access/creation, real origin consumption and a released immutable cross-repository pin remain separation work. Their absence is not the reason for this finding.

| Required ENG-02 section | Result for extraction scope | Evidence and qualification |
|---|---|---|
| 1. Service boundaries | **Not followed in full** | The extracted compatibility mechanism takes consumer bindings explicitly (`tools/factory/legacy-runner.mjs:8`, `spec/run-all.js:4–12`), without importing application implementations. REV-001 was fixed. However, REV-004 leaves the frozen seven-project adoption binding unimplemented, so broad local extraction remains incomplete. Existing application state ownership was unchanged, not independently re-audited as a new implementation. |
| 2. Payment safety | **Followed for preservation scope; N/A for new payment logic** | No payment business logic changed. Inspected connected payment trace `7baefc7565591a0830ff5ce4780b81c3`: checkout → provider authorization → Customer account change → Reservation completion. Corresponding existing code paths are `services/checkout/server.js:47`, `:88`, `:106`, `:353`, `:379`. This is positive real-flow preservation evidence, not a fresh exhaustive retry/partial-failure audit. Existing THREAT-03 remains disclosed in `tools/review/project-specific/threat-model.md:13`; it is not a new extraction finding. |
| 3. Inter-service authentication | **N/A for changed application auth; followed for reviewed factory authority checks after fixes** | Application JWT code is unchanged (`services/platform/runtime.js:230–232`); no new route or role policy is introduced. Consumer trust is checked before startup (`tools/factory/consumer.mjs:67–74`, `:98`), with binding logic in `tools/factory/core.mjs:330`. REV-001/002 concern new factory boundaries and were independently reproduced/fixed. This does not reaccept or mitigate THREAT-01/02. |
| 4. Privacy in telemetry and errors | **Followed in inspected extraction scope** | New launcher redirects child output to log files (`tools/factory/processes.mjs:12`), and CLI emits structured result/error metadata (`tools/factory/consumer.mjs:212–217`, `:235`), without dumping configured environment/auth secrets. No application OBS attribute or error-response change occurred. Child-generated logs retain the consumer's privacy obligations; there is no claim of generic log sanitization or exhaustive re-audit of unchanged telemetry. |
| 5. Structure | **Followed for corrected mechanisms; incomplete adoption per REV-004** | Explicit consumer arguments replace hidden PetClinic runner imports (`tools/factory/legacy-runner.mjs:8` and `spec/run-all.js:8–12`). The independent alias and cleanup probes now fail closed. The actual runtime/config adoption requirement remains open. No new domain duplication was observed; unavailable duplicate scanning is disclosed below. |
| 6. Documentation | **Not followed in reviewed snapshot** | REV-003: `tools/factory/README.md:19–21` and `BACKLOG.md:25–27` incorrectly call the runner unchanged. Proposed README diff is above. Final docs must also distinguish completion of the compatibility-runner slice from incomplete operational consumer adoption. The reviewer report uses the ENG-02-approved engineering-reviews home. |

## Inspected coordinating-agent evidence

Read the actual logs supplied by the coordinating agent, rather than inferring completion from a status message:

- `/tmp/start02-integrated-fixed-tests.log`: **46 tests passed, zero failed/skipped** (14 frozen boundary + 10 supplementary + 11 protected integrated-runner + 11 legacy-runner checks). This supersedes the original socket-limited aggregate for the corrected snapshot; it remains coordinating-agent execution, not a second reviewer rerun.
- `/Users/dustingaspard/Documents/Workspace/AI-SDLC-ATDD-SoftwareFactory/test-results/start02-integration/engineering-container.log`: **10/10 passed**, using the cached pinned browser image with `--network none` per the execution context supplied. Host-only failure was missing browser tooling, not a product assertion.
- Same directory, `payment-trace.log`: inspected the nine-span connected payment flow above.
- Same directory, `dependency-audit.log`: `found 0 vulnerabilities` from an **offline** audit. This is cache-limited evidence, not confirmation against current advisory data.
- Semgrep and jscpd were not available locally. No network installation or remote scan was run because remote operations are prohibited. These automated review checks remain unperformed, explicitly rather than silently waived.
- Final application gate/guard/verify results after documentation corrections were not yet supplied at this review step. Existing results do not automatically certify a changed final tree.

Final review position: REV-001 and REV-002 are corrected in the independently inspected fixed snapshot. REV-003 requires documentation correction; REV-004 blocks a claim that the entire frozen local-extraction/adoption obligation is complete. The narrower extracted-runner implementation has substantial passing integrated evidence. **Human sign-off on the security/boundary findings is still required. A code correction is not human risk acceptance, and this report does not supply that acceptance.**

## Fresh-session documentation resolution — 2026-10-24


Re-read the corrected source BACKLOG.md, START-02 design and tools/factory/README.md, and confirmed the canonical engineering report now exists at docs/engineering-reviews/eng-02-start-02-local-2026-10-24.md. All six minor corrections above are resolved: conversational prompt numbering is removed; final-results.json is designated as the authoritative generated evidence location without asserting a passing final gate; the review link resolves; README points to integration evidence without duplicating verification status; initial missing-command failures are explicitly historical; obsolete specification-task framing is removed.

The canonical review's historical REV-003 documentation finding is resolved in the current source tree. The documentation accurately distinguishes the integrated compatibility runner from the incomplete broader operational PetClinic adoption obligation (REV-004). No additional documentation blocker identified in this recheck. This is a read-only documentation assessment, not final npm test/gate/verifier/evidence certification, not human security/boundary sign-off, and not approval of independent repository consumption. Final gate claims must come from the generated exact-tree records after all source/report edits.

## Final application run finding

The integrated full run `2026-10-24T20-02-00-828Z-full` passed all full-tier suites except EVID-01: its protected fixture copies the adapter without `tools/factory`. All 17 cases fail at fixture runner startup. A one-line recursive copy matching the approved runner fixture pattern is proposed separately, not applied. The current protected-change authorization covers only the two earlier files. This is an additional local gate blocker requiring human review and freeze, not deferred repository-separation work. Subsequent final-tree results are retained in `test-results/start02-integration/final-results.json`; no complete gate is claimed.

## Human-applied evidence fixture repair

The owner applied the proposed one-line factory-directory copy to `spec/tests/evidence/change-evidence.test.js` and refroze the manifest. Reverse application check confirms the exact patch; guard passes. All 17 unchanged EVID-01 assertions now pass in `test-results/start02-integration/post-freeze-evidence-tests.log`. REV-005's fixture defect is corrected. Final post-freeze application verification is recorded in `test-results/start02-integration/post-freeze-results.json`, separately from the historical failed runs. REV-004 operational consumer adoption and required human security/boundary sign-off remain unresolved.

## Operational adoption candidate review

Independent review inspected `tools/petclinic/` and `test-results/start02-adoption/protected-adoption.patch`. No definite new blocker was found; the reviewer independently confirmed configuration/trust tests 2/2. The candidate preserves all 14 original full-tier suite IDs/order, protects the legacy evidence adapter, uses explicit pinned factory checkout provenance, and binds unchanged v1 artifact hashes after cleanup. The protected runtimeOwnership amendment makes startup preflight release its processes before existing lifecycle/performance suites take ownership. The external trust snapshot is derived only from an explicit human-reviewed commit and is not self-included in its source manifest.

The patch remains unapplied and unfrozen. REV-004 remains open until human adoption approval/freeze, reviewed consumer baseline and real full consumer-CLI verification. Component/runtime probes are not a completed adoption gate. Human security/boundary sign-off remains required. Evidence is retained under `test-results/start02-adoption/`; prior completed legacy gates remain historical, not proof of a changed tree.

## Human adoption freeze verified

The owner applied patch SHA256 `229a073a3ffa8a9b04b5e2537a7503d17b75e92a938acde0f496ccdd76e21b1c` and froze the protected files. Reverse patch check and guard now pass. This supersedes the earlier unapplied-candidate state. HEAD `0fca4ef94b2efb7710eefb955e1bd22588c39589` still lacks the consumer configuration: an explicitly reviewed consumer commit remains necessary for external trust materialization. No trust has been derived from unapproved working bytes. Post-freeze legacy checks are recorded separately in `test-results/start02-adoption/frozen-tree-results.json`; combined operational acceptance and human boundary sign-off remain outstanding.

## REV-006 — Adoption protection consistency omission

Post-freeze full run `2026-10-24T20-41-03-679Z-full` passed 13 full-tier suites; harness failed 70/71 because the shared protected-path list now includes `tools/petclinic/suite.mjs` but Claude Edit deny settings do not. The initial adoption patch omitted this mirror. The prepared, unapplied enforcement patch also adds the CODEOWNERS and AGENTS entries for the same authority boundary. The unchanged hook tests pass against a disposable draft fixture. This is a local gate blocker requiring human review/application/freeze; no protected file or test was edited to bypass it. External trust still requires an explicit reviewed consumer commit.

## REV-006 repair verified

The owner applied the exact three-file enforcement patch and froze 200 protected files. Reverse patch verification and guard pass; all 25 unchanged hook tests pass in the actual checkout. The protection-mirror defect is corrected. Final application verification is designated `test-results/start02-adoption/enforcement-final-results.json`. A reviewed consumer commit for external trust, combined operational verification, and human boundary sign-off remain separate outstanding requirements.

# ENG-02 combined operational adoption assessment — 2026-10-24

**REV-004 is technically resolved for local operational adoption.** The previously missing seven-project configuration and combined consumer-CLI proof now exist on the human-supplied reviewed consumer commit. This conclusion closes the implementation/evidence gap; it does not grant human security/boundary sign-off or establish independent-repository consumption.

Read-only inspection covered `test-results/start02-adoption/combined-result.json`, `combined-proof.json`, the resulting envelope, operational configuration, current-invocation receipts and binding. No source changes or test reruns were performed.

Verified evidence:

- Consumer commit: `f420dc56750846c0d34289f009d2ab7d7fa3186f`; envelope reports `dirty: false` and input SHA256 `ff1d668f32ccb186f18cb17dee29267c35bbdf047ce6fb5f53373cd4d5696991`.
- Factory pin: `045e2ceef53ca97f1137085fca678617ea38c8b6`, interface version 1.
- Actual combined command: recorded exit 0, full-mode COMPLETE; all 14 required suites have exit code 0.
- Run ID: `11e49db5-3869-4cae-a5de-e4b6cdf66e33`; envelope: `factory-evidence/11e49db5-3869-4cae-a5de-e4b6cdf66e33/consumer-evidence.v1.json`.
- Configuration enumerates customer, reservation, veterinarian-services, checkout, frontend, payment and collector in the approved three startup groups. All seven runtime logs exist for this combined invocation. The reviewed orchestration executes this startup/owned cleanup before suite-owned lifecycle execution.
- Independently recomputed **all 17 attached artifact SHA256 hashes** from the files: every value matches the envelope. Checked that the binding's run ID, consumer tree and factory revision match the envelope, and all 14 receipts name this invocation.
- Original v1 report: `test-results/evidence/2026-10-24T21-09-58-994Z-83d0a32c8ea0/change-evidence.json`; `combined-proof.json` records its unchanged verifier exiting 0. It remains an original v1 report attached through the separate binding, not relabelled dual-repository evidence.
- Negative integrated trust probe: mismatched external config hash returns exit 4 / TRUST_INVALID, with no suite results and no evidence. This is genuine fail-closed behavior alongside the passing combined run.

The external policy was materialized from the explicit human-reviewed commit using the reviewed snapshot mechanism, as reported by the coordinating agent. The envelope records configuration/policy/manifest hashes. Human review and freeze establish authority; snapshot generation alone does not.

Remaining distinctions:

1. **Human security/boundary sign-off remains required.** Earlier boundary fixes and this successful operational proof are technical evidence, not human risk acceptance.
2. This proves local execution with a separate clean pinned factory checkout and reviewed consumer authority. It does **not** prove that the consumer is an independently provisioned repository with its own established remote origin, ownership, CI root of trust or release process. The configured consumer repository string is identity metadata, not evidence that remote separation happened.
3. Released immutable cross-repository consumption, second-consumer reuse and lifecycle milestones retain their separate scope. Local unsigned evidence is not CI authority or production certification.
4. Previously disclosed offline dependency-advisory and unavailable scanner limitations remain unchanged.

The canonical review may now mark REV-004 technically resolved by this exact combined run, while retaining the human sign-off and later repository-separation limitations above.

## REV-001 deterministic no-execution proof

The existing canonical-path fix is strengthened with output re-resolution at trust validation, rejecting changed destinations before consumer execution. Four real CLI regressions cover direct/chained shortcuts for both results and evidence into a protected folder, including nonexistent nested suffixes. They assert CONFIG_INVALID exit 2, no suite/evidence result, no runtime/suite execution markers and no output creation. A fifth regression retargets a shortcut between validation and trust checks. The fixture canonicalizes its root, matching the CLI on macOS. All 54 focused boundary/runner tests pass in clean candidate `69567e6557d32ddf05cab51c4ecf8feacc3e0842`; restoring unsafe lexical-path resolution in an isolated mutation makes all five regressions fail. The existing approved factory pin passes the four shortcut CLI cases too. Logs are in `test-results/rev001/`. The approved consumer pin and protected inputs were not changed. This verifies preflight checks, not OS-level protection against a hostile concurrent filesystem actor; human boundary sign-off remains separate.

## REV-002 confirmed-cleanup evidence barrier

Factory cleanup now confirms the owned process group is gone, not merely that its leader exited. Final trust/input/factory checks and all evidence validation/fingerprints occur after cleanup. Evidence parsing and hashing share one post-cleanup buffer. Corrupt, deleted, stale and null evidence produce EVIDENCE_MISSING, not COMPLETE; a valid shutdown rewrite uses its final hash. Six deterministic shutdown/descendant regressions pass, with all 60 focused checks passing. Deliberately moving cleanup after evidence in a disposable mutation makes all five evidence regressions fail. Independent review found no definite implementation blocker and independently confirmed failure/success hash behavior. Candidate `e17f55e17403075cdb9434e69bbd0da03a865496` includes REV-001 hardening; its consumer-pin upgrade remains an unapplied protected patch. Human boundary sign-off and pin adoption are separate from this tested implementation. Evidence lives in `test-results/rev002/`.

## Human-frozen REV-001/REV-002 pin upgrade

The owner applied the reviewed one-line consumer-pin patch and human-froze the manifest. Reverse patch verification and guard pass. The configured factory revision is `e17f55e17403075cdb9434e69bbd0da03a865496`; its local checkout is clean and matches that commit. This supersedes the earlier unapplied-pin state. A reviewed consumer commit and renewed external trust are still needed for combined upgraded verification. No independent repository separation or human boundary sign-off is inferred.
