#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  codes,
  fail,
  hash,
  git,
  resolve,
  json,
  validate,
  verifyTrust,
  tree,
} from "./core.mjs";
import { launch, stop, startRuntime } from "./processes.mjs";
const factory = fs.realpathSync(
  fileURLToPath(new URL("../../", import.meta.url)),
);
const report = {
  interfaceVersion: 1,
  status: "FAILED",
  category: null,
  message: "",
  suites: [],
  evidence: null,
};
const owned = [];
let failure = null;
try {
  const args = process.argv.slice(2);
  if (args.shift() !== "verify") fail("CONFIG_INVALID", "Expected verify");
  const options = {};
  while (args.length) {
    const k = args.shift();
    if (
      !["--root", "--config", "--trust", "--mode"].includes(k) ||
      options[k] !== undefined ||
      !args.length
    )
      fail("CONFIG_INVALID", "Invalid arguments");
    options[k] = args.shift();
  }
  if (!options["--root"] || !options["--config"] || !options["--trust"])
    fail("CONFIG_INVALID", "Explicit root, config and trusted policy required");
  const mode = options["--mode"] ?? "full";
  if (!["full", "fast"].includes(mode)) fail("CONFIG_INVALID", "Invalid mode");
  let root;
  try {
    root = fs.realpathSync(options["--root"]);
    if (fs.realpathSync(git(root, "rev-parse", "--show-toplevel")) !== root)
      throw Error();
  } catch {
    fail("CONFIG_INVALID", "Root must be a Git worktree root");
  }
  const configPath = resolve(root, options["--config"]);
  const c = json(configPath);
  const { outputs } = validate(c, root, factory);
  try {
    if (
      git(factory, "rev-parse", "HEAD") !== c.factory.revision ||
      git(factory, "status", "--porcelain", "--untracked-files=all")
    )
      throw Error();
  } catch {
    fail(
      "VERSION_INCOMPATIBLE",
      "Factory checkout must be clean and match the immutable pin",
    );
  }
  const trustPath = path.isAbsolute(options["--trust"])
    ? options["--trust"]
    : resolve(root, options["--trust"]);
  const { trust, policy, policySha256 } = verifyTrust(
    root,
    c,
    configPath,
    trustPath,
    outputs,
  );
  const runId = crypto.randomUUID(),
    startedAt = new Date().toISOString();
  const identity = tree(root, outputs);
  const revision = git(root, "rev-parse", "HEAD");
  const dirty = !!git(root, "status", "--porcelain", "--untracked-files=all");
  const runDir = resolve(root, `${c.testing.results}/${runId}`, false);
  fs.mkdirSync(runDir, { recursive: true });
  const env = {
    ...process.env,
    FACTORY_APPLICATION_ROOT: root,
    FACTORY_CHECKOUT: factory,
    FACTORY_RUN_ID: runId,
    FACTORY_CONSUMER_TREE: identity,
    FACTORY_REVISION: c.factory.revision,
  };
  // Fast mode conservatively runs the trusted full set, but never claims completeness.
  try {
    await startRuntime(root, c.runtime, runDir, owned);
    // Explicit protected policy: suites that test lifecycle own their processes.
    // Validate the configured runtime first, then release only our process groups.
    if (policy.runtimeOwnership === "suite") {
      for (const { s, timeout } of owned) await stop(s, timeout);
      owned.length = 0;
    }
    for (const id of trust.requiredSuites) {
      if (!/^[a-zA-Z0-9_-]+$/.test(id))
        fail("TRUST_INVALID", "Invalid suite ID");
      const s = policy.suites[id],
        log = path.join(runDir, `${id}.log`);
      const child = launch(
        [s.cmd, ...s.args],
        resolve(root, c.testing.cwd),
        env,
        log,
      );
      owned.push({ s: child, timeout: 5000 });
      await child.done;
      const item = {
        id,
        exitCode: child.code ?? null,
        log: path.relative(root, log),
      };
      report.suites.push(item);
      if (child.error) {
        failure ??= {
          category: "TOOLING_UNAVAILABLE",
          message: child.error.message,
        };
      } else if (child.code !== 0) {
        failure ??= {
          category: "APPLICATION_TEST_FAILED",
          message: `Suite ${id} failed (${child.code ?? child.signal})`,
        };
      }
      await stop(child);
    }
    if (failure) fail(failure.category, failure.message);
    // Shutdown is a barrier: final validation and all fingerprints follow it.
    for (const { s, timeout } of owned) await stop(s, timeout);
    owned.length = 0;
    if (
      git(factory, "rev-parse", "HEAD") !== c.factory.revision ||
      git(factory, "status", "--porcelain", "--untracked-files=all")
    )
      fail("VERSION_INCOMPATIBLE", "Factory changed during verification");
    if (tree(root, outputs) !== identity)
      fail("EVIDENCE_MISSING", "Consumer inputs changed during cleanup");
    verifyTrust(root, c, configPath, trustPath, outputs);
    const evidenceDocuments = new Map();
    const artifacts = trust.requiredEvidence.map((rel) => {
      const p = resolve(root, rel, false);
      let bytes, data;
      try {
        bytes = fs.readFileSync(p);
        data = JSON.parse(bytes);
      } catch {
        fail("EVIDENCE_MISSING", `Missing or malformed evidence: ${rel}`);
      }
      if (!data || typeof data !== "object" || Array.isArray(data))
        fail("EVIDENCE_MISSING", `Invalid evidence document: ${rel}`);
      evidenceDocuments.set(rel, data);
      if (
        data.runId !== runId ||
        data.consumerTree !== identity ||
        data.factoryRevision !== c.factory.revision
      )
        fail("EVIDENCE_MISSING", `Stale evidence: ${rel}`);
      return { path: rel, sha256: hash(bytes) };
    });
    // Reviewed legacy adapters may bind unchanged reports through a hash sidecar.
    for (const artifact of [...artifacts]) {
      const binding = evidenceDocuments.get(artifact.path);
      if (binding.artifacts === undefined) continue;
      if (!Array.isArray(binding.artifacts))
        fail("EVIDENCE_MISSING", "Invalid bound artifact list");
      for (const item of binding.artifacts) {
        if (
          !item ||
          typeof item.path !== "string" ||
          !/^[a-f0-9]{64}$/.test(item.sha256 ?? "")
        )
          fail("EVIDENCE_MISSING", "Invalid bound artifact");
        const p = resolve(root, item.path, false);
        if (
          !outputs.some((o) => p.startsWith(o + path.sep)) ||
          !fs.existsSync(p) ||
          hash(fs.readFileSync(p)) !== item.sha256
        )
          fail("EVIDENCE_MISSING", `Changed bound artifact: ${item.path}`);
        if (!artifacts.some((a) => a.path === item.path)) artifacts.push(item);
      }
    }
    const status = mode === "full" ? "COMPLETE" : "INCOMPLETE";
    const envelope = {
      schemaVersion: 1,
      applicationId: c.application.id,
      consumer: {
        repository: c.application.repository,
        revision,
        treeSha256: identity,
        dirty,
      },
      factory: c.factory,
      configuration: { schemaVersion: 1, sha256: trust.configSha256 },
      trust: { policySha256, manifestSha256: trust.protectedManifestSha256 },
      contracts: c.contractVersions.map((x) => ({
        ...x,
        sha256: hash(fs.readFileSync(resolve(root, x.path))),
      })),
      mode,
      status,
      category: null,
      suites: report.suites,
      artifacts,
      toolVersions: { node: process.version, git: git(root, "--version") },
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    const evidence = `${c.testing.evidence}/${runId}/consumer-evidence.v1.json`;
    const p = resolve(root, evidence, false);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(envelope, null, 2) + "\n");
    Object.assign(report, {
      status,
      category: null,
      message:
        mode === "full"
          ? "Required suites and evidence verified"
          : "Selected checks passed; full verification not claimed",
      evidence,
    });
  } finally {
    fs.writeFileSync(
      path.join(runDir, "run.json"),
      JSON.stringify(
        {
          runId,
          consumerTree: identity,
          factoryRevision: c.factory.revision,
          startedAt,
          finishedAt: new Date().toISOString(),
          suites: report.suites,
        },
        null,
        2,
      ) + "\n",
    );
  }
} catch (e) {
  Object.assign(report, {
    status: "FAILED",
    category: e.category ?? "FACTORY_ERROR",
    message: e.message,
    evidence: null,
  });
} finally {
  for (const { s, timeout } of owned) {
    try {
      await stop(s, timeout);
    } catch (e) {
      report.cleanupError = e.message;
      if (!report.category)
        Object.assign(report, {
          status: "FAILED",
          category: "FACTORY_ERROR",
          message: "Process cleanup failed",
          evidence: null,
        });
    }
  }
}
process.stdout.write(JSON.stringify(report) + "\n");
process.exitCode = report.category ? codes[report.category] : 0;
