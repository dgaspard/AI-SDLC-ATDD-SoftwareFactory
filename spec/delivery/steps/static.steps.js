// Static tier: reads Dockerfiles, compose.yaml and workflow files. No network, no
// credentials, runs in the agent's local loop. Every "every X" step first proves at
// least one X exists, so an empty repository is red, never vacuously green.
import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as repo from "./support/repo.js";

const none = (rule, items) => assert.deepEqual(items, [], `${rule}: ${items.join("; ")}`);

// ---------------------------------------------------------------------------
// Images (DC-001)
// ---------------------------------------------------------------------------
Given("the runnable projects in this repository", function () {
  this.projects = repo.runnableProjects();
  assert.ok(this.projects.length > 0, "no runnable projects found (services/<name>/start or frontend/start)");
});

Then("each project has a Dockerfile in its folder", function () {
  none("DC-001 missing Dockerfile", this.projects.filter((p) => !repo.exists(`${p.dir}/Dockerfile`)).map((p) => p.dir));
});

Given("the Dockerfile of each runnable project", function () {
  const projects = repo.runnableProjects();
  assert.ok(projects.length > 0, "no runnable projects found");
  none("DC-001 missing Dockerfile", projects.filter((p) => !repo.exists(`${p.dir}/Dockerfile`)).map((p) => p.dir));
  this.dockerfiles = projects.map((p) => ({ project: p, instructions: repo.parseDockerfile(`${p.dir}/Dockerfile`) }));
});

Then("the final stage of each Dockerfile sets a non-root USER", function () {
  const bad = this.dockerfiles.filter(({ instructions }) => {
    const lastFrom = instructions.map((i) => i.cmd).lastIndexOf("FROM");
    const users = instructions.slice(lastFrom + 1).filter((i) => i.cmd === "USER");
    const user = users.at(-1)?.args.split(":")[0];
    return !user || user === "root" || user === "0";
  });
  none("CTL-002 final stage runs as root", bad.map((d) => `${d.project.dir}/Dockerfile`));
});

Then("every external base image is pinned by sha256 digest", function () {
  const bad = [];
  for (const { project, instructions } of this.dockerfiles) {
    const stages = new Set();
    for (const i of instructions.filter((x) => x.cmd === "FROM")) {
      const tokens = i.args.split(/\s+/).filter((t) => !t.startsWith("--"));
      const [image, as, alias] = tokens;
      const external = image !== "scratch" && !stages.has(image);
      if (as?.toUpperCase() === "AS" && alias) stages.add(alias);
      if (external && !/@sha256:[0-9a-f]{64}$/.test(image)) bad.push(`${project.dir}: FROM ${image}`);
    }
  }
  none("CTL-003 base image not pinned by digest", bad);
});

Then("no Dockerfile instruction mentions PETCLINIC_TEST_ENDPOINTS", function () {
  const bad = this.dockerfiles
    .filter(({ instructions }) => instructions.some((i) => i.args.includes("PETCLINIC_TEST_ENDPOINTS")))
    .map((d) => d.project.dir);
  none("CTL-004 image configures test endpoints", bad);
});

// ---------------------------------------------------------------------------
// Compose (DC-005)
// ---------------------------------------------------------------------------
Given("the Compose file at the repository root", function () {
  this.compose = repo.composeFile();
  assert.ok(this.compose, "DC-005: compose.yaml is missing at the repository root");
  this.composeServices = this.compose.services ?? {};
  this.projects = repo.runnableProjects();
});

Then("it defines a service for each runnable project", function () {
  none("DC-005 compose service missing", this.projects.filter((p) => !this.composeServices[p.name]).map((p) => p.name));
});

Then("it defines the {string} and {string} services", function (a, b) {
  none("DC-005 compose service missing", [a, b].filter((s) => !this.composeServices[s]));
});

Then("each runnable project's service is built from that project's Dockerfile", function () {
  const bad = this.projects.filter((p) => {
    const build = this.composeServices[p.name]?.build;
    if (!build) return true;
    const context = typeof build === "string" ? build : build.context ?? ".";
    const dockerfile = typeof build === "string" ? "Dockerfile" : build.dockerfile ?? "Dockerfile";
    return path.normalize(path.join(context, dockerfile)) !== path.normalize(`${p.dir}/Dockerfile`);
  });
  none("DC-005 service not built from its project's Dockerfile", bad.map((p) => p.name));
});

