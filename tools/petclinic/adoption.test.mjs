import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { PROJECTS, projectEnv } from "../../spec/harness/config.js";
const root = fileURLToPath(new URL("../../", import.meta.url));
const configFile =
  process.env.PETCLINIC_ADOPTION_CONFIG ??
  path.join(root, "spec/factory/petclinic/config.json");
test("PetClinic adoption preserves all seven existing runtime bindings", () => {
  const c = JSON.parse(fs.readFileSync(configFile));
  assert.deepEqual(
    c.runtime.projects.map((p) => p.id).sort(),
    Object.keys(PROJECTS).sort(),
  );
  assert.deepEqual(c.runtime.startupGroups, [
    ["collector", "payment"],
    ["customer", "reservation", "veterinarian-services", "checkout"],
    ["frontend"],
  ]);
  for (const p of c.runtime.projects) {
    const existing = PROJECTS[p.id],
      expected = projectEnv(p.id);
    delete expected.PATH;
    delete expected.HOME;
    const actual = Object.fromEntries(
      Object.entries(p.environment).map(([k, v]) => [
        k,
        typeof v === "string" ? v : path.resolve(root, v.path),
      ]),
    );
    assert.deepEqual(actual, expected, p.id);
    assert.equal(p.cwd, existing.folder);
    assert.deepEqual(p.dependsOn, existing.dependsOn);
    assert.deepEqual(p.start, { argv: ["./start"], cwd: existing.folder });
    assert.deepEqual(p.setup, { argv: ["./setup"], cwd: existing.folder });
    assert.equal(p.health.url, `http://localhost:${existing.port}/health`);
    assert.equal(p.health.timeoutMs, 10000);
    assert.equal(p.stop.timeoutMs, 5000);
    assert.equal(Boolean(p.testFacilities?.clock), existing.kind === "service");
    assert.equal(Boolean(p.testFacilities), p.id !== "frontend");
  }
});
test("trust snapshot reads the explicit commit, not a changed working authority", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "petclinic-trust-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const consumer = path.join(dir, "consumer");
  fs.mkdirSync(consumer);
  const write = (p, v) => {
    const dest = path.join(consumer, p);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, typeof v === "string" ? v : JSON.stringify(v));
  };
  const config = {
    application: { id: "synthetic", repository: "example/test" },
    factory: {
      repository: "example/factory",
      revision: "a".repeat(40),
      interfaceVersion: 1,
    },
    trust: {
      configuration: "authority.json",
      protectedPaths: "paths.json",
      manifest: "manifest.txt",
    },
  };
  write("spec/factory/petclinic/config.json", config);
  write("authority.json", {
    requiredSuites: ["required"],
    requiredEvidence: ["out/report.json"],
  });
  write("paths.json", { protected: ["spec/"] });
  write("manifest.txt", "Synthetic test-owned baseline text\n");
  const git = (...args) =>
    execFileSync("git", args, { cwd: consumer, encoding: "utf8" }).trim();
  git("init", "-q");
  git("add", ".");
  git(
    "-c",
    "user.name=Synthetic test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-qm",
    "synthetic authority",
  );
  const rev = git("rev-parse", "HEAD");
  write("authority.json", {
    requiredSuites: ["weakened"],
    requiredEvidence: [],
  });
  const output = path.join(dir, "trusted.json");
  const run = (out) =>
    spawnSync(
      process.execPath,
      [
        path.join(root, "tools/petclinic/trust-snapshot.mjs"),
        "--root",
        consumer,
        "--reviewed-revision",
        rev,
        "--output",
        out,
      ],
      { encoding: "utf8" },
    );
  assert.equal(run(output).status, 0);
  const trust = JSON.parse(fs.readFileSync(output));
  assert.deepEqual(trust.requiredSuites, ["required"]);
  assert.equal(
    trust.configSha256,
    crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex"),
  );
  assert.equal(run(output).status, 4, "never overwrite existing trust");
  assert.equal(
    run(path.join(consumer, "trust.json")).status,
    4,
    "never place trust in consumer execution tree",
  );
});
