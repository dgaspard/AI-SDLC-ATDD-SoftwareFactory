import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
export const codes = {
  CONFIG_INVALID: 2,
  VERSION_INCOMPATIBLE: 3,
  TRUST_INVALID: 4,
  TOOLING_UNAVAILABLE: 5,
  STARTUP_FAILED: 6,
  APPLICATION_TEST_FAILED: 7,
  EVIDENCE_MISSING: 8,
  FACTORY_ERROR: 9,
};
export function fail(category, message) {
  throw Object.assign(new Error(message), { category });
}
export const hash = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
export const git = (root, ...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
export const within = (root, p) => p === root || p.startsWith(root + path.sep);
export function resolve(root, rel, exists = true) {
  if (
    typeof rel !== "string" ||
    !rel ||
    path.isAbsolute(rel) ||
    rel.includes("\\") ||
    rel.split("/").includes("..") ||
    /[\0\r\n]/.test(rel)
  )
    fail("CONFIG_INVALID", `Invalid relative path: ${rel}`);
  const p = path.resolve(root, rel);
  let ancestor = p;
  while (true) {
    try {
      fs.lstatSync(ancestor);
      break;
    } catch (e) {
      if (e.code !== "ENOENT")
        fail("CONFIG_INVALID", `Cannot resolve path: ${rel}`);
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) fail("CONFIG_INVALID", "Missing path ancestor");
    ancestor = parent;
  }
  let canonical;
  try {
    canonical = path.resolve(
      fs.realpathSync(ancestor),
      path.relative(ancestor, p),
    );
  } catch {
    fail("CONFIG_INVALID", `Unresolvable symlink: ${rel}`);
  }
  if (!within(root, p) || !within(root, canonical))
    fail("CONFIG_INVALID", `Path escapes root: ${rel}`);
  if (exists && !fs.existsSync(p))
    fail("CONFIG_INVALID", `Missing input: ${rel}`);
  return canonical;
}
export function json(p, category = "CONFIG_INVALID") {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    fail(category, `Cannot read JSON: ${p}`);
  }
}
export function object(v, required, optional = []) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    required.some((k) => !(k in v)) ||
    Object.keys(v).some((k) => !required.includes(k) && !optional.includes(k))
  )
    fail("CONFIG_INVALID", `Expected fields: ${required.join(", ")}`);
}
export function string(v) {
  if (typeof v !== "string" || !v || v.includes("\0"))
    fail("CONFIG_INVALID", "Expected nonempty string");
}
export function list(v, nonempty = true) {
  if (!Array.isArray(v) || (nonempty && !v.length))
    fail("CONFIG_INVALID", "Expected array");
}
export function unique(v) {
  list(v, false);
  if (new Set(v).size !== v.length) fail("CONFIG_INVALID", "Duplicate values");
}
export function tree(root, outputs) {
  const files = git(root, "ls-files", "-co", "--exclude-standard", "-z")
    .split("\0")
    .filter(Boolean);
  const rows = [],
    modes = [];
  for (const rel of [...new Set(files)].sort()) {
    if (outputs.some((p) => within(p, resolve(root, rel, false)))) continue;
    const p = resolve(root, rel);
    const st = fs.statSync(p);
    if (!st.isFile()) fail("CONFIG_INVALID", `Not a regular input: ${rel}`);
    rows.push(`${hash(fs.readFileSync(p))}  ${rel}\n`);
    modes.push(`${(st.mode & 0o777).toString(8)}  ${rel}\n`);
  }
  return hash(rows.join("") + modes.join(""));
}
export function validate(c, root, factory) {
  object(c, [
    "schemaVersion",
    "application",
    "factory",
    "locations",
    "runtime",
    "testing",
    "trust",
    "contractVersions",
  ]);
  if (c.schemaVersion !== 1 || c.factory?.interfaceVersion !== 1)
    fail("VERSION_INCOMPATIBLE", "Unsupported interface/schema");
  object(c.application, ["id", "repository", "root"]);
  string(c.application.id);
  string(c.application.repository);
  if (c.application.root !== ".")
    fail("CONFIG_INVALID", "application.root must be .");
  object(c.factory, ["repository", "revision", "interfaceVersion"]);
  string(c.factory.repository);
  if (!/^[a-f0-9]{40}$/.test(c.factory.revision))
    fail("CONFIG_INVALID", "Full immutable factory SHA required");
  const inputs = [];
  const input = (r) => {
    const p = resolve(root, r);
    inputs.push(p);
    return p;
  };
  object(c.locations, [
    "domainContracts",
    "apiContracts",
    "bdd",
    "performanceScenarios",
    "performanceWorkloads",
    "applicationPolicies",
    "fixtures",
  ]);
  for (const values of Object.values(c.locations)) {
    list(values);
    values.forEach(input);
  }
  object(c.testing, ["policy", "cwd", "results", "evidence"]);
  input(c.testing.policy);
  resolve(root, c.testing.cwd);
  object(c.trust, ["protectedPaths", "manifest", "configuration"]);
  Object.values(c.trust).forEach(input);
  list(c.contractVersions);
  unique(c.contractVersions.map((x) => x.id));
  for (const x of c.contractVersions) {
    object(x, ["id", "version", "path"]);
    string(x.id);
    string(x.version);
    input(x.path);
  }
  object(c.runtime, ["contract", "projects", "startupGroups", "telemetry"]);
  input(c.runtime.contract);
  const tm = c.runtime.telemetry;
  object(tm, [
    "endpoint",
    "protocol",
    "tracesExporter",
    "metricsExporter",
    "logsExporter",
    "batchDelayMs",
    "waitMs",
  ]);
  localURL(tm.endpoint);
  for (const k of [
    "protocol",
    "tracesExporter",
    "metricsExporter",
    "logsExporter",
  ])
    string(tm[k]);
  for (const k of ["batchDelayMs", "waitMs"])
    if (!Number.isInteger(tm[k]) || tm[k] < 0)
      fail("CONFIG_INVALID", "Invalid telemetry timing");
  list(c.runtime.projects, false);
  list(c.runtime.startupGroups, false);
  const ids = c.runtime.projects.map((p) => p.id);
  unique(ids);
  const command = (x) => {
    object(x, ["argv", "cwd"]);
    list(x.argv);
    x.argv.forEach(string);
    resolve(root, x.cwd);
  };
  for (const p of c.runtime.projects) {
    object(
      p,
      [
        "id",
        "kind",
        "cwd",
        "setup",
        "start",
        "dependsOn",
        "environment",
        "health",
        "stop",
      ],
      ["testFacilities"],
    );
    if (
      !/^[a-zA-Z0-9_-]+$/.test(p.id) ||
      !["service", "frontend", "fake", "collector"].includes(p.kind)
    )
      fail("CONFIG_INVALID", "Invalid project");
    resolve(root, p.cwd);
    command(p.setup);
    command(p.start);
    unique(p.dependsOn);
    if (p.dependsOn.some((x) => !ids.includes(x)))
      fail("CONFIG_INVALID", "Unknown dependency");
    if (
      !p.environment ||
      typeof p.environment !== "object" ||
      Array.isArray(p.environment)
    )
      fail("CONFIG_INVALID", "Invalid environment");
    for (const v of Object.values(p.environment)) {
      if (typeof v === "string") continue;
      object(v, ["path"]);
      input(v.path);
    }
    object(p.health, ["url", "status", "json", "timeoutMs"]);
    localURL(p.health.url);
    object(p.health.json, ["status"]);
    if (
      p.health.status !== 200 ||
      p.health.json.status !== "ok" ||
      !Number.isInteger(p.health.timeoutMs) ||
      p.health.timeoutMs <= 0
    )
      fail("CONFIG_INVALID", "Invalid health contract");
    object(p.stop, ["signal", "timeoutMs"]);
    if (
      p.stop.signal !== "SIGTERM" ||
      !Number.isInteger(p.stop.timeoutMs) ||
      p.stop.timeoutMs <= 0
    )
      fail("CONFIG_INVALID", "Invalid stop contract");
    if (p.testFacilities) {
      const t = p.testFacilities;
      object(t, ["enable", "reset"], ["clock"]);
      object(t.enable, ["variable", "enabledValue", "disabledValue"]);
      Object.values(t.enable).forEach(string);
      for (const [k, f] of Object.entries({
        reset: t.reset,
        ...(t.clock ? { clock: t.clock } : {}),
      })) {
        object(
          f,
          k === "clock"
            ? [
                "method",
                "path",
                "status",
                "bodyField",
                "initialEnvironmentVariable",
              ]
            : ["method", "path", "status"],
        );
        string(f.method);
        if (
          typeof f.path !== "string" ||
          !f.path.startsWith("/") ||
          f.path.startsWith("//") ||
          f.path.includes("\\") ||
          !Number.isInteger(f.status)
        )
          fail("CONFIG_INVALID", "Invalid test facility");
        if (k === "clock") {
          string(f.bodyField);
          string(f.initialEnvironmentVariable);
        }
      }
    }
  }
  const groups = c.runtime.startupGroups;
  groups.forEach((g) => list(g));
  const members = groups.flat();
  unique(members);
  if (members.length !== ids.length || members.some((x) => !ids.includes(x)))
    fail(
      "CONFIG_INVALID",
      "Startup groups must contain each project exactly once",
    );
  const outputs = [
    resolve(root, c.testing.results, false),
    resolve(root, c.testing.evidence, false),
  ];
  if (within(outputs[0], outputs[1]) || within(outputs[1], outputs[0]))
    fail("CONFIG_INVALID", "Output collision");
  for (const out of outputs)
    if (
      within(factory, out) ||
      within(out, factory) ||
      within(path.join(root, ".git"), out) ||
      inputs.some((p) => within(p, out) || within(out, p))
    )
      fail("CONFIG_INVALID", "Output overlaps input or factory");
  return { inputs, outputs };
}
export function localURL(s) {
  try {
    const u = new URL(s);
    if (
      u.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
      u.username ||
      u.password
    )
      throw Error();
    return u;
  } catch {
    fail("CONFIG_INVALID", `Expected loopback HTTP URL: ${s}`);
  }
}
export function verifyTrust(root, c, configPath, trustPath, outputs) {
  // Never approve a lexical alias or reuse a destination after a link was retargeted.
  // This check runs before output creation, runtime startup, and suite execution.
  const destinations = [
    resolve(root, c.testing.results, false),
    resolve(root, c.testing.evidence, false),
  ];
  if (destinations.some((destination, i) => destination !== outputs[i]))
    fail("CONFIG_INVALID", "Output destination changed during validation");
  outputs = destinations;
  const t = json(trustPath, "TRUST_INVALID");
  try {
    object(t, [
      "schemaVersion",
      "applicationId",
      "repository",
      "factory",
      "configSha256",
      "requiredSuites",
      "requiredEvidence",
      "protectedPaths",
      "protectedManifestSha256",
    ]);
    list(t.requiredSuites);
    unique(t.requiredSuites);
    list(t.requiredEvidence);
    unique(t.requiredEvidence);
    list(t.protectedPaths);
    t.requiredSuites.forEach(string);
  } catch (e) {
    fail("TRUST_INVALID", e.message);
  }
  if (
    t.schemaVersion !== 1 ||
    t.applicationId !== c.application.id ||
    t.repository !== c.application.repository ||
    ["repository", "revision", "interfaceVersion"].some(
      (k) => t.factory?.[k] !== c.factory[k],
    ) ||
    t.configSha256 !== hash(fs.readFileSync(configPath))
  )
    fail("TRUST_INVALID", "Unreviewed config or factory binding");
  const manifest = resolve(root, c.trust.manifest);
  if (hash(fs.readFileSync(manifest)) !== t.protectedManifestSha256)
    fail("TRUST_INVALID", "Manifest hash mismatch");
  const paths = json(resolve(root, c.trust.protectedPaths), "TRUST_INVALID");
  if (
    JSON.stringify(paths.protected) !== JSON.stringify(t.protectedPaths) ||
    !Array.isArray(paths.ignored)
  )
    fail("TRUST_INVALID", "Protected path binding mismatch");
  const expected = new Map();
  for (const l of fs
    .readFileSync(manifest, "utf8")
    .split("\n")
    .filter(Boolean)) {
    const m = l.match(/^([a-f0-9]{64})  (.+)$/);
    if (!m || expected.has(m[2])) fail("TRUST_INVALID", "Malformed manifest");
    expected.set(m[2], m[1]);
  }
  const ignored = (r) =>
    paths.ignored.some((i) =>
      i.endsWith("/")
        ? r.split("/").includes(i.slice(0, -1))
        : r === i || r.endsWith("/" + i),
    );
  const actual = new Set();
  const walk = (rel) => {
    if (ignored(rel)) return;
    const p = resolve(root, rel);
    const st = fs.lstatSync(path.resolve(root, rel));
    if (st.isSymbolicLink())
      fail("TRUST_INVALID", "Protected symlink unsupported");
    if (st.isDirectory())
      for (const n of fs.readdirSync(p)) walk(rel.replace(/\/$/, "") + "/" + n);
    else actual.add(rel);
  };
  for (const r of t.protectedPaths) {
    const p = resolve(root, r);
    for (const out of outputs)
      if (within(p, out) || within(out, p))
        fail("CONFIG_INVALID", "Output overlaps protected paths");
    walk(r.replace(/\/$/, ""));
  }
  if (
    actual.size !== expected.size ||
    [...actual].some(
      (r) => expected.get(r) !== hash(fs.readFileSync(resolve(root, r))),
    )
  )
    fail("TRUST_INVALID", "Protected membership/content mismatch");
  for (const r of [
    path.relative(root, configPath),
    c.testing.policy,
    c.trust.protectedPaths,
    c.trust.configuration,
  ])
    if (!actual.has(r))
      fail("TRUST_INVALID", `Unprotected authority input: ${r}`);
  const policy = json(resolve(root, c.testing.policy), "TRUST_INVALID");
  if (
    policy.runtimeOwnership !== undefined &&
    !["factory", "suite"].includes(policy.runtimeOwnership)
  )
    fail("TRUST_INVALID", "Invalid runtime ownership");
  if (
    !Array.isArray(policy.tiers?.full?.suites) ||
    t.requiredSuites.some(
      (id) => !policy.tiers.full.suites.includes(id) || !policy.suites?.[id],
    )
  )
    fail("TRUST_INVALID", "Required suite missing");
  for (const id of t.requiredSuites) {
    const s = policy.suites[id];
    string(s.cmd);
    list(s.args, false);
    s.args.forEach(string);
  }
  for (const r of t.requiredEvidence) {
    const p = resolve(root, r, false);
    if (
      !outputs.some((o) => within(o, p)) ||
      (within(resolve(root, c.testing.evidence, false), p) &&
        path.basename(p) === "consumer-evidence.v1.json")
    )
      fail("TRUST_INVALID", "Invalid evidence destination");
  }
  return { trust: t, policy, policySha256: hash(fs.readFileSync(trustPath)) };
}
