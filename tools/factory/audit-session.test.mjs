// Explicit Docker conformance components; never substitute for live model proof.
import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {runAuditSession,checkAuditSession} from './audit-session.mjs';
const docker=process.env.FACTORY_DOCKER,image=process.env.FACTORY_AUDIT_IMAGE;
if(!docker||!image)throw new Error('Explicit Docker and pinned audit image required');
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'factory-audit-tests-'));console.error('Retained records: '+root);
const run=(name,code,settings)=>runAuditSession({docker,image,argv:['node','-e',code],directory:path.join(root,name)},settings);
test('successful neutral process yields collection only after shutdown',async()=>{
 const r=await run('neutral',"console.log('ok')");assert.equal(r.phase,'AUDIT_COLLECTED');assert.equal(r.cleanupConfirmed,true);assert.equal(r.realRunnerQualified,false);
});
for(const target of ['/inputs/protected.txt','/inputs/symlink.txt','/inputs/hardlink.txt','/audit/trace','/audit/receipt.json'])test('suppressed write denial: '+target,async()=>{
 const r=await run('denied-'+target.split('/').at(-1),`try{require('fs').writeFileSync(${JSON.stringify(target)},'bad')}catch{};console.log('success')`);
 assert.equal(r.exitCode,0);assert.equal(r.phase,'PERMISSION_DENIED');assert.ok(r.analysis.denials.some(x=>x.record.includes(target)));assert.equal(r.cleanupConfirmed,true);
});
test('failed process cannot become collected success',async()=>{
 const r=await run('nonzero','process.exit(17)');assert.equal(r.phase,'FAILED');assert.equal(r.exitCode,17);assert.equal(r.cleanupConfirmed,true);
});
test('interruption retains terminal failure and confirms cleanup',async()=>{
 await assert.rejects(run('interrupt','setInterval(()=>{},100)',{signal:AbortSignal.abort()}));
 const j=JSON.parse(fs.readFileSync(path.join(root,'interrupt/container-journal.json')));assert.equal(j.phase,'INTERRUPTED');assert.equal(j.cleanupConfirmed,true);
});
test('runner has no host credential environment or network route',async()=>{
 const r=await run('secrets-network',`const fs=require('fs');const net=require('net');if(!/^CapEff:\\s+0+$/m.test(fs.readFileSync('/proc/self/status','utf8')))process.exit(34);if(Object.keys(process.env).some(k=>/AWS|TOKEN|SECRET|SSH_AUTH_SOCK/.test(k)))process.exit(31);if(fs.existsSync('/var/run/docker.sock'))process.exit(32);const s=net.connect({host:'192.0.2.1',port:443});s.on('connect',()=>process.exit(33));s.on('error',()=>process.exit(0));setTimeout(()=>{s.destroy();process.exit(0)},200);`);
 assert.equal(r.exitCode,0);assert.equal(r.phase,'AUDIT_COLLECTED');
});

test('unmounted original path mutation is retained despite missing-parent errno',async()=>{
 const r=await run('missing-parent',"try{require('fs').writeFileSync('/original/missing/file','bad')}catch{}");assert.equal(r.phase,'AUDIT_UNRESOLVED');assert.ok(r.analysis.mutationFailures.some(x=>x.errno==='ENOENT'));
});

test('subsequent audit artifact edit invalidates retained collection',async()=>{
 const r=await run('stale',"console.log('ok')"),directory=path.dirname(r.journal);
 assert.equal(checkAuditSession({docker,directory}).phase,'AUDIT_COLLECTED');
 fs.appendFileSync(path.join(directory,'audit/stdout'),'later edit');
 assert.throws(()=>checkAuditSession({docker,directory}),/Stale audit artifacts/);
});
