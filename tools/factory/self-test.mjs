import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
const factory = fileURLToPath(new URL("../../", import.meta.url));
const cli = path.join(factory, "tools/factory/consumer.mjs");
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");

// Independent synthetic consumer. No PetClinic assertions, guard entry points,
// network calls, or fixture copy of the missing factory implementation.
function fixture(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "factory-boundary-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "consumer with spaces");
  fs.mkdirSync(root);
  const write = (p, data) => {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), data);
  };
  write("spec/requirements.txt", "Synthetic contract v1\n");
  write(
    "spec/test.cjs",
    `const fs=require('node:fs');
if(process.env.FACTORY_APPLICATION_ROOT!==process.cwd()) process.exit(44);
fs.mkdirSync('out/evidence',{recursive:true});
fs.writeFileSync('out/evidence/application.json',JSON.stringify({runId:process.env.FACTORY_RUN_ID,consumerTree:process.env.FACTORY_CONSUMER_TREE,factoryRevision:process.env.FACTORY_REVISION}));\n`,
  );
  write(
    "spec/policy.json",
    JSON.stringify({
      suites: {
        application: { cmd: process.execPath, args: ["spec/test.cjs"] },
      },
      tiers: {
        full: { suites: ["application"] },
        fast: { always: ["application"] },
      },
      rules: { list: [] },
    }),
  );
  write(
    "spec/paths.json",
    JSON.stringify({
      protected: ["spec/", "factory.config.json"],
      ignored: ["spec/protected.sha256"],
    }),
  );
  write("spec/trust.json", "{}\n");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: factory,
    encoding: "utf8",
  }).trim();
  const config = {
    schemaVersion: 1,
    application: {
      id: "boundary-fixture",
      repository: "example/consumer",
      root: ".",
    },
    factory: {
      repository:
        "https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory.git",
      revision,
      interfaceVersion: 1,
    },
    locations: Object.fromEntries(
      [
        "domainContracts",
        "apiContracts",
        "bdd",
        "performanceScenarios",
        "performanceWorkloads",
        "applicationPolicies",
        "fixtures",
      ].map((k) => [k, ["spec/requirements.txt"]]),
    ),
    runtime: {
      contract: "spec/requirements.txt",
      projects: [],
      startupGroups: [],
      telemetry: {
        endpoint: "http://localhost:4318",
        protocol: "http/protobuf",
        tracesExporter: "otlp",
        metricsExporter: "none",
        logsExporter: "none",
        batchDelayMs: 100,
        waitMs: 5000,
      },
    },
    testing: {
      policy: "spec/policy.json",
      cwd: ".",
      results: "out/results",
      evidence: "out/evidence",
    },
    trust: {
      protectedPaths: "spec/paths.json",
      manifest: "spec/protected.sha256",
      configuration: "spec/trust.json",
    },
    contractVersions: [
      { id: "synthetic", version: "1", path: "spec/requirements.txt" },
    ],
  };
  const trust = {
    schemaVersion: 1,
    applicationId: config.application.id,
    repository: config.application.repository,
    factory: config.factory,
    requiredSuites: ["application"],
    requiredEvidence: ["out/evidence/application.json"],
    protectedPaths: ["spec/", "factory.config.json"],
  };
  // Test-owned baseline creation is independent of guard and never touches the real baseline.
  const trustPath = path.join(parent, "trusted.json");
  function seal() {
    write("factory.config.json", JSON.stringify(config, null, 2) + "\n");
    const paths = [
      "factory.config.json",
      ...fs
        .readdirSync(path.join(root, "spec"))
        .filter((x) => x !== "protected.sha256")
        .map((x) => "spec/" + x),
    ].sort();
    write(
      "spec/protected.sha256",
      paths
        .map((p) => `${hash(fs.readFileSync(path.join(root, p)))}  ${p}\n`)
        .join(""),
    );
    trust.configSha256 = hash(
      fs.readFileSync(path.join(root, "factory.config.json")),
    );
    trust.protectedManifestSha256 = hash(
      fs.readFileSync(path.join(root, "spec/protected.sha256")),
    );
    fs.writeFileSync(trustPath, JSON.stringify(trust));
  }
  seal();
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Boundary Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-qm",
      "synthetic inputs",
    ],
    { cwd: root },
  );
  return { root, parent, config, trust, write, seal, trustPath };
}
function run(f, extra = []) {
  assert.ok(
    fs.existsSync(cli),
    "START-02 consumer CLI is not implemented; no boundary behavior has run",
  );
  const r = spawnSync(
    process.execPath,
    [
      cli,
      "verify",
      "--root",
      f.root,
      "--config",
      "factory.config.json",
      "--trust",
      f.trustPath,
      "--mode",
      "full",
      ...extra,
    ],
    { cwd: os.tmpdir(), encoding: "utf8", timeout: 15000 },
  );
  assert.ifError(r.error);
  return { code: r.status, report: JSON.parse(r.stdout) };
}
function expectFailure(f, code, category) {
  const r = run(f);
  assert.equal(r.code, code);
  assert.equal(r.report.status, "FAILED");
  assert.equal(r.report.category, category);
}

