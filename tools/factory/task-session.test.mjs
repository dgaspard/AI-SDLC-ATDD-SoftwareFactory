// Explicit credential-free Linux arm64 enforcement, not a live-agent demonstration.
import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {runTaskSession,validateUpdateTask} from './task-session.mjs';
const docker=process.env.FACTORY_DOCKER,image=process.env.FACTORY_NATIVE_IMAGE;
if(!docker||!image)throw Error('Explicit Docker and native image required');
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'factory-task-grants-'));console.error('Retained records: '+root);
function fixture(name){const workspace=path.join(root,name+'-candidate');fs.mkdirSync(workspace);for(const dir of ['source','spec','.git','.github'])fs.mkdirSync(path.join(workspace,dir));
 for(const p of ['source/allowed.js','source/other.js','spec/requirements','spec/tests','spec/policy','.git/config','.github/workflow','AGENTS.md'])fs.writeFileSync(path.join(workspace,p),'before',{mode:0o644});
 fs.symlinkSync('../spec/tests',path.join(workspace,'source/alias'));fs.symlinkSync('../spec',path.join(workspace,'source/spec-dir'));fs.symlinkSync('/tmp/metadata-target',path.join(workspace,'source/to-scratch'));fs.linkSync(path.join(workspace,'spec/tests'),path.join(workspace,'source/hardlink'));
 return {docker,image,workspace,permissions:{create:[],update:['source/allowed.js'],delete:[]},protectedPaths:['spec/'],directory:path.join(root,name),argv:['node','-e','']};}
