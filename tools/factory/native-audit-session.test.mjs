// Explicit native platform conformance. Never imported into portable tests.
import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {runNativeAuditSession,checkNativeAuditSession} from './native-audit-session.mjs';
const docker=process.env.FACTORY_DOCKER,image=process.env.FACTORY_NATIVE_IMAGE,fault=process.env.FACTORY_NATIVE_FAULT_IMAGE;
if(!docker||!image||!fault)throw Error('Explicit Docker, native image and record-loss image required');
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'factory-native-cases-'));console.error('Retained records: '+root);
const run=(name,argv,selected=image)=>runNativeAuditSession({docker,image:selected,argv,directory:path.join(root,name)});
const journal=name=>JSON.parse(fs.readFileSync(path.join(root,name,'container-journal.json')));
const lines=file=>fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
function protectedUnchanged(name){const output=path.join(root,name,'protected-after.txt');execFileSync(docker,['cp',journal(name).containerId+':/inputs/protected.txt',output],{maxBuffer:1048576});assert.equal(fs.readFileSync(output,'utf8'),'frozen');}
test('SCT-001 actual immutable CLI neutral roundtrip',async()=>{
 const r=await run('cli',['node','/opt/protocol/broker-codex-probe.mjs','--codex','/opt/guarded-codex','--external-container-probe']);
 assert.equal(r.exitCode,0);assert.equal(r.phase,'AUDIT_COLLECTED');assert.equal(r.proof.coverageClosed,true);assert.equal(r.cleanupConfirmed,true);
 const report=lines(path.join(root,'cli/audit/stdout')).find(x=>x.report?.protocolPassed!==undefined)?.report;
 assert.equal(report?.protocolPassed,true);assert.equal(report.executableSha256,'eebed6295184525f04147bc86e025e6ff66397215002ae9aa1e44de460ad56ac');
});
for(const [id,name,count] of [['SCT-002','alias',2],['SCT-003','cwd-dirfd',2],['SCT-004','relative',1],['SCT-005','missing',1],['SCT-006','race',1]])test(id+' '+name,async()=>{
 const r=await run(name,['/opt/factory/syscall-observer-cases',name]);assert.equal(r.exitCode,6);assert.equal(r.receipt.workloadExitCode,0);assert.ok(r.receipt.denials>=count);assert.equal(r.proof.coverageClosed,true);assert.equal(r.cleanupConfirmed,true);assert.notEqual(r.phase,'AUDIT_COLLECTED');
 assert.match(fs.readFileSync(path.join(root,name,'audit/stdout'),'utf8'),/SCT_WORKLOAD_ASSERTIONS_PASSED/);protectedUnchanged(name);
 const identities=lines(path.join(root,name,'audit/native-identities.jsonl')),denied=identities.filter(x=>x.disposition===0);assert.ok(denied.length>=count);
 if(name==='cwd-dirfd')assert.ok(denied.every(x=>x.baseMount>0&&x.baseInode>0));
 if(name==='missing')assert.ok(denied.some(x=>x.missingComponents>=2));
 if(name==='race'){const trace=lines(path.join(root,name,'audit/native-trace.jsonl'));assert.ok(trace.some(x=>x.event==='bound-start'&&x.stopped.length>1));}
});
test('SCT-007 omitted observer record blocks successful workload',async()=>{
 await assert.rejects(run('missing-record',['/bin/true'],fault),/Missing native records/);
 const j=journal('missing-record');assert.equal(j.cleanupConfirmed,true);assert.notEqual(j.phase,'AUDIT_COLLECTED');
 const receipt=JSON.parse(fs.readFileSync(path.join(root,'missing-record/audit/native-receipt.json')));assert.equal(receipt.workloadExitCode,0);
});
test('SCT-008 observer death with active descendant writers',async()=>{
 const result=run('interrupted',['/opt/factory/syscall-observer-cases','interrupt']).then(value=>({value}),error=>({error}));
 const deadline=Date.now()+20000;let ready=false,j;
 while(Date.now()<deadline){
  try{j=journal('interrupted');execFileSync(docker,['exec',j.containerId,'/bin/sh','-c','grep -q READY /audit/stdout && grep -q child-writer /audit/stdout'],{stdio:'pipe',timeout:1000});ready=true;break;}catch{}
  await new Promise(r=>setTimeout(r,25));
 }
 assert.equal(ready,true,'deterministic workload readiness');
 execFileSync(docker,['exec',j.containerId,'/bin/sh','-c','kill -KILL "$(cat /audit/observer.pid)"'],{stdio:'pipe',timeout:1000});
 const outcome=await result;assert.ok(outcome.error||outcome.value.phase!=='AUDIT_COLLECTED');j=journal('interrupted');assert.equal(j.cleanupConfirmed,true);assert.notEqual(j.phase,'AUDIT_COLLECTED');
 const state=JSON.parse(execFileSync(docker,['inspect',j.containerId],{encoding:'utf8'}))[0].State;assert.equal(state.Running,false);assert.equal(state.Pid,0);
 const before=execFileSync(docker,['cp',j.containerId+':/audit/stdout','-']);
 const after=execFileSync(docker,['cp',j.containerId+':/audit/stdout','-']);assert.deepEqual(after,before);
});
test('subsequent artifact edit invalidates native collection',async()=>{
 const r=await run('stale',['/bin/true']);assert.equal(r.phase,'AUDIT_COLLECTED');const directory=path.dirname(r.journal);
 assert.equal(checkNativeAuditSession({docker,directory}).phase,'AUDIT_COLLECTED');fs.appendFileSync(path.join(directory,'audit/stdout'),'later');assert.throws(()=>checkNativeAuditSession({docker,directory}),/Stale native artifacts/);
});