Then("each backend service has PETCLINIC_TEST_ENDPOINTS set to {string}", function (value) {
  const bad = this.projects
    .filter((p) => p.backend)
    .filter((p) => repo.envValue(this.composeServices[p.name]?.environment, "PETCLINIC_TEST_ENDPOINTS") !== value)
    .map((p) => p.name);
  none(`CTL-005 test endpoints not "${value}" locally`, bad);
});

// ---------------------------------------------------------------------------
// Workflows (DC-006)
// ---------------------------------------------------------------------------
Given("every GitHub Actions workflow in the repository", function () {
  this.workflows = repo.workflows();
  assert.ok(this.workflows.length > 0, "no workflows in .github/workflows");
});

Given("the delivery workflows", function () {
  this.workflows = repo.workflows().filter(repo.isDeliveryWorkflow);
  assert.ok(this.workflows.length > 0, "DC-006: no .github/workflows/delivery-*.yml workflows exist");
});

Given("the root-of-trust workflow {string}", function (file) {
  this.workflow = repo.workflows().find((wf) => wf.file === file);
  assert.ok(this.workflow, `root-of-trust workflow .github/workflows/${file} is missing`);
});

Then("each workflow declares top-level permissions", function () {
  none("CTL-010 no top-level permissions", this.workflows.filter((wf) => wf.doc.permissions === undefined).map((wf) => wf.file));
});

Then("no workflow or job grants {string}", function (grant) {
  const bad = [
    ...this.workflows.filter((wf) => wf.doc.permissions === grant).map((wf) => wf.file),
    ...repo.jobs(this.workflows).filter((j) => j.job.permissions === grant).map((j) => j.label),
  ];
  none(`CTL-010 grants ${grant}`, bad);
});

Then("top-level permissions grant no write scope", function () {
  const bad = this.workflows.filter((wf) => {
    const p = wf.doc.permissions;
    return typeof p === "object" && p !== null && Object.values(p).includes("write");
  });
  none("CTL-010 top-level write scope", bad.map((wf) => wf.file));
});

Then("every external action reference is pinned to a 40-character commit SHA", function () {
  const refs = repo.jobs(this.workflows).flatMap((j) => [
    ...(j.job.uses ? [{ label: j.label, uses: j.job.uses }] : []),
    ...j.steps.filter((s) => s.uses).map((s) => ({ label: j.label, uses: s.uses })),
  ]);
  const bad = refs
    .filter(({ uses }) => !uses.startsWith("./"))
    .filter(({ uses }) => (uses.startsWith("docker://") ? !/@sha256:[0-9a-f]{64}$/.test(uses) : !/@[0-9a-f]{40}$/.test(uses)))
    .map(({ label, uses }) => `${label} uses ${uses}`);
  none("CTL-011 unpinned action", bad);
});

Then("no workflow mentions AWS access keys or secret keys", function () {
  const pattern = /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|aws-access-key-id|aws-secret-access-key/;
  none("CTL-012 stored AWS keys", this.workflows.filter((wf) => pattern.test(wf.text)).map((wf) => wf.file));
});

const awsJobs = (wfs) =>
  repo.jobs(wfs).filter((j) => j.steps.some((s) => repo.actionName(s) === "aws-actions/configure-aws-credentials"));

Then("at least one job configures AWS credentials", function () {
  assert.ok(awsJobs(this.workflows).length > 0, "CTL-012: no delivery job configures AWS credentials");
});

const grant = (text) => text.split(":").map((s) => s.trim());

Then("every job that configures AWS credentials assumes a role with {string}", function (needed) {
  const [scope, level] = grant(needed);
  const bad = awsJobs(this.workflows).filter((j) => {
    const step = j.steps.find((s) => repo.actionName(s) === "aws-actions/configure-aws-credentials");
    return !step.with?.["role-to-assume"] || repo.permission(j.wf, j.job, scope) !== level;
  });
  none(`CTL-012 AWS credentials without an OIDC role and ${needed}`, bad.map((j) => j.label));
});

