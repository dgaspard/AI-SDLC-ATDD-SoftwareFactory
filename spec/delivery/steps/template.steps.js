// Template tier: asserts against synthesized CloudFormation, never the code that made
// it (A-18). Offline; runs in the agent's local loop.
import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import path from "node:path";
import YAML from "yaml";
import fs from "node:fs";
import * as repo from "./support/repo.js";
import * as tpl from "./support/templates.js";

const none = (rule, items) => assert.deepEqual(items, [], `${rule}: ${items.join("; ")}`);
const backendNames = () => repo.runnableProjects().filter((p) => p.backend).map((p) => p.name);
const catalog = () => YAML.parse(fs.readFileSync(path.join(repo.PKG, "catalog.yaml"), "utf8"));

Given("the CloudFormation templates synthesized for {string} and {string}", function (a, b) {
  this.templates = { [a]: tpl.load(a), [b]: tpl.load(b) };
});

Given("the CloudFormation templates synthesized for {string}", function (env) {
  this.templates = { [env]: tpl.load(env) };
});

const all = (world) => Object.values(world.templates).flat();
const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

Then("every template passes the {string} policy", function (policy) {
  const { ok, output } = tpl.cfnGuard(path.join(repo.PKG, "policy", `${policy}.guard`), all(this).map((t) => t.file));
  assert.ok(ok, `policy ${policy} failed:\n${output}`);
});

Then("no container in the {string} templates sets PETCLINIC_TEST_ENDPOINTS to {string}", function (env, value) {
  const bad = tpl.containers(this.templates[env])
    .filter((c) => (c.Environment ?? []).some((e) => e.Name === "PETCLINIC_TEST_ENDPOINTS" && e.Value === value))
    .map((c) => c.Name);
  none(`CTL-033 ${env} container enables test endpoints`, bad);
});

Then("every backend container in the {string} templates sets PETCLINIC_TEST_ENDPOINTS to {string}", function (env, value) {
  const found = tpl.containers(this.templates[env]);
  const bad = backendNames().filter((name) => {
    const c = found.find((x) => x.Name === name);
    return !c || !(c.Environment ?? []).some((e) => e.Name === "PETCLINIC_TEST_ENDPOINTS" && e.Value === value);
  });
  none(`CTL-033 ${env} backend container (DC-004 name) without test endpoints "${value}"`, bad);
});

Then("no container receives AUTH_TOKEN_SECRET as a plain environment variable", function () {
  const bad = tpl.containers(all(this))
    .filter((c) => (c.Environment ?? []).some((e) => e.Name === "AUTH_TOKEN_SECRET"))
    .map((c) => `${c.template.env}:${c.Name}`);
  none("CTL-034 plain-text AUTH_TOKEN_SECRET", bad);
});

Then("every backend container receives AUTH_TOKEN_SECRET from AWS Secrets Manager", function () {
  const templates = all(this);
  const secretIds = new Set(tpl.resources(templates, "AWS::SecretsManager::Secret").map((r) => r.id));
  const fromSecretsManager = (valueFrom) =>
    (valueFrom?.Ref && secretIds.has(valueFrom.Ref)) || JSON.stringify(valueFrom ?? "").includes("secretsmanager");
  const bad = [];
  for (const env of Object.keys(this.templates)) {
    const found = tpl.containers(this.templates[env]);
    for (const name of backendNames()) {
      const c = found.find((x) => x.Name === name);
      const secret = c?.Secrets?.find((s) => s.Name === "AUTH_TOKEN_SECRET");
      if (!secret || !fromSecretsManager(secret.ValueFrom)) bad.push(`${env}:${name}`);
    }
  }
  none("CTL-034 AUTH_TOKEN_SECRET not from Secrets Manager", bad);
});

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------
Then("no template contains a resource of type {string}", function (type) {
  none(`CTL-040 forbidden ${type}`, tpl.resources(all(this), type).map((r) => `${r.template.env}:${r.id}`));
});

Then("an org template defines a monthly cost budget of {int} USD", function (amount) {
  this.budgets = tpl.resources(all(this), "AWS::Budgets::Budget").filter((b) => {
    const budget = b.Properties?.Budget ?? {};
    return (
      budget.BudgetType === "COST" &&
      budget.TimeUnit === "MONTHLY" &&
      Number(budget.BudgetLimit?.Amount) === amount &&
      budget.BudgetLimit?.Unit === "USD"
    );
  });
  assert.ok(this.budgets.length > 0, `CTL-041: no monthly ${amount} USD cost budget in the org templates`);
});

const notifies = (budgets, type, threshold) =>
  budgets.some((b) =>
    (b.Properties?.NotificationsWithSubscribers ?? []).some(
      (n) =>
        n.Notification?.NotificationType === type &&
        n.Notification?.ComparisonOperator === "GREATER_THAN" &&
        Number(n.Notification?.Threshold) === threshold &&
        (n.Notification?.ThresholdType ?? "PERCENTAGE") === "PERCENTAGE" &&
        (n.Subscribers ?? []).length > 0,
    ),
  );

Then("the budget notifies a subscriber at {int} percent of forecasted spend", function (pct) {
  assert.ok(notifies(this.budgets, "FORECASTED", pct), `CTL-041: no ${pct}% forecasted-spend notification`);
});

