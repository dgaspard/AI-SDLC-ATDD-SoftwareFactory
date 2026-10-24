// CI-02 local slice: the runner's exit behavior and the verifier's evidence rules, proven on a
// temporary repository copy; the real test-results are never touched. Protected test.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SPEC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ok = (n) => ["-e", `console.log("ℹ tests ${n}\\nℹ pass ${n}\\nℹ fail 0")`];
const policy = {
  description: "fixture policy",
  suites: {
    first: { name: "First", cmd: process.execPath, args: ok(2) },
    second: { name: "Second", cmd: process.execPath, args: ok(1) },
    broken: { name: "Broken", cmd: process.execPath, args: ["-e", "console.log('ℹ tests 1\\nℹ pass 0\\nℹ fail 1'); process.exit(1)"] },
    // Fails while test-results/flaky exists (ignored, so the tree is unchanged); runs with cwd spec/.
    flaky: { name: "Flaky", cmd: process.execPath, args: ["-e", "process.exit(require('fs').existsSync('../test-results/flaky') ? 1 : 0)"] },
  },
  tiers: { fast: { always: ["first"], suites: ["first"] }, full: { suites: ["first", "second", "flaky"] } },
  rules: { list: [] },
};

let root;
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const run = (...args) => {
  const r = spawnSync(process.execPath, ["spec/run-all.js", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, CI: "" } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const records = () => {
  const dir = path.join(root, "test-results", "runs");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))) : [];
};

describe("run-all gate and verifier (CI-02)", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "run-all-"));
    write("spec/run-all.js", fs.readFileSync(path.join(SPEC, "run-all.js"), "utf8"));
    fs.cpSync(path.join(SPEC, "../tools/factory"), path.join(root, "tools/factory"), {recursive:true});
    write("spec/harness/config.js", fs.readFileSync(path.join(SPEC, "harness/config.js"), "utf8"));
    write("spec/test-policy.json", JSON.stringify(policy, null, 2));
    write(".gitignore", "test-results/\n");
    write("services/app.txt", "application v1\n");
    execFileSync("git", ["init", "-q"], { cwd: root });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("[CI-02] a failing required suite exits non-zero and still writes its record and log", () => {
    const r = run("--suite", "broken");
    assert.equal(r.code, 1);
    const [rec] = records();
    assert.equal(rec.result, "fail");
    assert.equal(rec.suites[0].status, "fail");
    assert.ok(fs.existsSync(path.join(root, rec.suites[0].log)), "failure log was not retained");
  });

  it("[CI-02] a passing full tier verifies, and writing records doesn't change the tested tree", () => {
    assert.equal(run().code, 0);
    const v = run("--verify");
    assert.equal(v.code, 0, v.out);
    assert.match(v.out, /GATE PASS/);
  });

  it("[CI-02] no records means the gate is incomplete, naming every missing suite", () => {
    const v = run("--verify");
    assert.equal(v.code, 1);
    assert.match(v.out, /GATE INCOMPLETE.*Missing: first, second, flaky/);
  });

  it("[CI-02] a missing required suite keeps the gate incomplete", () => {
    assert.equal(run("--suite", "first").code, 0);
    const v = run("--verify");
    assert.equal(v.code, 1);
    assert.match(v.out, /Missing: second/);
  });

  it("[CI-02] evidence from a different tree is stale and doesn't verify", () => {
    assert.equal(run().code, 0);
    write("services/app.txt", "application v2\n");
    const v = run("--verify");
    assert.equal(v.code, 1);
    assert.match(v.out, /GATE INCOMPLETE/);
  });

  it("[CI-02] evidence recorded under a different test policy doesn't verify", () => {
    assert.equal(run().code, 0);
    write("spec/test-policy.json", JSON.stringify({ ...policy, description: "changed" }, null, 2));
    assert.equal(run("--verify").code, 1);
  });

  it("[CI-02] a malformed record never verifies and is reported", () => {
    write("test-results/runs/forged.json", "{ not json");
    const v = run("--verify");
    assert.equal(v.code, 1);
    assert.match(v.out, /1 unreadable run record/);
  });

  it("[CI-02] a passing record whose log is missing can't be verified", () => {
    assert.equal(run().code, 0);
    for (const rec of records()) for (const s of rec.suites) fs.rmSync(path.join(root, s.log), { force: true });
    const v = run("--verify");
    assert.equal(v.code, 1);
    assert.match(v.out, /Missing: first, second, flaky/);
  });

  it("[CI-02] a later failure on the same tree revokes an earlier pass", () => {
    assert.equal(run().code, 0);
    assert.equal(run("--verify").code, 0);
    write("test-results/flaky", "");
    assert.equal(run("--suite", "flaky").code, 1);
    const v = run("--verify");
    assert.equal(v.code, 1);
    assert.match(v.out, /Missing: flaky$/m);
  });

  it("[EVID-01] --verify --json reports the verifier's view: full tree, policy and each suite's status", () => {
    assert.equal(run().code, 0);
    let v = run("--verify", "--json");
    assert.equal(v.code, 0);
    let j = JSON.parse(v.out);
    assert.match(j.tree, /^[0-9a-f]{40}$/);
    assert.match(j.policy.sha256, /^[0-9a-f]{64}$/);
    assert.equal(j.complete, true);
    assert.deepEqual(j.suites.map((s) => [s.id, s.status]), [["first", "pass"], ["second", "pass"], ["flaky", "pass"]]);
    write("test-results/flaky", "");
    assert.equal(run("--suite", "flaky").code, 1);
    v = run("--verify", "--json");
    assert.equal(v.code, 1);
    j = JSON.parse(v.out);
    assert.deepEqual([j.complete, j.failed, j.missing], [false, ["flaky"], []]);
    assert.match(j.suites.find((s) => s.id === "flaky").log, /^test-results\/runs\//);
  });

  it("[CI-02] a pass whose log points outside test-results/runs can't be verified", () => {
    assert.equal(run().code, 0);
    write("test-results/elsewhere.log", "looks like a log\n"); // ignored, so the tree is unchanged
    for (const f of fs.readdirSync(path.join(root, "test-results", "runs")).filter((x) => x.endsWith(".json"))) {
      const file = path.join(root, "test-results", "runs", f);
      const rec = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const s of rec.suites) s.log = "test-results/elsewhere.log";
      fs.writeFileSync(file, JSON.stringify(rec));
    }
    assert.equal(run("--verify").code, 1);
  });
});