Then("delivery runs each portable security scan:", function (table) {
  const scripts = table.hashes().map((r) => r.script);
  this.scanSteps = [];
  const missing = [];
  for (const script of scripts) {
    const hits = repo.jobs(this.workflows).flatMap((j) =>
      j.steps.filter((s) => (repo.effectiveRun(s)).includes(script)).map((step) => ({ ...j, step, script })),
    );
    if (hits.length === 0) missing.push(script);
    this.scanSteps.push(...hits);
  }
  this.scanScripts = scripts;
  none("CTL-013 scan not run by a delivery workflow", missing);
});

Then("those scan steps set SECURITY_GATE to {string}", function (value) {
  const bad = this.scanSteps.filter((s) => {
    const v = s.step.env?.SECURITY_GATE ?? s.job.env?.SECURITY_GATE ?? s.wf.doc.env?.SECURITY_GATE;
    return v !== value;
  });
  none(`CTL-013 SECURITY_GATE is not "${value}"`, bad.map((s) => `${s.label} (${s.script})`));
});

Then("no scan step or its job can continue on error", function () {
  const bad = this.scanSteps.filter(
    (s) => s.step["continue-on-error"] === true || s.job["continue-on-error"] === true || /\|\|\s*true/.test(repo.effectiveRun(s.step)),
  );
  none("CTL-013 scan failure is swallowed", bad.map((s) => `${s.label} (${s.script})`));
});

Then("each portable scan script reads SECURITY_GATE", function () {
  const bad = this.scanScripts.filter((s) => {
    const rel = `tools/security/portable/${s}`;
    return !repo.exists(rel) || !repo.read(rel).includes("SECURITY_GATE");
  });
  none("CTL-013 scan script ignores SECURITY_GATE", bad);
});

const imageJobs = (wfs) => repo.jobs(wfs).filter((j) => j.steps.some(repo.buildsImage));

Then("at least one job builds a container image", function () {
  assert.ok(imageJobs(this.workflows).length > 0, "no delivery job builds a container image");
});

Then("every job that builds a container image also generates an SBOM with Syft", function () {
  const bad = imageJobs(this.workflows).filter(
    (j) => !j.steps.some((s) => repo.actionName(s) === "anchore/sbom-action" || /\bsyft\b/.test(repo.effectiveRun(s))),
  );
  none("CTL-014 image built without an SBOM", bad.map((j) => j.label));
});

Then("every job that builds a container image uses {string}", function (action) {
  const bad = imageJobs(this.workflows).filter((j) => !j.steps.some((s) => repo.actionName(s) === action));
  none(`CTL-020 image built without ${action}`, bad.map((j) => j.label));
});

Then("every job that builds a container image is granted {string} and {string}", function (a, b) {
  const bad = imageJobs(this.workflows).filter((j) =>
    [a, b].some((needed) => {
      const [scope, level] = grant(needed);
      return repo.permission(j.wf, j.job, scope) !== level;
    }),
  );
  none(`CTL-020 image job lacks ${a} and ${b}`, bad.map((j) => j.label));
});

Then("every job that builds a container image attests with predicate type {string}", function (type) {
  const bad = imageJobs(this.workflows).filter(
    (j) => !j.steps.some((s) => repo.actionName(s) === "actions/attest" && s.with?.["predicate-type"] === type),
  );
  none("CTL-021 image built without an AI provenance attestation", bad.map((j) => j.label));
});

Then("it runs on every pull request and on every push to main", function () {
  const on = repo.triggers(this.workflow.doc);
  assert.ok("pull_request" in on, "CTL-022: root of trust does not run on pull_request");
  const branches = on.push?.branches;
  assert.ok("push" in on && (!branches || branches.includes("main")), "CTL-022: root of trust does not run on push to main");
});

Then("it runs the guard check and the delivery suite", function () {
  const runs = repo.jobs([this.workflow]).flatMap((j) => j.steps.map((s) => repo.effectiveRun(s)));
  assert.ok(runs.some((r) => r.includes("guard:check")), "CTL-022: root of trust does not run guard:check");
  assert.ok(runs.some((r) => r.includes("spec/delivery")), "CTL-022: root of trust does not run the spec/delivery suite");
});