Then("the budget notifies a subscriber at {int} percent of actual spend", function (pct) {
  assert.ok(notifies(this.budgets, "ACTUAL", pct), `CTL-041: no ${pct}% actual-spend notification`);
});

Then("every resource of these types carries the {string} tag:", function (key, table) {
  const types = table.hashes().map((r) => r.type);
  const matched = types.flatMap((t) => tpl.resources(all(this), t));
  assert.ok(matched.length > 0, `CTL-042: none of ${types.join(", ")} found in the templates`);
  const hasTag = (r) => {
    const tags = r.Properties?.Tags;
    return Array.isArray(tags) ? tags.some((t) => t.Key === key) : tags && key in tags;
  };
  none(`CTL-042 missing ${key} tag`, matched.filter((r) => !hasTag(r)).map((r) => `${r.template.env}:${r.id} (${r.Type})`));
});

Then("every {string} tag is a whole number of minutes within the catalog limit for its environment", function (key) {
  const limits = catalog().ttl_minutes ?? {};
  const bad = [];
  for (const r of tpl.resources(all(this))) {
    const tags = r.Properties?.Tags;
    const value = Array.isArray(tags) ? tags.find((t) => t.Key === key)?.Value : tags?.[key];
    if (value === undefined) continue;
    const limit = limits[r.template.env];
    if (!/^\d+$/.test(String(value)) || !limit || Number(value) > limit || Number(value) === 0) {
      bad.push(`${r.template.env}:${r.id} ${key}=${value} (limit ${limit ?? "none"})`);
    }
  }
  none("CTL-042 TTL outside the catalog limit", bad);
});

// ---------------------------------------------------------------------------
// OIDC trust (CTL-035)
// ---------------------------------------------------------------------------
const GITHUB_OIDC = "token.actions.githubusercontent.com";
function githubRoles(templates) {
  return tpl.resources(templates, "AWS::IAM::Role").flatMap((role) => {
    const statements = list(role.Properties?.AssumeRolePolicyDocument?.Statement);
    const trusting = statements.filter(
      (st) => st.Effect === "Allow" && list(st.Action).includes("sts:AssumeRoleWithWebIdentity") && JSON.stringify(st.Principal ?? "").includes(GITHUB_OIDC),
    );
    return trusting.length ? [{ role, statements: trusting }] : [];
  });
}

Then("at least one IAM role trusts GitHub's OIDC provider", function () {
  assert.ok(githubRoles(all(this)).length > 0, "CTL-035: no IAM role trusts token.actions.githubusercontent.com");
});

Then("every role that trusts GitHub's OIDC provider requires the audience {string}", function (aud) {
  const bad = githubRoles(all(this)).filter(({ statements }) =>
    statements.some((st) => st.Condition?.StringEquals?.[`${GITHUB_OIDC}:aud`] !== aud),
  );
  none(`CTL-035 role without audience ${aud}`, bad.map(({ role }) => `${role.template.env}:${role.id}`));
});

Then("every role that trusts GitHub's OIDC provider accepts only this repository's environment for its template", function () {
  const slug = repo.rootOfTrust.repository;
  const bad = githubRoles(all(this)).filter(({ role, statements }) =>
    statements.some((st) => {
      const want = `repo:${slug}:environment:${role.template.env}`;
      const loose = Object.entries(st.Condition ?? {}).some(([op, keys]) => op !== "StringEquals" && `${GITHUB_OIDC}:sub` in (keys ?? {}));
      return loose || st.Condition?.StringEquals?.[`${GITHUB_OIDC}:sub`] !== want;
    }),
  );
  none(`CTL-035 role not pinned to repo:${slug}:environment:<env>`, bad.map(({ role }) => `${role.template.env}:${role.id}`));
});

// ---------------------------------------------------------------------------
// Organization (SCPs)
// ---------------------------------------------------------------------------
function attachedScpStatements(templates) {
  return tpl.resources(templates, "AWS::Organizations::Policy")
    .filter((p) => p.Properties?.Type === "SERVICE_CONTROL_POLICY" && (p.Properties?.TargetIds ?? []).length > 0)
    .flatMap((p) => {
      const content = typeof p.Properties.Content === "string" ? JSON.parse(p.Properties.Content) : p.Properties.Content;
      const statements = content?.Statement ?? [];
      return (Array.isArray(statements) ? statements : [statements]).map((s) => ({ policy: p.id, ...s }));
    });
}

const matchesAction = (pattern, action) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i").test(action);

Then("an attached SCP denies these actions:", function (table) {
  const denies = attachedScpStatements(all(this)).filter((s) => s.Effect === "Deny" && !s.Condition);
  const bad = table.hashes().map((r) => r.action).filter(
    (action) => !denies.some((s) => list(s.Action).some((p) => matchesAction(p, action))),
  );
  none("SCP does not deny", bad);
});

Then("an attached SCP denies requests outside the catalog region", function () {
  const region = catalog().region;
  const ok = attachedScpStatements(all(this)).some((s) => {
    const requested = s.Condition?.StringNotEquals?.["aws:RequestedRegion"];
    return s.Effect === "Deny" && (s.Action === "*" || s.NotAction) && list(requested).length === 1 && list(requested)[0] === region;
  });
  assert.ok(ok, `CTL-052: no attached SCP denies requests outside ${region}`);
});