test('task grant updates only approved existing bytes and preserves candidate mode',async()=>{
 const f=fixture('positive');f.argv[2]="require('fs').writeFileSync('/workspace/source/allowed.js','approved')";const r=await runTaskSession(f);assert.equal(r.exitCode,0);assert.equal(r.phase,'AUDIT_COLLECTED');assert.equal(r.cleanupConfirmed,true);assert.equal(r.changes.length,1);assert.equal(fs.readFileSync(path.join(f.workspace,'source/allowed.js'),'utf8'),'approved');assert.equal(fs.statSync(path.join(f.workspace,'source/allowed.js')).mode&0o777,0o644);
 const bindings=fs.readFileSync(path.join(f.directory,'execution/audit/native-identities.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.ok(bindings.some(r=>r.grant===true&&r.disposition===1));
});
for(const [name,code] of [
 ['direct',"fs.writeFileSync('/workspace/spec/tests','bad')"],
 ['symlink',"fs.writeFileSync('/workspace/source/alias','bad')"],
 ['hardlink',"fs.writeFileSync('/workspace/source/hardlink','bad')"],
 ['create',"fs.writeFileSync('/workspace/source/new.js','bad')"],
 ['delete',"fs.unlinkSync('/workspace/source/allowed.js')"],
 ['rename',"fs.renameSync('/workspace/source/allowed.js','/workspace/source/other.js')"],
 ['git',"fs.writeFileSync('/workspace/.git/config','bad')"],
 ['policy',"fs.writeFileSync('/workspace/spec/policy','bad')"],
 ['approval',"fs.writeFileSync('/workspace/AGENTS.md','bad')"],
 ['mode',"fs.chmodSync('/workspace/source/allowed.js',0o777)"],
 ['audit',"fs.writeFileSync('/audit/native-receipt.json','bad')"],
 ['audit-mode',"fs.fchmodSync(1,0o777)"],
 ['protected-symlink-lchown',"fs.writeFileSync('/tmp/metadata-target','safe');fs.lchownSync('/workspace/source/to-scratch',65534,65534)"],
 ['protected-symlink-lutimes',"fs.writeFileSync('/tmp/metadata-target','safe');fs.lutimesSync('/workspace/source/to-scratch',1,1)"],
 ['protected-create',"fs.writeFileSync('/workspace/spec/new','bad',{flag:'wx'})"],
 ['directory-alias-create',"fs.writeFileSync('/workspace/source/spec-dir/new','bad',{flag:'wx'})"],
 ['protected-delete',"fs.unlinkSync('/workspace/spec/tests')"],
 ['directory-alias-delete',"fs.unlinkSync('/workspace/source/spec-dir/tests')"],
 ['hardlink-delete',"fs.unlinkSync('/workspace/source/hardlink')"],
 ['hardlink-create-from-protected',"fs.linkSync('/workspace/spec/tests','/tmp/protected-copy')"],
 ['hardlink-create-into-protected',"fs.writeFileSync('/tmp/public','safe');fs.linkSync('/tmp/public','/workspace/source/spec-dir/new')"],
 ['symlink-create-into-protected',"fs.symlinkSync('/tmp/public','/workspace/spec/new')"],
 ['symlink-delete',"fs.unlinkSync('/workspace/source/alias')"],
])test('task denial survives suppressed '+name+' attempt',async()=>{
 const f=fixture(name);f.argv[2]=`const fs=require('fs');const protectedInode=fs.statSync('/workspace/spec/tests'),aliasInode=fs.statSync('/workspace/source/hardlink');if(protectedInode.ino!==aliasInode.ino||protectedInode.dev!==aliasInode.dev||aliasInode.nlink!==2)process.exit(91);if(fs.realpathSync('/workspace/source/spec-dir')!=='/workspace/spec')process.exit(92);console.log(JSON.stringify({protectedInode:protectedInode.ino,protectedSymlinkInode:fs.lstatSync('/workspace/source/to-scratch').ino}));fs.writeFileSync('/workspace/source/allowed.js','partial');try{${code}}catch{};console.log('claimed success')`;
 const r=await runTaskSession(f);assert.equal(r.exitCode,6);assert.equal(r.receipt.workloadExitCode,0);assert.equal(r.cleanupConfirmed,true);assert.ok(r.receipt.denials>0);assert.equal(fs.readFileSync(path.join(f.workspace,'source/allowed.js'),'utf8'),'before');assert.equal(fs.readFileSync(path.join(f.workspace,'spec/tests'),'utf8'),'before');assert.equal(fs.readFileSync(path.join(f.directory,'input/source/allowed.js'),'utf8'),'partial');
 const stage=path.join(f.directory,'input'),a=fs.statSync(path.join(stage,'spec/tests')),b=fs.statSync(path.join(stage,'source/hardlink'));assert.equal(a.ino,b.ino);assert.equal(a.nlink,2);assert.equal(fs.readFileSync(path.join(stage,'spec/tests'),'utf8'),'before');assert.deepEqual(fs.readdirSync(path.join(stage,'spec')).sort(),['policy','requirements','tests']);assert.equal(fs.lstatSync(path.join(stage,'source/alias')).isSymbolicLink(),true);
 const audit=path.join(f.directory,'execution/audit'),identities=fs.readFileSync(path.join(audit,'native-identities.jsonl'),'utf8').trim().split('\n').map(JSON.parse),trace=fs.readFileSync(path.join(audit,'native-trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.ok(trace.some(x=>x.event==='bound-exit'&&x.denied&&identities.some(i=>i.entry===x.entry&&i.disposition===0)));
 if(name==='hardlink'||name==='hardlink-create-from-protected'){
  const inode=JSON.parse(fs.readFileSync(path.join(audit,'stdout'),'utf8').split('\n').find(line=>line.startsWith('{'))).protectedInode;
  assert.ok(identities.some(i=>i.inode===inode&&i.disposition===0&&trace.some(t=>t.event==='bound-exit'&&t.entry===i.entry&&t.denied&&t.nr===(name==='hardlink'?56:37))),'real protected inode is bound to the denied operation');
 }
 if(name.startsWith('protected-symlink-')){const inode=JSON.parse(fs.readFileSync(path.join(audit,'stdout'),'utf8').split('\n').find(line=>line.startsWith('{'))).protectedSymlinkInode;assert.ok(identities.some(i=>i.inode===inode&&i.disposition===0&&trace.some(t=>t.event==='bound-exit'&&t.entry===i.entry&&t.denied&&t.nr===(name.endsWith('lchown')?54:88))));assert.equal(fs.readlinkSync(path.join(stage,'source/to-scratch')),'/tmp/metadata-target');}
 if(name.includes('delete'))assert.ok(trace.some(t=>t.event==='bound-exit'&&t.nr===35&&t.denied));

});
test('task grants reject protected aliases and unsupported operations before Docker',()=>{
 const f=fixture('preflight');f.docker='/not/a/docker';
 for(const p of ['spec/tests','.git/config','AGENTS.md','source/alias','source/hardlink','../outside'])assert.throws(()=>validateUpdateTask({...f,permissions:{create:[],update:[p],delete:[]}}),/grant/);
 assert.throws(()=>validateUpdateTask({...f,permissions:{create:['source/new.js'],update:[],delete:[]}}),/unavailable/);
 const alias=path.join(root,'destination-alias');fs.symlinkSync(path.join(f.workspace,'spec'),alias);assert.throws(()=>validateUpdateTask({...f,directory:path.join(alias,'output')}),/overlaps/);assert.equal(fs.existsSync(f.directory),false);
});
test('failed task leaves partial work inspectable without applying it',async()=>{
 const f=fixture('failed');f.argv[2]="require('fs').writeFileSync('/workspace/source/allowed.js','partial');process.exit(17)";
 const r=await runTaskSession(f);assert.equal(r.exitCode,10);assert.equal(r.receipt.workloadExitCode,17);assert.equal(r.changes.length,1);assert.equal(fs.readFileSync(path.join(f.workspace,'source/allowed.js'),'utf8'),'before');
});

for(const [name,target] of [['original','/original/checkout/source.js'],['common-git','/original/common.git/config'],['factory','/opt/factory/syscall-guard'],['verifier','/verifier/spec/test.js']])test('task cannot mutate '+name,async()=>{
 const f=fixture('boundary-'+name);f.argv[2]=`try{require('fs').writeFileSync(${JSON.stringify(target)},'bad')}catch{}`;
 const r=await runTaskSession(f);assert.equal(r.exitCode,6);assert.equal(r.receipt.workloadExitCode,0);assert.equal(r.cleanupConfirmed,true);
});
test('descendant protected-write attempts are independently denied',async()=>{
 const f=fixture('descendant');f.argv[2]=`require('child_process').spawnSync(process.execPath,['-e',"try{require('fs').writeFileSync('/workspace/spec/tests','bad')}catch{}"]);`;
 const r=await runTaskSession(f);assert.equal(r.exitCode,6);assert.equal(r.receipt.workloadExitCode,0);assert.equal(r.proof.coverageClosed,true);
});
test('trace escape and inherited descriptors are denied under actual native guard',async()=>{
 const f=fixture('trace-escape');f.argv=['/opt/guard-check','inherit','container'];const r=await runTaskSession(f);assert.equal(r.exitCode,6);assert.equal(r.receipt.workloadExitCode,0);assert.ok(r.receipt.denials>=17);assert.match(fs.readFileSync(path.join(f.directory,'execution/audit/stdout'),'utf8'),/CONTAINER_GUARD_CHECK_PASS/);
});
test('runner receives no host credentials sockets or external network route',async()=>{
 const f=fixture('credentials-network');f.argv[2]=`const fs=require('fs'),net=require('net');if(Object.keys(process.env).some(k=>/^(AWS_|SSH_AUTH_SOCK$|GITHUB_|GH_TOKEN$|PAT$|FACTORY_HOST_CANARY$)/.test(k))||fs.existsSync('/var/run/docker.sock')||fs.existsSync('/root/.aws/credentials'))process.exit(91);const s=net.connect({host:'192.0.2.1',port:443});s.on('connect',()=>process.exit(92));s.on('error',()=>process.exit(0));setTimeout(()=>{s.destroy();process.exit(0)},100);`;
 process.env.FACTORY_HOST_CANARY='synthetic-canary';try{const r=await runTaskSession(f);assert.equal(r.exitCode,0);assert.equal(r.cleanupConfirmed,true);}finally{delete process.env.FACTORY_HOST_CANARY;}
});

test('task deadline rejects invalid limits before Docker',async()=>{
 const f=fixture('invalid-deadline');f.docker='/not/a/docker';for(const timeoutMs of [0,-1,1800001,NaN,1.5])await assert.rejects(runTaskSession(f,{timeoutMs}),/bounded task deadline/);assert.equal(fs.existsSync(f.directory),false);
});
test('observer deadline cannot produce successful task evidence',async()=>{
 const f=fixture('observer-deadline');f.argv=['node','-e','setInterval(()=>{},100)'];await assert.rejects(runTaskSession(f,{timeoutMs:1200}));const j=JSON.parse(fs.readFileSync(path.join(f.directory,'execution/container-journal.json')));assert.equal(j.cleanupConfirmed,true);assert.notEqual(j.phase,'AUDIT_COLLECTED');assert.equal(fs.readFileSync(path.join(f.workspace,'source/allowed.js'),'utf8'),'before');
});

test('startup time cannot be excluded to produce successful evidence',async()=>{
 const f=fixture('startup-deadline');f.argv=['/bin/true'];await assert.rejects(runTaskSession(f,{timeoutMs:1500,afterStart:async()=>new Promise(r=>setTimeout(r,1600))}),/deadline expired/);const j=JSON.parse(fs.readFileSync(path.join(f.directory,'execution/container-journal.json')));assert.equal(j.cleanupConfirmed,true);assert.notEqual(j.phase,'AUDIT_COLLECTED');assert.equal(fs.readFileSync(path.join(f.workspace,'source/allowed.js'),'utf8'),'before');
});

test('plain scratch hardlinks preserve inode identity within approved scratch',async()=>{
 const f=fixture('scratch-hardlink');f.argv[2]="const fs=require('fs');fs.writeFileSync('/tmp/a','safe');fs.linkSync('/tmp/a','/tmp/b');const a=fs.statSync('/tmp/a'),b=fs.statSync('/tmp/b');if(a.ino!==b.ino||a.nlink!==2)process.exit(91)";const r=await runTaskSession(f);assert.equal(r.exitCode,0);assert.equal(r.proof.coverageClosed,true);assert.equal(r.cleanupConfirmed,true);
});
test('hardlink of scratch symlink cannot authorize its protected target',async()=>{
 const f=fixture('hardlink-of-symlink');f.argv[2]="const fs=require('fs');fs.symlinkSync('/workspace/spec/tests','/tmp/a');fs.linkSync('/tmp/a','/tmp/b');const a=fs.lstatSync('/tmp/a'),b=fs.lstatSync('/tmp/b');if(!a.isSymbolicLink()||a.ino!==b.ino||a.nlink!==2)process.exit(91);try{fs.writeFileSync('/tmp/b','bad')}catch{}";const r=await runTaskSession(f);assert.equal(r.exitCode,6);assert.equal(r.receipt.workloadExitCode,0);assert.equal(r.proof.coverageClosed,true);assert.equal(fs.readFileSync(path.join(f.directory,'input/spec/tests'),'utf8'),'before');
 const trace=fs.readFileSync(path.join(f.directory,'execution/audit/native-trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.ok(trace.some(t=>t.event==='bound-exit'&&t.nr===37&&t.disposition===1));assert.ok(trace.some(t=>t.event==='bound-exit'&&t.nr===56&&t.denied));
});