test("extra: fast mode cannot claim full verification", (t) => {
  const f = fixture(t);
  const r = spawnSync(
    process.execPath,
    [
      cli,
      "verify",
      "--root",
      f.root,
      "--config",
      "factory.config.json",
      "--trust",
      f.trustPath,
      "--mode",
      "fast",
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).status, "INCOMPLETE");
});
test("extra: escaping symlink is rejected", (t) => {
  const f = fixture(t);
  fs.symlinkSync(f.trustPath, path.join(f.root, "outside"));
  f.config.locations.fixtures = ["outside"];
  f.seal();
  expectFailure(f, 2, "CONFIG_INVALID");
});
test("extra: added protected member is rejected", (t) => {
  const f = fixture(t);
  f.write("spec/unreviewed.txt", "new");
  expectFailure(f, 4, "TRUST_INVALID");
});
test("extra: removed protected member is rejected", (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.root, "spec/test.cjs"));
  expectFailure(f, 4, "TRUST_INVALID");
});
function runtime(f, script, facilities) {
  f.write("spec/start.cjs", script);
  f.config.runtime.projects = [
    {
      id: "probe",
      kind: "service",
      cwd: ".",
      setup: { argv: [process.execPath, "-e", "process.exit(0)"], cwd: "." },
      start: { argv: [process.execPath, "spec/start.cjs"], cwd: "." },
      dependsOn: [],
      environment: { TEST_MODE: "disabled" },
      health: {
        url: "http://127.0.0.1:49874/health",
        status: 200,
        json: { status: "ok" },
        timeoutMs: 500,
      },
      stop: { signal: "SIGTERM", timeoutMs: 100 },
      ...(facilities ? { testFacilities: facilities } : {}),
    },
  ];
  f.config.runtime.startupGroups = [["probe"]];
  f.seal();
}
test("extra: health timeout cleans up the owned process", (t) => {
  const f = fixture(t);
  runtime(
    f,
    "require('node:fs').writeFileSync('out/pid',String(process.pid));setInterval(()=>{},1000);",
  );
  expectFailure(f, 6, "STARTUP_FAILED");
  const pid = Number(fs.readFileSync(path.join(f.root, "out/pid")));
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});
test("extra: disabled test facilities are never invoked", (t) => {
  const f = fixture(t);
  runtime(
    f,
    "require('node:http').createServer((q,r)=>{if(q.url!='/health')process.exit(42);r.setHeader('content-type','application/json');r.end(JSON.stringify({status:'ok'}));}).listen(49874,'127.0.0.1');",
    {
      enable: {
        variable: "TEST_MODE",
        enabledValue: "enabled",
        disabledValue: "disabled",
      },
      reset: { method: "POST", path: "/test/reset", status: 204 },
    },
  );
  assert.equal(run(f).code, 0);
});

