import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { validate, verifyTrust } from "./core.mjs";
const factory = fs.realpathSync(
  process.env.FACTORY_TEST_CHECKOUT ??
    fileURLToPath(new URL("../../", import.meta.url)),
);
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

for (const output of ["results", "evidence"]) {
  for (const chained of [false, true]) {
    test(`REV-001: ${output} through ${chained ? "chained" : "direct"} shortcut into protected folder rejects before execution`, (t) => {
      const f = fixture(t);
      // These markers would reveal even an attempted runtime/suite launch.
      runtime(
        f,
        "require('node:fs').writeFileSync('runtime-started','yes');process.exit(99);",
      );
      f.write(
        "spec/test.cjs",
        "require('node:fs').writeFileSync('suite-started','yes');process.exit(99);",
      );
      fs.symlinkSync("spec", path.join(f.root, "alias"));
      if (chained) fs.symlinkSync("alias", path.join(f.root, "shortcut"));
      f.config.testing[output] =
        `${chained ? "shortcut" : "alias"}/new/nested/${output}`;
      f.seal();
      const before = fs.readdirSync(path.join(f.root, "spec")).sort();
      const r = run(f);
      assert.equal(r.code, 2);
      assert.equal(r.report.category, "CONFIG_INVALID");
      assert.match(r.report.message, /Output overlaps protected paths/);
      assert.deepEqual(r.report.suites, []);
      assert.equal(r.report.evidence, null);
      assert.ok(!fs.existsSync(path.join(f.root, "runtime-started")));
      assert.ok(!fs.existsSync(path.join(f.root, "suite-started")));
      assert.ok(!fs.existsSync(path.join(f.root, "spec/new")));
      assert.ok(!fs.existsSync(path.join(f.root, "out/results")));
      assert.deepEqual(
        fs.readdirSync(path.join(f.root, "spec")).sort(),
        before,
      );
    });
  }
}
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

test("REV-001: retargeted shortcut is rejected when authority is checked", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, "out"));
  fs.symlinkSync("out", path.join(f.root, "alias"));
  f.config.testing.results = "alias/results";
  f.seal();
  const canonicalRoot = fs.realpathSync(f.root);
  const { outputs } = validate(f.config, canonicalRoot, factory);
  fs.unlinkSync(path.join(f.root, "alias"));
  fs.symlinkSync("spec", path.join(f.root, "alias"));
  assert.throws(
    () =>
      verifyTrust(
        canonicalRoot,
        f.config,
        path.join(f.root, "factory.config.json"),
        f.trustPath,
        outputs,
      ),
    (e) =>
      e.category === "CONFIG_INVALID" &&
      /Output destination changed/.test(e.message),
  );
  assert.ok(!fs.existsSync(path.join(f.root, "spec/results")));
});

for (const mutation of [
  "corrupt",
  "delete",
  "stale",
  "null",
  "valid-rewrite",
]) {
  test(`REV-002: waits for shutdown ${mutation} before evidence validation and hashing`, (t) => {
    const f = fixture(t);
    const actions = {
      corrupt: "fs.writeFileSync(evidence, '{broken');",
      delete: "fs.unlinkSync(evidence);",
      stale: "fs.writeFileSync(evidence, '{}');",
      null: "fs.writeFileSync(evidence, 'null');",
      "valid-rewrite":
        "const data=JSON.parse(fs.readFileSync(evidence));data.shutdownComplete=true;fs.writeFileSync(evidence,JSON.stringify(data));",
    };
    runtime(
      f,
      `const fs=require('node:fs');
fs.mkdirSync('out/evidence',{recursive:true});
fs.writeFileSync('out/evidence/runtime-pid',String(process.pid));
process.once('SIGTERM',()=>setTimeout(()=>{
 const evidence='out/evidence/application.json';
 ${actions[mutation]}
 fs.writeFileSync('out/evidence/cleanup-finished','yes');
 process.exit(0);
},30));
require('node:http').createServer((q,r)=>r.end(JSON.stringify({status:'ok'}))).listen(49874,'127.0.0.1');`,
    );
    const result = run(f);
    assert.equal(
      fs.readFileSync(
        path.join(f.root, "out/evidence/cleanup-finished"),
        "utf8",
      ),
      "yes",
    );
    const pid = Number(
      fs.readFileSync(path.join(f.root, "out/evidence/runtime-pid")),
    );
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    if (mutation === "valid-rewrite") {
      assert.equal(result.code, 0);
      assert.equal(result.report.status, "COMPLETE");
      const envelope = JSON.parse(
        fs.readFileSync(path.join(f.root, result.report.evidence)),
      );
      const evidence = fs.readFileSync(
        path.join(f.root, "out/evidence/application.json"),
      );
      assert.equal(JSON.parse(evidence).shutdownComplete, true);
      assert.equal(
        envelope.artifacts.find(
          (a) => a.path === "out/evidence/application.json",
        ).sha256,
        hash(evidence),
      );
    } else {
      assert.equal(result.code, 8);
      assert.equal(result.report.status, "FAILED");
      assert.equal(result.report.category, "EVIDENCE_MISSING");
      assert.equal(result.report.evidence, null);
      assert.equal(
        fs
          .readdirSync(path.join(f.root, "out/evidence"))
          .some((p) =>
            fs.statSync(path.join(f.root, "out/evidence", p)).isDirectory(),
          ),
        false,
        "no COMPLETE envelope directory",
      );
    }
  });
}

test("REV-002: cleanup waits for descendants after the runtime leader exits", (t) => {
  const f = fixture(t);
  const childScript =
    "const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync('out/evidence/descendant-pid',String(process.pid));setInterval(()=>{},1000);";
  runtime(
    f,
    `const fs=require('node:fs');
fs.mkdirSync('out/evidence',{recursive:true});
require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childScript)}],{stdio:'ignore'});
process.once('SIGTERM',()=>process.exit(0));
require('node:http').createServer((q,r)=>{r.end(JSON.stringify({status:fs.existsSync('out/evidence/descendant-pid')?'ok':'starting'}));}).listen(49874,'127.0.0.1');`,
  );
  f.config.runtime.projects[0].stop.timeoutMs = 2000;
  f.seal();
  const result = run(f);
  assert.equal(result.code, 0, JSON.stringify(result.report));
  const pid = Number(
    fs.readFileSync(path.join(f.root, "out/evidence/descendant-pid")),
  );
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});
