// EVID-01 local slice: the change-evidence report, proven on a temporary repository copy with
// fixture suites, features and run records. The generator (tools/evidence/change-evidence.mjs) is
// agent-built; this test and its contract are protected. Protected test.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const SPEC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(SPEC, "..");
const GENERATOR = "tools/evidence/change-evidence.mjs";
const SCHEMA = JSON.parse(fs.readFileSync(path.join(SPEC, "delivery/contracts/change-evidence.v1.schema.json"), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addFormat("date-time", (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)));
const validate = ajv.compile(SCHEMA);
const NOW = "2026-01-01T00:00:00Z";

const counts = (n, failed = 0) => `console.log("ℹ tests ${n}\\nℹ pass ${n - failed}\\nℹ fail ${failed}")`;
const policy = {
  description: "fixture policy",
  suites: {
    first: { name: "Evil | <script>alert(1)</script>", cmd: process.execPath, args: ["-e", counts(2)] },
    // Fails while test-results/fail exists; prints a SPEC-07 line while test-results/state exists;
    // always prints a secret-looking line that must never reach the report. Runs with cwd spec/.
    second: { name: "Second", cmd: process.execPath, args: ["-e", [
      "const fs = require('fs');",
      "console.log('SECRET=hunter2');",
      "if (fs.existsSync('../test-results/state')) console.log('STATE CHANGE  REV-9  failing → passing on tree x  (spec/features/checkout/r.feature:3)');",
      "if (fs.existsSync('../test-results/fail')) { console.log('ℹ tests 1\\nℹ pass 0\\nℹ fail 1'); process.exit(1); }",
      "console.log('ℹ tests 1\\nℹ pass 1\\nℹ fail 0');",
    ].join(" ")] },
    delivery: { name: "Delivery spec", cmd: process.execPath, args: ["-e", "process.exit(require('fs').existsSync('../test-results/delivery-fail') ? 1 : 0)"] },
  },
  tiers: { fast: { always: ["first"], suites: ["first"] }, full: { suites: ["first", "second", "delivery"] } },
  rules: { list: [] },
};
const controlsFeature = `@tier:static @pillar:governance
Feature: Fixture controls

  @CTL-901 @nist:CM-5 @ssdf:PO.3.2 @env:local @env:prod
  Scenario: A required static control
    Given a step

  @CTL-902 @awaiting:ENV-02 @nist:CM-5 @ssdf:PO.3.2 @env:nonprod
  Scenario: An awaiting control
    Given a step

  @CTL-903 @tier:live @nist:CM-5 @ssdf:PO.3.2 @env:prod
  Scenario: A live control
    Given a step
`;
const riskFeature = `Feature: Fixture risks
  @accepted-risk @risk:REV-9 @owner:dustin @review:2027-01-31
  Scenario: An accepted risk
    Given a step

  # @accepted-risk @risk:REV-8 @owner:dustin @review:2027-01-31
  Scenario: A risk promoted to a required check
    Given a step
`;

let root;
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const node = (args, env = {}) => {
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", env: { ...process.env, CI: "", GITHUB_ACTIONS: "", ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const runAll = (...a) => node(["spec/run-all.js", ...a]);
const generate = (...a) => node([GENERATOR, "--now", NOW, ...a]);
const evidenceDir = () => path.join(root, "test-results", "evidence");
const reports = () => (fs.existsSync(evidenceDir()) ? fs.readdirSync(evidenceDir()).sort() : []);
const latest = () => {
  const dir = path.join(evidenceDir(), reports().at(-1));
  return { dir, json: JSON.parse(fs.readFileSync(path.join(dir, "change-evidence.json"), "utf8")), md: fs.readFileSync(path.join(dir, "change-evidence.md"), "utf8") };
};
const assertValid = (doc) => assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
const tree = () => JSON.parse(runAll("--verify", "--json").out).tree;

describe("change evidence (EVID-01)", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-"));
    write("spec/run-all.js", fs.readFileSync(path.join(SPEC, "run-all.js"), "utf8"));
    write("spec/harness/config.js", fs.readFileSync(path.join(SPEC, "harness/config.js"), "utf8"));
    write("spec/test-policy.json", JSON.stringify(policy, null, 2));
    write("spec/protected.sha256", "0000  fixture\n");
    write("spec/delivery/features/fixture/controls.feature", controlsFeature);
    write("spec/features/checkout/r.feature", riskFeature);
    assert.ok(fs.existsSync(path.join(ROOT, GENERATOR)), `${GENERATOR} is not built yet`);
    write(GENERATOR, fs.readFileSync(path.join(ROOT, GENERATOR), "utf8"));
    write(".gitignore", "test-results/\n");
    write("services/app.txt", "application v1\n");
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/example/factory.git"], { cwd: root });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("[EVID-01] a complete current tree produces schema-valid JSON and matching Markdown", () => {
    assert.equal(runAll().code, 0);
    const g = generate();
    assert.equal(g.code, 0, g.out);
    const { json, md } = latest();
    assertValid(json);
    assert.equal(json.kind, "change-evidence");
    assert.equal(json.generatedAt, NOW);
    assert.equal(json.verification.gate, "COMPLETE");
    assert.equal(json.source.sourceTree, tree());
    assert.equal(json.source.repository, "example/factory");
    assert.match(json.specification.testPolicySha256, /^[0-9a-f]{64}$/);
    assert.match(json.specification.protectedManifestSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(json.suites.map((s) => [s.id, s.required, s.result]), [["first", true, "passed"], ["second", true, "passed"], ["delivery", true, "passed"]]);
    assert.ok(json.runIds.length >= 1);
    assert.match(md, /Gate: COMPLETE/);
    assert.ok(md.includes(json.source.sourceTree.slice(0, 12)), "Markdown doesn't name the tested tree");
    assert.ok(md.indexOf("Gate: COMPLETE") < md.indexOf("Required suites"), "the gate status doesn't lead the report");
  });

  it("[EVID-01] generating the report doesn't change the tested tree, and fixed inputs give identical content", () => {
    assert.equal(runAll().code, 0);
    const before = tree();
    assert.equal(generate().code, 0);
    assert.equal(generate().code, 0);
    assert.equal(tree(), before);
    assert.equal(runAll("--verify").code, 0);
    const [a, b] = reports();
    assert.notEqual(a, b, "a second report overwrote the first");
    for (const f of ["change-evidence.json", "change-evidence.md"]) {
      assert.equal(fs.readFileSync(path.join(evidenceDir(), a, f), "utf8"), fs.readFileSync(path.join(evidenceDir(), b, f), "utf8"));
    }
  });

  it("[EVID-01] an explicit suite failure is FAILED, not INCOMPLETE", () => {
    write("test-results/fail", "");
    assert.equal(runAll().code, 1);
    assert.equal(generate().code, 0, "a failing gate must still produce its report");
    const { json, md } = latest();
    assertValid(json);
    assert.equal(json.verification.gate, "FAILED");
    assert.deepEqual(json.verification.failed, ["second"]);
    assert.equal(json.suites.find((s) => s.id === "second").result, "failed");
    assert.match(md, /Gate: FAILED/);
  });

  it("[EVID-01] absent required results are INCOMPLETE, naming what's missing", () => {
    assert.equal(runAll("--suite", "first").code, 0);
    assert.equal(generate().code, 0);
    const { json } = latest();
    assertValid(json);
    assert.equal(json.verification.gate, "INCOMPLETE");
    assert.deepEqual(json.verification.missing, ["second", "delivery"]);
    assert.equal(json.suites.find((s) => s.id === "second").result, "not-run");
  });

  it("[EVID-01] stale or mixed-tree records can't produce COMPLETE", () => {
    assert.equal(runAll().code, 0);
    write("services/app.txt", "application v2\n");
    assert.equal(runAll("--suite", "first").code, 0);
    assert.equal(generate().code, 0);
    const { json } = latest();
    assert.equal(json.verification.gate, "INCOMPLETE");
    assert.deepEqual(json.verification.missing, ["second", "delivery"]);
  });

  it("[EVID-01] malformed records are counted and never become evidence", () => {
    write("test-results/runs/forged.json", "{ not json");
    assert.equal(generate().code, 0);
    let { json, md } = latest();
    assert.equal(json.verification.gate, "INCOMPLETE");
    assert.equal(json.verification.unreadableRecords, 1);
    assert.match(md, /1 unreadable run record/);
    assert.equal(runAll().code, 0);
    assert.equal(generate().code, 0);
    ({ json } = latest());
    assert.equal(json.verification.gate, "COMPLETE");
    assert.equal(json.verification.unreadableRecords, 1);
  });

  it("[EVID-01] awaiting controls stay awaiting, live controls are not run, and neither fails a valid gate", () => {
    assert.equal(runAll().code, 0);
    assert.equal(generate().code, 0);
    const { json, md } = latest();
    const byId = Object.fromEntries(json.controls.map((c) => [c.id, c]));
    assert.deepEqual([byId["CTL-901"].requirement, byId["CTL-901"].result, byId["CTL-901"].tier], ["required", "passed", "static"]);
    assert.ok(byId["CTL-901"].evidence, "a passed control must cite its run");
    assert.deepEqual([byId["CTL-902"].requirement, byId["CTL-902"].awaiting, byId["CTL-902"].result], ["awaiting", "ENV-02", "awaiting"]);
    assert.deepEqual([byId["CTL-903"].tier, byId["CTL-903"].result, byId["CTL-903"].evidence], ["live", "not-run", null]);
    assert.equal(json.verification.gate, "COMPLETE");
    assert.match(md, /cloud readiness is unproven/i);
  });

  it("[EVID-01] feature-level @awaiting and @tier:live tags apply to every scenario in the feature", () => {
    write("spec/delivery/features/fixture/awaiting.feature", "@tier:static @awaiting:EVID-01\nFeature: Awaiting at feature level\n\n  @CTL-904 @nist:CM-5 @ssdf:PO.3.2 @env:prod\n  Scenario: Not built yet\n    Given a step\n");
    write("spec/delivery/features/fixture/live.feature", "@tier:live\nFeature: Live at feature level\n\n  @CTL-905 @nist:CM-5 @ssdf:PO.3.2 @env:prod\n  Scenario: Needs the cloud\n    Given a step\n");
    assert.equal(runAll().code, 0);
    assert.equal(generate().code, 0);
    const byId = Object.fromEntries(latest().json.controls.map((c) => [c.id, c]));
    assert.deepEqual([byId["CTL-904"].requirement, byId["CTL-904"].awaiting, byId["CTL-904"].result], ["awaiting", "EVID-01", "awaiting"]);
    assert.deepEqual([byId["CTL-905"].tier, byId["CTL-905"].result, byId["CTL-905"].evidence], ["live", "not-run", null]);
  });

  it("[EVID-01] the strict check rejects an edited approver, enforcement claim or result", () => {
    assert.equal(runAll().code, 0);
    assert.equal(generate().code, 0);
    const good = path.join(latest().dir, "change-evidence.json");
    const doc = JSON.parse(fs.readFileSync(good, "utf8"));
    const forge = (name, patch) => {
      const f = path.join(root, "test-results", `${name}.json`); // ignored, so the tree is unchanged
      fs.writeFileSync(f, JSON.stringify({ ...doc, ...patch }));
      assert.equal(node([GENERATOR, "--verify", f]).code, 1, `${name} passed the strict check`);
    };
    forge("approver", { humanDecision: { status: "recorded", reference: "alice", verified: true } });
    forge("enforcement", { remoteEnforcement: { status: "verified", reference: "ruleset" } });
    forge("control", { controls: doc.controls.map((c) => (c.id === "CTL-902" ? { ...c, requirement: "required", result: "passed" } : c)) });
    forge("not-an-object", { source: null });
    assert.equal(node([GENERATOR, "--verify", good]).code, 0, "the unedited report must still pass");
  });

  it("[EVID-01] Markdown links and images in untrusted text are neutralised", () => {
    write("spec/test-policy.json", JSON.stringify({ ...policy, suites: { ...policy.suites, first: { ...policy.suites.first, name: "Click [here](https://evil.example) ![t](https://track.example/p.png)" } } }, null, 2));
    assert.equal(runAll().code, 0);
    assert.equal(generate().code, 0);
    const { md } = latest();
    assert.ok(!md.includes("[here](https://evil.example)"), "a Markdown link from untrusted text was rendered");
    assert.ok(!md.includes("![t]("), "a Markdown image from untrusted text was rendered");
  });

  it("[EVID-01] when the delivery suite fails, its controls are unverified rather than passed", () => {
    write("test-results/delivery-fail", "");
    assert.equal(runAll().code, 1);
    assert.equal(generate().code, 0);
    const { json } = latest();
    assert.equal(json.controls.find((c) => c.id === "CTL-901").result, "suite-failed");
    assert.equal(json.controls.find((c) => c.id === "CTL-902").result, "awaiting");
    assert.equal(json.verification.gate, "FAILED");
  });

  it("[EVID-01] accepted risks keep their owner and review date, and a STATE CHANGE leads the report", () => {
    write("test-results/state", "");
    assert.equal(runAll().code, 0);
    assert.equal(generate().code, 0);
    const { json, md } = latest();
    assert.deepEqual(json.risks.acceptedRisks, [{ id: "REV-9", owner: "dustin", review: "2027-01-31", source: "spec/features/checkout/r.feature:2" }]);
    assert.equal(json.risks.stateChanges.length, 1);
    assert.match(json.risks.stateChanges[0], /^STATE CHANGE {2}REV-9/);
    const at = md.indexOf("STATE CHANGE");
    assert.ok(at >= 0 && at < md.indexOf("Required suites"), "STATE CHANGE isn't prominent");
    assert.ok(!md.includes("REV-8"), "a commented-out tag was reported as an accepted risk");
  });

  it("[EVID-01] untrusted text is escaped, and log contents never reach the report", () => {
    assert.equal(runAll().code, 0);
    assert.equal(generate().code, 0);
    const { dir, md } = latest();
    assert.ok(!md.includes("<script>"), "raw HTML from a suite name reached the Markdown");
    assert.ok(md.includes("&lt;script&gt;"), "the suite name was dropped instead of escaped");
    assert.ok(!/Evil \| </.test(md), "an unescaped pipe can break the table");
    for (const f of fs.readdirSync(dir)) assert.ok(!fs.readFileSync(path.join(dir, f), "utf8").includes("hunter2"), `${f} embeds log contents`);
  });

  it("[EVID-01] the report says human review and remote enforcement are not verified", () => {
    assert.equal(runAll().code, 0);
    assert.equal(generate().code, 0);
    const { json, md } = latest();
    assert.deepEqual(json.humanDecision, { status: "unrecorded", reference: null, verified: false });
    assert.deepEqual(json.remoteEnforcement, { status: "unknown", reference: null });
    assert.ok(json.limitations.some((l) => /deploy/i.test(l)), "limitations don't say nothing was deployed");
    assert.match(md, /Human review: not recorded/);
    assert.match(md, /Remote enforcement: not verified/);
  });

  it("[EVID-01] CI runs say so and cite the run URL", () => {
    assert.equal(runAll().code, 0);
    const g = node([GENERATOR, "--now", NOW, "--ci-url", "https://github.com/example/factory/actions/runs/1"], { CI: "true" });
    assert.equal(g.code, 0, g.out);
    const { json } = latest();
    assertValid(json);
    assert.deepEqual(json.execution.origin, "ci");
    assert.equal(json.execution.ciUrl, "https://github.com/example/factory/actions/runs/1");
  });

  it("[EVID-01] a broken input fails the command without overwriting an earlier report", () => {
    assert.equal(runAll().code, 0);
    assert.equal(generate().code, 0);
    const [first] = reports();
    const saved = fs.readFileSync(path.join(evidenceDir(), first, "change-evidence.json"), "utf8");
    fs.rmSync(path.join(root, "spec/run-all.js"));
    const g = generate();
    assert.notEqual(g.code, 0);
    assert.deepEqual(reports(), [first], "a failed generation left a partial report");
    assert.equal(fs.readFileSync(path.join(evidenceDir(), first, "change-evidence.json"), "utf8"), saved);
    write("spec/run-all.js", fs.readFileSync(path.join(SPEC, "run-all.js"), "utf8"));
    assert.notEqual(node([GENERATOR, "--now", "not-a-date"]).code, 0, "an invalid clock was accepted");
    assert.deepEqual(reports(), [first]);
  });

  it("[EVID-01] the strict check accepts only a complete report for the current tree", () => {
    assert.equal(runAll().code, 0);
    assert.equal(generate().code, 0);
    const good = path.join(latest().dir, "change-evidence.json");
    assert.equal(node([GENERATOR, "--verify", good]).code, 0);

    const tampered = path.join(root, "tampered.json");
    fs.writeFileSync(tampered, JSON.stringify({ ...JSON.parse(fs.readFileSync(good, "utf8")), kind: "release-record" }));
    assert.equal(node([GENERATOR, "--verify", tampered]).code, 1);

    write("services/app.txt", "application v2\n");
    assert.equal(node([GENERATOR, "--verify", good]).code, 1, "a report for an older tree passed the strict check");

    write("services/app.txt", "application v1\n");
    write("test-results/fail", "");
    assert.equal(runAll("--suite", "second").code, 1);
    assert.equal(generate().code, 0);
    const failed = path.join(latest().dir, "change-evidence.json");
    assert.equal(node([GENERATOR, "--verify", failed]).code, 1);
    const forged = path.join(root, "forged.json");
    fs.writeFileSync(forged, JSON.stringify({ ...JSON.parse(fs.readFileSync(failed, "utf8")), verification: { gate: "COMPLETE", missing: [], failed: [], unreadableRecords: 0 } }));
    assert.equal(node([GENERATOR, "--verify", forged]).code, 1, "a report edited to COMPLETE passed the strict check");
  });
});
