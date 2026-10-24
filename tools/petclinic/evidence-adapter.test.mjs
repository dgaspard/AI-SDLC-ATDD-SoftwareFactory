import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
const source = fileURLToPath(new URL("../../", import.meta.url));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "petclinic-adapter-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (p, s) => {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), s);
  };
  for (const p of [
    "tools/petclinic/suite.mjs",
    "tools/evidence/change-evidence.mjs",
    "spec/run-all.js",
    "spec/delivery/contracts/change-evidence.v1.schema.json",
  ])
    write(
      p,
      fs.readFileSync(
        p === "spec/run-all.js" && process.env.PETCLINIC_RUNNER_CANDIDATE
          ? process.env.PETCLINIC_RUNNER_CANDIDATE
          : path.join(source, p),
      ),
    );
  fs.cpSync(
    path.join(source, "tools/factory"),
    path.join(root, "tools/factory"),
    { recursive: true },
  );
  write("spec/harness/config.js", "export const PROJECTS={};\n");
  write(
    "spec/test-policy.json",
    JSON.stringify({
      suites: {
        first: {
          name: "First",
          cmd: process.execPath,
          args: [
            "-e",
            "process.exit(require('fs').existsSync('../test-results/fail')?7:0)",
          ],
        },
        last: {
          name: "Last",
          cmd: process.execPath,
          args: ["-e", "process.exit(0)"],
        },
      },
      tiers: {
        full: { suites: ["first", "last"] },
        fast: { always: ["first"] },
      },
      rules: { list: [] },
    }),
  );
  write("spec/protected.sha256", "synthetic fixture only\n");
  write(
    "spec/delivery/features/probe.feature",
    "@tier:static\nFeature: Fixture\n  @CTL-901\n  Scenario: Synthetic\n    Given fixture\n",
  );
  write(
    "spec/features/probe.feature",
    "Feature: Synthetic\n  Scenario: Synthetic\n    Given fixture\n",
  );
  write(".gitignore", "test-results/\n");
  write("package.json", '{"type":"module"}\n');
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Synthetic",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-qm",
      "synthetic adapter fixture",
    ],
    { cwd: root },
  );
  const env = {
    ...process.env,
    FACTORY_APPLICATION_ROOT: root,
    FACTORY_RUN_ID: "11111111-1111-1111-1111-111111111111",
    FACTORY_CONSUMER_TREE: "a".repeat(64),
    FACTORY_REVISION: "b".repeat(40),
  };
  delete env.FACTORY_CHECKOUT;
  if (process.env.PETCLINIC_FACTORY_CANDIDATE) {
    env.FACTORY_CHECKOUT = process.env.PETCLINIC_FACTORY_CANDIDATE;
    fs.rmSync(path.join(root, "tools/factory"), { recursive: true });
  }
  const run = (id) =>
    spawnSync(process.execPath, ["tools/petclinic/suite.mjs", id], {
      cwd: root,
      env,
      encoding: "utf8",
    });
  return { root, write, run, env };
}
test("legacy evidence binding requires this invocation and preserves original report bytes", (t) => {
  const f = fixture(t);
  let r = f.run("first");
  assert.equal(r.status, 0, r.stderr);
  r = f.run("last");
  assert.equal(r.status, 0, r.stderr);
  const binding = JSON.parse(
    fs.readFileSync(
      path.join(
        f.root,
        "test-results/factory-adoption/change-evidence-binding.json",
      ),
    ),
  );
  assert.equal(binding.runId, f.env.FACTORY_RUN_ID);
  assert.equal(binding.consumerTree, f.env.FACTORY_CONSUMER_TREE);
  assert.equal(binding.artifacts.length, 4);
  const report = JSON.parse(
    fs.readFileSync(path.join(f.root, binding.legacyReport)),
  );
  assert.equal("factoryRevision" in report, false, "v1 is not relabelled");
  // Earlier passing v1 records may exist, but a new invocation cannot borrow them.
  f.env.FACTORY_RUN_ID = "22222222-2222-2222-2222-222222222222";
  r = f.run("last");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ENOENT|Unbound suite/);
});
test("legacy failure remains nonzero and produces no successful binding", (t) => {
  const f = fixture(t);
  f.write("test-results/fail", "fail");
  const r = f.run("first");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Command failed/);
  assert.equal(
    fs.existsSync(
      path.join(
        f.root,
        "test-results/factory-adoption/change-evidence-binding.json",
      ),
    ),
    false,
  );
});
