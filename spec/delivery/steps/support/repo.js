// Reads the repository under test. Portable: knows only the delivery contract (DC-xxx),
// never petclinic internals, so the package can be lifted into another repository.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ROOT =
  process.env.DELIVERY_REPO_ROOT ??
  execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: PKG, encoding: "utf8" }).trim();

export const abs = (rel) => path.join(ROOT, rel);
export const exists = (rel) => fs.existsSync(abs(rel));
export const read = (rel) => fs.readFileSync(abs(rel), "utf8");
export const rootOfTrust = JSON.parse(fs.readFileSync(path.join(PKG, "root-of-trust.json"), "utf8"));

// DC-001: services/<name>/ with a start script, plus frontend/.
export function runnableProjects() {
  const services = fs.existsSync(abs("services"))
    ? fs.readdirSync(abs("services"), { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(abs(`services/${d.name}/start`)))
        .map((d) => ({ name: d.name, dir: `services/${d.name}`, backend: true }))
    : [];
  const frontend = exists("frontend/start") ? [{ name: "frontend", dir: "frontend", backend: false }] : [];
  return [...services, ...frontend];
}

// Dockerfile instructions with line continuations joined and comments removed.
export function parseDockerfile(rel) {
  const lines = read(rel).split(/\r?\n/).filter((l) => !/^\s*#/.test(l));
  const joined = lines.join("\n").replace(/\\\r?\n/g, " ");
  return joined
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [cmd, ...rest] = l.split(/\s+/);
      return { cmd: cmd.toUpperCase(), args: rest.join(" ") };
    });
}

export function workflows() {
  const dir = abs(".github/workflows");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((file) => {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      return { file, text, doc: YAML.parse(text) ?? {} };
    });
}

export const isDeliveryWorkflow = (wf) => new RegExp(rootOfTrust.deliveryWorkflowPattern).test(wf.file);

export function jobs(wfs) {
  return wfs.flatMap((wf) =>
    Object.entries(wf.doc.jobs ?? {}).map(([id, job]) => ({ wf, id, job, steps: job.steps ?? [], label: `${wf.file}#${id}` })),
  );
}

export const actionName = (step) => (step.uses ?? "").split("@")[0];

// Effective permission for one scope, job-level overriding workflow-level.
export function permission(wf, job, scope) {
  const perms = job.permissions ?? wf.doc.permissions;
  if (perms === "write-all") return "write";
  if (perms === "read-all") return "read";
  return perms?.[scope] ?? "none";
}

// A-21 thin workflows: a step's `run:` is one call to a delivery script (DC-009). What
// the step does is that line plus the scripts it calls, so checks read both.
export const THIN_RUN = /^(?:scripts\/ci|infra)\/[\w.-]+(?: [\w./:=@-]+)*$/;
const invokedScripts = (run) => [...run.matchAll(/(?:^|\s)((?:scripts\/ci|infra)\/[\w.-]+)/g)].map((m) => m[1]);
export function effectiveRun(step) {
  const run = step.run ?? "";
  const bodies = invokedScripts(run).filter((rel) => exists(rel) && fs.statSync(abs(rel)).isFile()).map(read);
  return [run, ...bodies].join("\n");
}

export const buildsImage = (step) =>
  actionName(step) === "docker/build-push-action" || /\bdocker\s+(buildx\s+)?build\b/.test(effectiveRun(step));

export function triggers(doc) {
  const on = doc.on ?? doc[true]; // YAML 1.1 parsers turn `on` into true
  if (typeof on === "string") return { [on]: {} };
  if (Array.isArray(on)) return Object.fromEntries(on.map((t) => [t, {}]));
  return on ?? {};
}

// DC-005. Compose honors YAML merge keys (`<<: *anchor`), so the spec must read them the
// same way; without `merge: true` a shared environment block looks like a literal "<<" key.
export const composeFile = () => (exists("compose.yaml") ? YAML.parse(read("compose.yaml"), { merge: true }) ?? {} : null);

export function envValue(environment, key) {
  if (!environment) return undefined;
  if (Array.isArray(environment)) {
    const hit = environment.find((e) => String(e).split("=")[0] === key);
    return hit === undefined ? undefined : String(hit).slice(key.length + 1);
  }
  return environment[key] === undefined ? undefined : String(environment[key]);
}