test("extra: test facility cannot redirect to another host", (t) => {
  const f = fixture(t);
  runtime(f, "process.exit(0);", {
    enable: {
      variable: "TEST_MODE",
      enabledValue: "enabled",
      disabledValue: "disabled",
    },
    reset: {
      method: "POST",
      path: "/" + String.fromCharCode(92) + "example.invalid/reset",
      status: 204,
    },
  });
  expectFailure(f, 2, "CONFIG_INVALID");
});

test("extra: symlink output alias cannot write into protected inputs", (t) => {
  const f = fixture(t);
  fs.symlinkSync("spec", path.join(f.root, "alias"));
  f.config.testing.results = "alias/results";
  f.seal();
  expectFailure(f, 2, "CONFIG_INVALID");
  assert.ok(!fs.existsSync(path.join(f.root, "spec/results")));
});
test("extra: symlink aliases cannot conceal output collisions", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, "out"));
  fs.symlinkSync("out", path.join(f.root, "alias"));
  f.config.testing.results = "out/same";
  f.config.testing.evidence = "alias/same";
  f.seal();
  expectFailure(f, 2, "CONFIG_INVALID");
});

test("extra: evidence modified during shutdown cannot complete", (t) => {
  const f = fixture(t);
  runtime(
    f,
    "process.on('SIGTERM',()=>{require('node:fs').writeFileSync('out/evidence/application.json','{}');process.exit(0);});require('node:http').createServer((q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({status:'ok'}));}).listen(49874,'127.0.0.1');",
  );
  expectFailure(f, 8, "EVIDENCE_MISSING");
});

test("adoption: suite ownership releases runtime ports before tests", (t) => {
  const f = fixture(t);
  runtime(
    f,
    "require('node:http').createServer((q,r)=>r.end(JSON.stringify({status:'ok'}))).listen(49874,'127.0.0.1');",
  );
  const policy = JSON.parse(
    fs.readFileSync(path.join(f.root, "spec/policy.json")),
  );
  policy.runtimeOwnership = "suite";
  f.write("spec/policy.json", JSON.stringify(policy));
  const original = fs.readFileSync(path.join(f.root, "spec/test.cjs"), "utf8");
  f.write(
    "spec/test.cjs",
    original +
      "\nconst server=require('node:net').createServer();server.on('error',()=>process.exit(43));server.listen(49874,'127.0.0.1',()=>server.close());\n",
  );
  f.seal();
  assert.equal(run(f).code, 0);
});
test("adoption: unknown runtime ownership fails before startup", (t) => {
  const f = fixture(t);
  const policy = JSON.parse(
    fs.readFileSync(path.join(f.root, "spec/policy.json")),
  );
  policy.runtimeOwnership = "invented";
  f.write("spec/policy.json", JSON.stringify(policy));
  f.seal();
  expectFailure(f, 4, "TRUST_INVALID");
});
for (const changed of [false, true])
  test(`adoption: bound legacy bytes ${changed ? "changed fail" : "unchanged attach"}`, (t) => {
    const f = fixture(t);
    f.write(
      "spec/test.cjs",
      `const fs=require('node:fs'), crypto=require('node:crypto');
fs.mkdirSync('out/evidence',{recursive:true});
const report='unchanged legacy bytes';
fs.writeFileSync('out/evidence/legacy.json',${changed ? "'changed'" : "report"});
fs.writeFileSync('out/evidence/application.json',JSON.stringify({runId:process.env.FACTORY_RUN_ID,consumerTree:process.env.FACTORY_CONSUMER_TREE,factoryRevision:process.env.FACTORY_REVISION,artifacts:[{path:'out/evidence/legacy.json',sha256:crypto.createHash('sha256').update(report).digest('hex')}]}));`,
    );
    f.seal();
    const r = run(f);
    assert.equal(r.code, changed ? 8 : 0);
    if (!changed) {
      const envelope = JSON.parse(
        fs.readFileSync(path.join(f.root, r.report.evidence)),
      );
      assert.ok(
        envelope.artifacts.some((x) => x.path === "out/evidence/legacy.json"),
      );
    }
  });
