#!/usr/bin/env node
// Repository-scoped GitHub App authentication. Never falls back to personal tokens.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const slug = 'dgaspard/ai-sdlc-specc-bdd-design';
const expectedApp = 5265528;
const env = { ...parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8')), ...process.env };
const [command, ...args] = process.argv.slice(2);
if (!['check', 'gh', 'git'].includes(command)) {
  console.error('Usage: node tools/github/agent.mjs check | gh <args> | git <args>');
  process.exit(2);
}
let token;
async function api(endpoint, auth, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${auth}`, Accept: 'application/vnd.github+json', 'User-Agent': 'petclinic-agent', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${endpoint}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
try {
  if (Number(env.GITHUB_APP_ID) !== expectedApp || !env.GITHUB_CLIENT_ID || !env.GITHUB_APP_PRIVATE_KEY_PATH) throw new Error('Missing or incorrect GitHub App configuration');
  const key = fs.readFileSync(env.GITHUB_APP_PRIVATE_KEY_PATH);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: env.GITHUB_CLIENT_ID, iat: now - 60, exp: now + 540 })}`;
  const jwt = `${payload}.${sign('RSA-SHA256', Buffer.from(payload), key).toString('base64url')}`;
  const app = await api('/app', jwt);
  const installation = await api(`/repos/${slug}/installation`, jwt);
  if (app.id !== expectedApp || installation.app_id !== expectedApp || String(installation.id) !== env.GITHUB_INSTALLATION_ID) throw new Error('App or installation identity mismatch');
  const allowed = { contents: 'write', pull_requests: 'write', metadata: 'read' };
  for (const [permission, access] of Object.entries(installation.permissions)) {
    if (!(permission in allowed) || !['read', allowed[permission]].includes(access)) throw new Error(`Unexpected installation permission: ${permission}`);
  }
  const issued = await api(`/app/installations/${installation.id}/access_tokens`, jwt, 'POST', {
    repositories: [slug.split('/')[1]], permissions: allowed,
  });
  token = issued.token;
  const repositories = await api('/installation/repositories', token);
  if (repositories.total_count !== 1 || repositories.repositories[0].full_name !== slug) throw new Error('Token repository scope mismatch');
  if (command === 'check') {
    console.log(JSON.stringify({ app: app.slug, appId: app.id, installationId: installation.id, repository: slug, permissions: issued.permissions, expiresAt: issued.expires_at }, null, 2));
  } else {
    const childEnv = { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' };
    delete childEnv.GH_DEBUG;
    delete childEnv.GIT_TRACE;
    delete childEnv.GIT_TRACE_CURL;
    delete childEnv.GIT_CURL_VERBOSE;
    const invocation = command === 'git' ? ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', ...args] : args;
    const child = spawnSync(command, invocation, { cwd: root, env: childEnv, stdio: 'inherit' });
    process.exitCode = child.status ?? 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (token) {
    try { await api('/installation/token', token, 'DELETE'); }
    catch { console.error('Could not revoke temporary installation token; it will expire automatically.'); process.exitCode = 1; }
  }
}