Then("it has a job named for each required check in the root of trust", function () {
  const names = repo.jobs([this.workflow]).map((j) => j.job.name ?? j.id);
  none("CTL-022 required check has no job in the root of trust", repo.rootOfTrust.requiredChecks.filter((c) => !names.includes(c)));
});

Then("no delivery workflow is part of the root of trust", function () {
  const pattern = new RegExp(repo.rootOfTrust.deliveryWorkflowPattern);
  none("CTL-022 delivery workflow in the root of trust", repo.rootOfTrust.paths.filter((p) => pattern.test(path.basename(p))));
});

const deployJobs = (wfs, env) =>
  repo.jobs(wfs).filter((j) => j.steps.some((s) => new RegExp(`infra/deploy\\s+${env}\\b`).test(repo.effectiveRun(s))));

Then("at least one job deploys to {string}", function (env) {
  assert.ok(deployJobs(this.workflows, env).length > 0, `DC-003: no delivery job runs "infra/deploy ${env}"`);
});

Then("every job that deploys to {string} runs in the GitHub environment {string}", function (env, ghEnv) {
  const bad = deployJobs(this.workflows, env).filter((j) => (j.job.environment?.name ?? j.job.environment) !== ghEnv);
  none(`CTL-023 ${env} deploy outside the "${ghEnv}" environment`, bad.map((j) => j.label));
});

Then("every job that deploys to {string} verifies both attestations before it deploys", function (env) {
  const bad = deployJobs(this.workflows, env).filter((j) => {
    const deployAt = j.steps.findIndex((s) => new RegExp(`infra/deploy\\s+${env}\\b`).test(repo.effectiveRun(s)));
    const before = j.steps.slice(0, deployAt).map((s) => repo.effectiveRun(s)).join("\n");
    const verifies = before.match(/gh attestation verify/g) ?? [];
    return verifies.length < 2 || !before.includes("ai-provenance/v1");
  });
  none(`CTL-023 ${env} deploy without verifying build and AI provenance`, bad.map((j) => j.label));
});

const always = (cond) => /\balways\(\)/.test(String(cond ?? ""));

Then("every job that deploys to {string} is followed by {string} that runs even if tests fail", function (env, command) {
  const bad = deployJobs(this.workflows, env).filter((j) => {
    const deployAt = j.steps.findIndex((s) => new RegExp(`infra/deploy\\s+${env}\\b`).test(repo.effectiveRun(s)));
    const laterStep = j.steps.slice(deployAt + 1).some((s) => always(s.if) && (repo.effectiveRun(s)).includes(command));
    const laterJob = repo.jobs([j.wf]).some(
      (k) => [k.job.needs ?? []].flat().includes(j.id) && always(k.job.if) && k.steps.some((s) => (repo.effectiveRun(s)).includes(command)),
    );
    return !laterStep && !laterJob;
  });
  none(`CTL-043 ${env} deploy without an always() "${command}"`, bad.map((j) => j.label));
});

// Minute field "*" or "*/N"; GitHub runs schedules at most every 5 minutes, best effort.
const everyMinutes = (cron) => {
  const minute = String(cron).trim().split(/\s+/)[0];
  if (minute === "*") return 1;
  const m = /^\*\/(\d+)$/.exec(minute);
  return m ? Number(m[1]) : Infinity;
};

Then("a scheduled delivery workflow runs {string} at least every {int} minutes", function (command, limit) {
  const ok = this.workflows.some((wf) => {
    const schedule = repo.triggers(wf.doc).schedule ?? [];
    const frequent = schedule.some((s) => everyMinutes(s.cron) <= limit);
    return frequent && repo.jobs([wf]).some((j) => j.steps.some((s) => (repo.effectiveRun(s)).includes(command)));
  });
  assert.ok(ok, `CTL-043: no delivery workflow runs ${command} on a schedule of every ${limit} minutes or less`);
});

