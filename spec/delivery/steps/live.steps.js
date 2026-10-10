// Live tier: reads GitHub settings and deployed images. CI only (A-13); needs GH_TOKEN
// with read access. Read-only: `gh api` GETs and `gh attestation verify`, nothing else.
import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import * as repo from "./support/repo.js";

const none = (rule, items) => assert.deepEqual(items, [], `${rule}: ${items.join("; ")}`);
const AI_PREDICATE = "https://github.com/dgaspard/ai-sdlc-specc-bdd-design/ai-provenance/v1";

function gh(args) {
  try {
    return execFileSync("gh", args, { cwd: repo.ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("tooling: gh is not installed");
    throw new Error(`gh ${args.join(" ")} failed: ${error.stderr || error.message}`);
  }
}
const api = (path) => JSON.parse(gh(["api", "--method", "GET", path]));

function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: repo.ROOT, encoding: "utf8" }).trim();
  const m = /github\.com[:/](.+?)(\.git)?$/.exec(url);
  assert.ok(m, `cannot find the GitHub repository from origin ${url}`);
  return m[1];
}

Given("the GitHub repository under test", function () {
  this.slug = repoSlug();
});

const branchRules = (world, branch) => (world.rules ??= api(`repos/${world.slug}/rules/branches/${branch}`));

Then("the rules for branch {string} require a pull request with code-owner review", function (branch) {
  // Rules from several rulesets combine, so any one of them may require code-owner review.
  const prRules = branchRules(this, branch).filter((r) => r.type === "pull_request");
  assert.ok(prRules.length > 0, `CTL-024: no ruleset requires a pull request on ${branch}`);
  assert.ok(prRules.some((r) => r.parameters?.require_code_owner_review === true), `CTL-024: ${branch} does not require code-owner review`);
});

Then("the rules for branch {string} require every check named in the root of trust", function (branch) {
  const contexts = branchRules(this, branch)
    .filter((r) => r.type === "required_status_checks")
    .flatMap((r) => r.parameters?.required_status_checks ?? [])
    .map((c) => c.context);
  none(`CTL-024 ${branch} does not require`, repo.rootOfTrust.requiredChecks.filter((c) => !contexts.includes(c)));
});

function reviewersRule(world, env) {
  if (!world.environment) {
    try {
      world.environment = api(`repos/${world.slug}/environments/${env}`);
    } catch (error) {
      if (/HTTP 404/.test(error.message)) assert.fail(`CTL-025: GitHub environment ${env} does not exist`);
      throw error;
    }
  }
  return world.environment.protection_rules?.find((r) => r.type === "required_reviewers");
}

Then("the GitHub environment {string} requires at least one reviewer", function (env) {
  const rule = reviewersRule(this, env);
  assert.ok(rule && (rule.reviewers ?? []).length > 0, `CTL-025: environment ${env} has no required reviewers`);
});

const agents = () => repo.rootOfTrust.agentIdentities ?? [];

Then("at least one agent identity is listed in the root of trust", function () {
  assert.ok(agents().length > 0, "CTL-025: root-of-trust.json lists no agentIdentities");
});

Then("no agent identity is a reviewer for the GitHub environment {string}", function (env) {
  const reviewers = (reviewersRule(this, env)?.reviewers ?? []).map((r) => r.reviewer?.login ?? r.reviewer?.slug);
  none(`CTL-025 agent identity can approve ${env}`, agents().filter((a) => reviewers.includes(a)));
});

Then("no agent identity has admin permission on the repository", function () {
  const bad = agents().filter((a) => api(`repos/${this.slug}/collaborators/${a}/permission`).permission === "admin");
  none("CTL-025 agent identity is an admin and can bypass rules", bad);
});

// An App is never a collaborator, so the admin check above can't catch it; a ruleset can
// still list the App (actor_type Integration) as a bypass actor.
Then("no ruleset for branch {string} lets an agent identity bypass it", function (branch) {
  const appId = repo.rootOfTrust.agentApp?.id;
  const rulesetIds = [...new Set(branchRules(this, branch).map((r) => r.ruleset_id))];
  const bad = rulesetIds.flatMap((id) =>
    (api(`repos/${this.slug}/rulesets/${id}`).bypass_actors ?? [])
      .filter((a) => a.actor_type === "Integration" && a.actor_id === appId)
      .map((a) => `ruleset ${id} lets App ${a.actor_id} bypass (${a.bypass_mode})`),
  );
  none(`CTL-025 agent can bypass ${branch}`, bad);
});

// Otherwise a branch the agent pushed could run a prod deployment job.
Then("the GitHub environment {string} accepts deployments only from protected branches", function (env) {
  reviewersRule(this, env);
  assert.equal(
    this.environment.deployment_branch_policy?.protected_branches,
    true,
    `CTL-025: environment ${env} accepts deployments from any branch`,
  );
});

// DC-008: `infra/deploy prod` records what it deployed.
Given("the images recorded by the last prod deployment", function () {
  const rel = "infra/out/prod/deployed-images.json";
  assert.ok(repo.exists(rel), `DC-008: ${rel} is missing`);
  this.images = JSON.parse(repo.read(rel));
  assert.ok(Array.isArray(this.images) && this.images.length > 0, `DC-008: ${rel} lists no images`);
  none("DC-008 image not pinned by digest", this.images.filter((i) => !/@sha256:[0-9a-f]{64}$/.test(i.image ?? "")).map((i) => i.project));
});

const verify = (slug, image, extra) =>
  spawnSync("gh", ["attestation", "verify", `oci://${image}`, "--repo", slug, ...extra], { cwd: repo.ROOT, encoding: "utf8" });

Then("every image has a verified build provenance attestation from this repository", function () {
  none("CTL-026 build provenance not verified", this.images.filter((i) => verify(this.slug, i.image, []).status !== 0).map((i) => i.project));
});

Then("every image has a verified AI provenance attestation from this repository", function () {
  const bad = this.images.filter((i) => verify(this.slug, i.image, ["--predicate-type", AI_PREDICATE]).status !== 0);
  none("CTL-026 AI provenance not verified", bad.map((i) => i.project));
});
