// Owner-side test reports are evidence from the pinned trusted harness, never runner claims.
import fs from 'node:fs';
import {digest,need,object,regular} from './change-support.mjs';
export const requiredReports=Object.freeze({
 'task-session.test.mjs':38,
 'model-channel.test.mjs':4,
 'native-audit-session.test.mjs':10,
 'container-session.test.mjs':12,
 'verifier-session.test.mjs':13,
 'real-coordinator.test.mjs':4,
});
export const assertionRosters=Object.freeze({
  "model-channel.test.mjs": [
    "actual pinned CLI updates only granted bytes through external Converse relay",
    "relay loss after readiness prevents a successful task",
    "aborted HTTP upload cannot crash relay or bypass broker validation",
    "root relay attachment rejects substituted container identity"
  ],
  "container-session.test.mjs": [
    "pre-start journal identifies stopped container and success follows confirmed shutdown",
    "nonzero application exit remains failure after cleanup",
    "timeout stops TERM-resistant code before recording a terminal result",
    "interrupt confirms cleanup and never produces COMPLETE",
    "recovery of lost create response discovers container by durable identity and never starts it",
    "recovery stops running work and refuses mismatched ownership",
    "shortcut into forbidden root is rejected before Docker execution",
    "an observed interrupt wins even after a zero exit, and recovery preserves terminal history",
    "killed coordinator leaves a recoverable running container with durable ownership",
    "update-only workspace preserves protected files and denies source create/delete",
    "unsafe or unsupported filesystem grants fail before Docker execution",
    "read-only workspace cannot expose a host socket, including an ungranted path"
  ],
  "task-session.test.mjs": [
    "startup time cannot be excluded to produce successful evidence",
    "task denial survives suppressed audit-mode attempt",
    "task denial survives suppressed protected-symlink-lchown attempt",
    "task denial survives suppressed protected-symlink-lutimes attempt",
    "plain scratch hardlinks preserve inode identity within approved scratch",
    "hardlink of scratch symlink cannot authorize its protected target",
    "task denial survives suppressed protected-create attempt",
    "task denial survives suppressed directory-alias-create attempt",
    "task denial survives suppressed protected-delete attempt",
    "task denial survives suppressed directory-alias-delete attempt",
    "task denial survives suppressed hardlink-delete attempt",
    "task denial survives suppressed hardlink-create-from-protected attempt",
    "task denial survives suppressed hardlink-create-into-protected attempt",
    "task denial survives suppressed symlink-create-into-protected attempt",
    "task denial survives suppressed symlink-delete attempt",
    "task grant updates only approved existing bytes and preserves candidate mode",
    "task grants reject protected aliases and unsupported operations before Docker",
    "failed task leaves partial work inspectable without applying it",
    "descendant protected-write attempts are independently denied",
    "trace escape and inherited descriptors are denied under actual native guard",
    "runner receives no host credentials sockets or external network route",
    "task deadline rejects invalid limits before Docker",
    "observer deadline cannot produce successful task evidence",
    "task denial survives suppressed direct attempt",
    "task denial survives suppressed symlink attempt",
    "task denial survives suppressed hardlink attempt",
    "task denial survives suppressed create attempt",
    "task denial survives suppressed delete attempt",
    "task denial survives suppressed rename attempt",
    "task denial survives suppressed git attempt",
    "task denial survives suppressed policy attempt",
    "task denial survives suppressed approval attempt",
    "task denial survives suppressed mode attempt",
    "task denial survives suppressed audit attempt",
    "task cannot mutate original",
    "task cannot mutate common-git",
    "task cannot mutate factory",
    "task cannot mutate verifier"
  ],
  "verifier-session.test.mjs": [
    "verification writes only outputs; artifacts collected after cleanup",
    "failed acceptance exit survives artifact collection",
    "output shortcut and protected overlap fail before Docker invocation",
    "collection refuses running writer; interrupt is not success",
    "bounded verifier resources enable executable scratch without source writes",
    "invalid verifier resource profile fails before Docker",
    "read-only dependency and trust mounts preserve content and deny writes",
    "read-only dependency shortcuts outside declared tree fail before Docker",
    "symlink evidence is rejected despite verifier zero exit",
    "hardlink evidence is rejected despite verifier zero exit",
    "directory-alias evidence is rejected despite verifier zero exit",
    "consumer envelope valid matches independent binding",
    "consumer envelope invalid rejects after zero exit"
  ],
  "native-audit-session.test.mjs": [
    "read-only process-group queries preserve kernel results and closed coverage",
    "SCT-001 actual immutable CLI neutral roundtrip",
    "SCT-007 omitted observer record blocks successful workload",
    "SCT-008 observer death with active descendant writers",
    "subsequent artifact edit invalidates native collection",
    "SCT-002 alias",
    "SCT-003 cwd-dirfd",
    "SCT-004 relative",
    "SCT-005 missing",
    "SCT-006 race"
  ],
  "real-coordinator.test.mjs": [
    "real coordinator completes neutral actual CLI candidate with independent verification",
    "real coordinator interruption retains recoverable candidate and confirms cleanup",
    "real coordinator propagates independent acceptance failure",
    "real coordinator rejects a subsequent candidate edit"
  ]
});
export const caseAssertions=Object.freeze({
 'actual-cli-update':['model-channel.test.mjs','actual pinned CLI updates only granted bytes through external Converse relay'],
 'protected-operations':['task-session.test.mjs','task denial survives suppressed direct attempt'],
 'aliases':['task-session.test.mjs','task denial survives suppressed symlink attempt'],
 'original-git-factory-verifier':['task-session.test.mjs','task cannot mutate original'],
 'credentials-network':['task-session.test.mjs','runner receives no host credentials sockets or external network route'],
 'trace-escape':['task-session.test.mjs','trace escape and inherited descriptors are denied under actual native guard'],
 'descendant-cleanup':['container-session.test.mjs','timeout stops TERM-resistant code before recording a terminal result'],
 'interruption':['real-coordinator.test.mjs','real coordinator interruption retains recoverable candidate and confirms cleanup'],
 'relay-loss':['model-channel.test.mjs','relay loss after readiness prevents a successful task'],
 'failed-acceptance':['real-coordinator.test.mjs','real coordinator propagates independent acceptance failure'],
 'stale-evidence':['real-coordinator.test.mjs','real coordinator rejects a subsequent candidate edit'],
});
export function validateQualificationReports(q,profileHash){
 need(Array.isArray(q.reports)&&q.reports.length===Object.keys(requiredReports).length,'TOOLING_UNAVAILABLE','Full launcher test reports missing');
 const reports=new Map();
 for(const item of q.reports){
  object(item,['suite','path','sha256']);
  need(Object.hasOwn(requiredReports,item.suite)&&!reports.has(item.suite),'TRUST_INVALID','Unknown or duplicate qualification suite');
  regular(item.path,'TRUST_INVALID');need(digest(item.path)===item.sha256&&q.artifacts.some(a=>a.path===item.path&&a.sha256===item.sha256),'TRUST_INVALID','Unbound qualification report');
  const r=JSON.parse(fs.readFileSync(item.path,'utf8'));
  object(r,['schemaVersion','suite','executionProfileSha256','sourceSha256','exitCode','tests','rawOutput']);
  need(r.schemaVersion===1&&r.suite===item.suite&&r.executionProfileSha256===profileHash&&r.sourceSha256===q.suiteHashes?.[item.suite]&&r.exitCode===0&&Array.isArray(r.tests)&&r.tests.length===requiredReports[item.suite],'TRUST_INVALID','Qualification report identity/count mismatch');
  object(r.rawOutput,['path','sha256']);regular(r.rawOutput.path,'TRUST_INVALID');need(digest(r.rawOutput.path)===r.rawOutput.sha256&&q.artifacts.some(a=>a.path===r.rawOutput.path&&a.sha256===r.rawOutput.sha256),'TRUST_INVALID','Missing or stale raw qualification output');
  const raw=fs.readFileSync(r.rawOutput.path,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  const rawTests=raw.filter(e=>e.type==='test:pass'||e.type==='test:fail').map(e=>({name:e.name,status:e.type==='test:pass'&&!e.skip&&!e.todo?'passed':'failed'}));
  need(JSON.stringify(rawTests)===JSON.stringify(r.tests)&&raw.at(-1)?.type==='test:summary'&&raw.at(-1).success===true,'TRUST_INVALID','Report differs from raw test events');
  const names=new Set();for(const t of r.tests){object(t,['name','status']);need(typeof t.name==='string'&&!names.has(t.name)&&t.status==='passed','TOOLING_UNAVAILABLE','Failed, skipped or duplicate qualification assertion');names.add(t.name);}
  need(assertionRosters[item.suite].length===requiredReports[item.suite]&&assertionRosters[item.suite].every(name=>names.has(name)),'TRUST_INVALID','Qualification assertion roster mismatch');
  reports.set(item.suite,{item,names});
 }
 need(Array.isArray(q.cases)&&q.cases.length===Object.keys(caseAssertions).length,'TOOLING_UNAVAILABLE','Qualification case coverage missing');
 const seen=new Set();for(const c of q.cases){
  object(c,['id','reportSha256','assertion']);const expected=caseAssertions[c.id];
  need(expected&&!seen.has(c.id),'TRUST_INVALID','Unknown or duplicate qualification case');seen.add(c.id);
  const r=reports.get(expected[0]);need(c.reportSha256===r.item.sha256&&c.assertion===expected[1]&&r.names.has(c.assertion),'TRUST_INVALID','Case is not linked to its required behavioral assertion');
 }
 return {suites:reports.size,cases:seen.size};
}