// ---------------------------------------------------------------------------
// SPEC-09: thin workflows (A-21), continuous delivery (A-22), release record (A-23)
// ---------------------------------------------------------------------------
const workflowsDeploying = (wfs, env) => wfs.filter((wf) => deployJobs([wf], env).length > 0);

Then("every workflow that deploys to {string} runs on pull requests and never on {string}", function (env, forbidden) {
  const bad = workflowsDeploying(this.workflows, env).filter((wf) => {
    const on = repo.triggers(wf.doc);
    return !("pull_request" in on) || forbidden in on;
  });
  none(`CTL-015 ${env} deploy not triggered by same-repository pull requests`, bad.map((wf) => wf.file));
});

Then("every workflow that deploys to {string} runs only on push to {string}", function (env, branch) {
  const bad = workflowsDeploying(this.workflows, env).filter((wf) => {
    const on = repo.triggers(wf.doc);
    const branches = on.push?.branches;
    return Object.keys(on).join() !== "push" || !Array.isArray(branches) || branches.join() !== branch;
  });
  none(`CTL-015 ${env} deploy triggered by something other than push to ${branch}`, bad.map((wf) => wf.file));
});

Then("every run step is a single call to a delivery script with plain arguments", function () {
  const bad = repo.jobs(this.workflows).flatMap((j) =>
    j.steps.filter((s) => s.run !== undefined && !repo.THIN_RUN.test(String(s.run).trim())).map((s) => `${j.label}: ${String(s.run).trim().split("\n")[0]}`),
  );
  none("CTL-027 run step is not a single delivery-script call (DC-009)", bad);
});

Then("every delivery script a run step calls exists and is executable", function () {
  const scripts = new Set(repo.jobs(this.workflows).flatMap((j) => j.steps.filter((s) => s.run).map((s) => String(s.run).trim().split(/\s+/)[0])));
  const bad = [...scripts].filter((rel) => {
    if (!repo.exists(rel)) return true;
    const stat = fs.statSync(repo.abs(rel));
    return !stat.isFile() || (stat.mode & 0o111) === 0;
  });
  none("CTL-027 missing or non-executable delivery script", bad);
});

const beforeDeploy = (j, env) => {
  const at = j.steps.findIndex((s) => new RegExp(`infra/deploy\\s+${env}\\b`).test(repo.effectiveRun(s)));
  return { before: j.steps.slice(0, at), after: j.steps.slice(at + 1) };
};

Then("every job that deploys to {string} compares the attested tree with main's tree before it deploys", function (env) {
  const bad = deployJobs(this.workflows, env).filter((j) => !beforeDeploy(j, env).before.some((s) => /\^\{tree\}/.test(repo.effectiveRun(s))));
  none(`CTL-023 ${env} deploy without a tree-hash comparison`, bad.map((j) => j.label));
});

Then("every job that deploys to {string} checks who merged the change before it deploys", function (env) {
  const bad = deployJobs(this.workflows, env).filter((j) => !beforeDeploy(j, env).before.some((s) => /merged_?by/i.test(repo.effectiveRun(s))));
  none(`CTL-023 ${env} deploy without checking who merged`, bad.map((j) => j.label));
});

Then("every job that deploys to {string} writes the release record with {string} after it deploys", function (env, script) {
  const bad = deployJobs(this.workflows, env).filter((j) => !beforeDeploy(j, env).after.some((s) => String(s.run ?? "").trim().startsWith(script)));
  none(`CTL-060 ${env} deploy without ${script}`, bad.map((j) => j.label));
});

Then("every job that deploys to {string} publishes the release record as a GitHub Release", function (env) {
  const bad = deployJobs(this.workflows, env).filter((j) => !beforeDeploy(j, env).after.some((s) => /gh release create/.test(repo.effectiveRun(s))));
  none(`CTL-060 ${env} deploy without a GitHub Release`, bad.map((j) => j.label));
});

Then("every job that deploys to {string} attests the release record with predicate type {string}", function (env, type) {
  const bad = deployJobs(this.workflows, env).filter(
    (j) => !beforeDeploy(j, env).after.some((s) => repo.actionName(s) === "actions/attest" && s.with?.["predicate-type"] === type),
  );
  none(`CTL-060 ${env} release record not attested`, bad.map((j) => j.label));
});
