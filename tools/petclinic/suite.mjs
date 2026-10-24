// Consumer-owned compatibility/evidence binding. No factory defaults or v1 rewrites.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const run = (args) => {
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  process.stderr.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  if (r.error || r.status !== 0)
    throw Error(
      `Command failed: ${args.join(" ")} (${r.status}): ${r.error?.message ?? ""}`,
    );
  return r.stdout;
};
try {
  const [id] = process.argv.slice(2);
  const policy = JSON.parse(
    fs.readFileSync(path.join(root, "spec/test-policy.json")),
  );
  if (process.argv.length !== 3 || !policy.tiers.full.suites.includes(id))
    throw Error("Explicit full-tier suite ID required");
  const context = {
    runId: process.env.FACTORY_RUN_ID,
    consumerTree: process.env.FACTORY_CONSUMER_TREE,
    factoryRevision: process.env.FACTORY_REVISION,
  };
  if (
    fs.realpathSync(process.env.FACTORY_APPLICATION_ROOT ?? ".") !==
      fs.realpathSync(root) ||
    !/^[a-f0-9-]{36}$/.test(context.runId ?? "") ||
    !/^[a-f0-9]{64}$/.test(context.consumerTree ?? "") ||
    !/^[a-f0-9]{40}$/.test(context.factoryRevision ?? "")
  )
    throw Error("Missing factory provenance context");
  // No cache: every required suite must actually execute in this invocation.
  const output = run(["spec/run-all.js", "--suite", id]);
  const rel = output.match(
    /^Run record: (test-results\/runs\/[\w.-]+\.json)$/m,
  )?.[1];
  if (!rel) throw Error("Missing v1 run record");
  const dir = path.join(
    root,
    "test-results",
    "factory-adoption",
    context.runId,
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify({ ...context, record: rel }) + "\n",
  );
  if (id !== policy.tiers.full.suites.at(-1)) process.exit(0);
  const view = JSON.parse(run(["spec/run-all.js", "--verify", "--json"]));
  if (!view.complete) throw Error("Legacy gate incomplete");
  // Require each selected v1 record to originate in THIS consumer invocation.
  for (const suite of view.suites) {
    const receipt = JSON.parse(
      fs.readFileSync(path.join(dir, `${suite.id}.json`)),
    );
    if (
      receipt.runId !== context.runId ||
      receipt.consumerTree !== context.consumerTree ||
      receipt.factoryRevision !== context.factoryRevision ||
      receipt.record !== `test-results/runs/${suite.runId}.json` ||
      suite.status !== "pass" ||
      suite.cachedFrom
    )
      throw Error(`Unbound suite evidence: ${suite.id}`);
  }
  const generated = run(["tools/evidence/change-evidence.mjs"]);
  const reportPath = generated
    .split("\n")
    .find((x) =>
      /^test-results\/evidence\/[\w.-]+\/change-evidence.json$/.test(x),
    );
  if (!reportPath) throw Error("Missing generated legacy report");
  run(["tools/evidence/change-evidence.mjs", "--verify", reportPath]);
  const files = [
    reportPath,
    reportPath.replace(/\.json$/, ".md"),
    ...view.suites.map((s) => `test-results/runs/${s.runId}.json`),
  ];
  const artifacts = [...new Set(files)].map((p) => ({
    path: p,
    sha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(root, p)))
      .digest("hex"),
  }));
  // This sidecar is new. Original change-evidence.v1 bytes and meanings stay intact.
  fs.writeFileSync(
    path.join(
      root,
      "test-results/factory-adoption/change-evidence-binding.json",
    ),
    JSON.stringify(
      {
        schemaVersion: 1,
        ...context,
        legacyTree: view.tree,
        legacyReport: reportPath,
        artifacts,
      },
      null,
      2,
    ) + "\n",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
