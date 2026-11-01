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
 const deadline=Date.now()+20000;let j;
 while(Date.now()<deadline){try{j=journal('interrupted');if(j.phase==='RUNNING')break;}catch{}await new Promise(r=>setTimeout(r,25));}
 assert.equal(j?.phase,'RUNNING','owned container reached running phase');
 // Keep one trusted root helper alive until shutdown; transient probes can race
 // the independent /proc census and must not satisfy interruption qualification.
 const helper="const fs=require('fs');const end=Date.now()+15000;const poll=setInterval(()=>{let text='';try{text=fs.readFileSync('/audit/stdout','utf8')}catch{}if(text.includes('READY')&&text.includes('child-writer')){clearInterval(poll);process.kill(Number(fs.readFileSync('/audit/observer.pid','utf8')),'SIGKILL');fs.writeSync(1,'OBSERVER_SIGNAL_SENT\\n');setInterval(()=>{},100);}else if(Date.now()>end){fs.writeSync(1,'READINESS_TIMEOUT\\n');clearInterval(poll);setInterval(()=>{},100);}},25);";
 let output='';try{output=execFileSync(docker,['exec','--user','0:0',j.containerId,'node','-e',helper],{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']});}catch(error){output=String(error.stdout??'');}
 assert.match(output,/OBSERVER_SIGNAL_SENT/,'readiness and intended signal independently confirmed');
 const outcome=await result;assert.ok(outcome.error||outcome.value.phase!=='AUDIT_COLLECTED');j=journal('interrupted');assert.equal(j.cleanupConfirmed,true);assert.notEqual(j.phase,'AUDIT_COLLECTED');
 const state=JSON.parse(execFileSync(docker,['inspect',j.containerId],{encoding:'utf8'}))[0].State;assert.equal(state.Running,false);assert.equal(state.Pid,0);
 const before=execFileSync(docker,['cp',j.containerId+':/audit/stdout','-']);
 const after=execFileSync(docker,['cp',j.containerId+':/audit/stdout','-']);assert.deepEqual(after,before);
});
test('subsequent artifact edit invalidates native collection',async()=>{
 const r=await run('stale',['/bin/true']);assert.equal(r.phase,'AUDIT_COLLECTED');const directory=path.dirname(r.journal);
 assert.equal(checkNativeAuditSession({docker,directory}).phase,'AUDIT_COLLECTED');fs.appendFileSync(path.join(directory,'audit/stdout'),'later');assert.throws(()=>checkNativeAuditSession({docker,directory}),/Stale native artifacts/);
});

test('read-only process-group queries preserve kernel results and closed coverage',async()=>{
 const r=await run('process-group-query',['/opt/factory/syscall-observer-cases','process-group-query']);
 assert.equal(r.exitCode,0);assert.equal(r.receipt.denials,0);assert.equal(r.proof.coverageClosed,true);assert.equal(r.cleanupConfirmed,true);
 assert.match(fs.readFileSync(path.join(root,'process-group-query/audit/stdout'),'utf8'),/SCT_WORKLOAD_ASSERTIONS_PASSED/);
 const calls=lines(path.join(root,'process-group-query/audit/native-trace.jsonl')).filter(x=>x.event==='exit-syscall'&&x.nr===155);
 assert.equal(calls.length,3);assert.ok(calls[0].result>0);assert.equal(calls[1].result,calls[0].result);assert.equal(calls[2].result,-3);
});

test('SCT-009 suppressed terminal probes preserve native no-terminal results',async()=>{
 const r=await run('terminal-probe',['/opt/factory/syscall-observer-cases','terminal-probe']);assert.equal(r.exitCode,0);assert.equal(r.receipt.denials,0);assert.equal(r.proof.coverageClosed,true);assert.equal(r.cleanupConfirmed,true);
 const id=lines(path.join(root,'terminal-probe/audit/native-identities.jsonl')).filter(x=>x.kind==='terminal-probe');assert.equal(id.length,2);assert.ok(id.every(x=>x.disposition===4&&x.controllingTerminal===0));
 const trace=lines(path.join(root,'terminal-probe/audit/native-trace.jsonl')).filter(x=>x.event==='bound-exit'&&x.disposition===4);assert.equal(trace.length,2);assert.ok(trace.every(x=>x.result===-6&&x.kernelResult===-38));
});
for(const [name,code] of [['terminal-race',6],['terminal-flags',6],['terminal-targets',6],['terminal-mutation',5],['terminal-unknown',5]])test('SCT-010 '+name+' cannot receive a terminal exception',async()=>{
 const r=await run(name,['/opt/factory/syscall-observer-cases',name]);assert.equal(r.exitCode,code);assert.equal(r.cleanupConfirmed,true);assert.notEqual(r.phase,'AUDIT_COLLECTED');
 const bindings=lines(path.join(root,name,'audit/native-identities.jsonl'));if(name!=='terminal-race')assert.ok(bindings.every(x=>x.disposition!==4));else assert.ok(bindings.some(x=>x.disposition===0));
 if(code===6){assert.equal(r.receipt.workloadExitCode,0);protectedUnchanged(name);}else{const trace=lines(path.join(root,name,'audit/native-trace.jsonl'));const request=name==='terminal-mutation'?'5410':'54ff';const entry=trace.find(x=>x.event==='entry'&&x.nr===29&&x.args[1]===request);assert.ok(entry,'intended ioctl reached observer');assert.ok(trace.some(x=>x.event==='bound-start'&&x.entry===entry.seq));}
});
test('SCT-010 real controlling terminal blocks the no-terminal exception',async()=>{
 const terminal=process.env.FACTORY_NATIVE_TERMINAL_IMAGE;assert.match(terminal??'',/^sha256:[a-f0-9]{64}$/,'real private-PTY fixture image required');
 const r=await run('terminal-present',['/opt/factory/syscall-observer-cases','terminal-present'],terminal);assert.equal(r.exitCode,6);assert.equal(r.receipt.workloadExitCode,0);assert.equal(r.cleanupConfirmed,true);
 const id=lines(path.join(root,'terminal-present/audit/native-identities.jsonl')).filter(x=>x.kind==='terminal-probe');assert.equal(id.length,1);assert.notEqual(id[0].controllingTerminal,0);assert.equal(id[0].disposition,0);
 const trace=lines(path.join(root,'terminal-present/audit/native-trace.jsonl'));assert.ok(trace.some(x=>x.event==='bound-exit'&&x.nr===29&&x.result===0&&x.kernelResult===0));
});

test('namespace-local Node interface discovery has bound route socket evidence',async()=>{
 const r=await run('route-discovery',['node','-e',"const n=require('node:os').networkInterfaces();if(!n.lo?.some(x=>x.address==='127.0.0.1'))process.exit(91);console.log('LOOPBACK_DISCOVERY_PASSED')"]);assert.equal(r.exitCode,0);assert.equal(r.proof.coverageClosed,true);assert.equal(r.cleanupConfirmed,true);
 const records=lines(path.join(root,'route-discovery/audit/native-identities.jsonl')).filter(x=>x.kind==='route-socket');assert.ok(records.some(x=>x.operation==='bind'));assert.ok(records.some(x=>x.operation==='receive'));assert.ok(records.every(x=>x.domain===16&&x.protocol===0&&x.groups===0&&x.netCookie===x.ownerNetCookie));
});
for(const name of ['protocol','groups','port','padding','length','reuse'])test('route socket rejects '+name+' before binding',async()=>{
 const r=await run('route-'+name,['/opt/factory/syscall-observer-cases','route-'+name]);assert.equal(r.exitCode,5);assert.equal(r.cleanupConfirmed,true);const trace=lines(path.join(root,'route-'+name+'/audit/native-trace.jsonl'));assert.ok(trace.some(x=>x.event==='entry'&&x.nr===200));assert.notEqual(r.phase,'AUDIT_COLLECTED');
});
for(const name of ['receive-empty','mutation'])test('route socket preserves kernel '+name+' result',async()=>{
 const r=await run('route-'+name,['/opt/factory/syscall-observer-cases','route-'+name]);assert.equal(r.exitCode,0);assert.equal(r.proof.coverageClosed,true);assert.equal(r.cleanupConfirmed,true);
 const trace=lines(path.join(root,'route-'+name+'/audit/native-trace.jsonl'));if(name==='receive-empty')assert.ok(trace.some(x=>x.event==='bound-exit'&&x.nr===212&&x.result===-11&&x.kernelResult===-11));else assert.match(fs.readFileSync(path.join(root,'route-'+name+'/audit/stdout'),'utf8'),/ROUTE_MUTATION_DENIED_LOOPBACK_UNCHANGED/);
});

test('pipe capacity query preserves native results and buffered bytes',async()=>{
 const r=await run('pipe-query',['/opt/factory/syscall-observer-cases','pipe-query']);assert.equal(r.exitCode,0);assert.equal(r.receipt.denials,0);assert.equal(r.proof.coverageClosed,true);assert.equal(r.cleanupConfirmed,true);
 const trace=lines(path.join(root,'pipe-query/audit/native-trace.jsonl')),results=[];let query=false;for(const e of trace){if(e.event==='entry')query=e.nr===25&&e.args[1]==='408';if(e.event==='exit-syscall'&&query){results.push(e.result);query=false;}}
 assert.equal(results.length,3);assert.ok(results[0]>0);assert.equal(results[1],results[0]);assert.equal(results[2],-9);
 assert.match(fs.readFileSync(path.join(root,'pipe-query/audit/stdout'),'utf8'),/SCT_WORKLOAD_ASSERTIONS_PASSED/);
});
test('pipe resizing remains unsupported and cannot qualify',async()=>{
 const r=await run('pipe-resize',['/opt/factory/syscall-observer-cases','pipe-resize']);assert.equal(r.exitCode,5);assert.equal(r.cleanupConfirmed,true);assert.notEqual(r.phase,'AUDIT_COLLECTED');
 const trace=lines(path.join(root,'pipe-resize/audit/native-trace.jsonl'));const e=trace.find(x=>x.event==='entry'&&x.nr===25&&x.args[1]==='407');assert.ok(e);assert.ok(trace.some(x=>x.event==='bound-start'&&x.entry===e.seq));
});
