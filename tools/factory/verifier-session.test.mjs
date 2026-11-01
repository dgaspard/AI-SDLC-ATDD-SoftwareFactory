// Explicit Docker integration checks. No model, credentials or application edits.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runVerifierSession,collectVerifierArtifacts} from './verifier-session.mjs';
import {prepareSession,startSession,finishSession} from './container-session.mjs';
const docker=process.env.FACTORY_DOCKER,image=process.env.FACTORY_COMPONENT_IMAGE;
if(!docker||!image)throw new Error('Explicit Docker and immutable component image required');
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'factory-verifier-integration-'));
console.error('Retained verifier records: '+root);
function options(name,script){
 const workspace=path.join(root,name+'-workspace');fs.mkdirSync(workspace);
 for(const dir of ['spec','results','.git'])fs.mkdirSync(path.join(workspace,dir));
 fs.writeFileSync(path.join(workspace,'spec/protected'),'frozen');
 return {docker,image,argv:['node','-e',script],directory:path.join(root,name),filesystem:{root:workspace,permissions:{create:[],update:[],delete:[]}},verification:{root:'/workspace',outputs:['/workspace/results'],protectedPaths:['/workspace/spec']}};
}
test('verification writes only outputs; artifacts collected after cleanup',async()=>{
 const o=options('pass',`const fs=require('fs');if(process.cwd()!=='/workspace'||fs.readFileSync('spec/protected','utf8')!=='frozen')process.exit(91);for(const p of ['/workspace/spec/protected','/workspace/.git/HEAD','/workspace/new']){try{fs.writeFileSync(p,'bad');process.exit(90)}catch{}}fs.writeFileSync('/workspace/results/result.json','{"pass":true}');`);
 const r=await runVerifierSession(o);assert.equal(r.phase,'OUTPUTS_COLLECTED');assert.equal(r.exitCode,0);assert.equal(r.cleanupConfirmed,true);assert.equal(r.artifacts.length,1);assert.equal(r.artifacts[0].path,'/workspace/results/result.json');assert.equal(fs.readFileSync(path.join(o.filesystem.root,'spec/protected'),'utf8'),'frozen');
});
test('failed acceptance exit survives artifact collection',async()=>{
 const r=await runVerifierSession(options('failure',"require('fs').writeFileSync('/workspace/results/failure','failed');process.exit(7)"));assert.equal(r.phase,'FAILED');assert.equal(r.exitCode,7);assert.equal(r.cleanupConfirmed,true);
});
for(const type of ['symlink','hardlink','directory-alias'])test(type+' evidence is rejected despite verifier zero exit',async()=>{
 const action=type==='symlink'?"fs.symlinkSync('/etc/passwd',p+'/alias')":type==='directory-alias'?"fs.symlinkSync('/etc',p+'/alias')":"fs.writeFileSync(p+'/original','x');fs.linkSync(p+'/original',p+'/alias')";
 const o=options(type,`const fs=require('fs'),p='/workspace/results';${action}`);
 await assert.rejects(runVerifierSession(o),/aliased|Nonregular/);
 const journal=JSON.parse(fs.readFileSync(path.join(o.directory,'container-journal.json')));assert.equal(journal.phase,'EVIDENCE_INVALID');assert.equal(journal.cleanupConfirmed,true);assert.equal(journal.artifacts,null);
});
test('output shortcut and protected overlap fail before Docker invocation',()=>{
 for(const mode of ['alias','overlap']){
  const o=options('preflight-'+mode,'process.exit(0)');o.docker='/does/not/exist';
  if(mode==='alias'){fs.rmdirSync(path.join(o.filesystem.root,'results'));fs.symlinkSync('spec',path.join(o.filesystem.root,'results'));}
  else o.verification.outputs=['/workspace/spec'];
  assert.throws(()=>prepareSession(o),/unaliased|overlaps/);assert.equal(fs.existsSync(o.directory),false);
 }
});
test('collection refuses running writer; interrupt is not success',async()=>{
 const o=options('interrupt',"setInterval(()=>{},100)");const s=prepareSession(o);startSession(s);
 assert.throws(()=>collectVerifierArtifacts(s),/cleanup/);
 const r=await finishSession(s,{signal:AbortSignal.abort()});assert.equal(r.phase,'INTERRUPTED');assert.equal(r.cleanupConfirmed,true);
});

for(const invalid of [false,true])test(`consumer envelope ${invalid?'invalid rejects after zero exit':'valid matches independent binding'}`,async()=>{
 const hash='a'.repeat(64),revision='b'.repeat(40),crypto=await import('node:crypto');
 const artifactHash=crypto.createHash('sha256').update('result').digest('hex');
 const expected={repository:'neutral/consumer',revision,treeSha256:hash,factoryRevision:revision,configSha256:hash,policySha256:hash,manifestSha256:hash,requiredSuites:['acceptance'],requiredEvidence:['results/result']};
 const e={schemaVersion:1,status:'COMPLETE',mode:'full',category:null,consumer:{repository:expected.repository,revision,treeSha256:invalid?'c'.repeat(64):hash},factory:{revision},configuration:{sha256:hash},trust:{policySha256:hash,manifestSha256:hash},suites:[{id:'acceptance',exitCode:0}],artifacts:[{path:'results/result',sha256:artifactHash}]};
 const o=options('envelope-'+invalid,`const fs=require('fs');fs.writeFileSync('results/result','result');fs.writeFileSync('results/envelope.json',${JSON.stringify(JSON.stringify(e))});`);
 const run=()=>runVerifierSession(o,{consumerEvidence:{path:'results/envelope.json',expected}});
 if(invalid){await assert.rejects(run(),/identity mismatch/);assert.equal(JSON.parse(fs.readFileSync(path.join(o.directory,'container-journal.json'))).phase,'EVIDENCE_INVALID');}
 else assert.equal((await run()).phase,'OUTPUTS_COLLECTED');
});

test('bounded verifier resources enable executable scratch without source writes',async()=>{
 const o=options('resources',`const fs=require('fs'),cp=require('child_process');fs.writeFileSync('/tmp/check','# !/bin/sh\\nexit 0'.replace('# !','#!'),{mode:0o700});cp.execFileSync('/tmp/check');fs.writeFileSync('results/resource-check','pass');`);
 o.verification.resources={memoryMiB:2048,pids:512,scratchMiB:512,shmMiB:256,executableScratch:true};
 const r=await runVerifierSession(o);assert.equal(r.phase,'OUTPUTS_COLLECTED');
 assert.deepEqual(JSON.parse(fs.readFileSync(r.journal)).resources,o.verification.resources);
});
test('invalid verifier resource profile fails before Docker',()=>{
 const o=options('bad-resources','process.exit(0)');o.docker='/does/not/exist';
 o.verification.resources={memoryMiB:0,pids:512,scratchMiB:512,shmMiB:256,executableScratch:true};
 assert.throws(()=>prepareSession(o),/bounded verifier resources/);assert.equal(fs.existsSync(o.directory),false);
});

test('read-only dependency and trust mounts preserve content and deny writes',async()=>{
 const o=options('readonly-inputs',`const fs=require('fs');if(fs.readFileSync('/trust/policy.json','utf8')!=='trusted')process.exit(91);if(fs.readFileSync('/workspace/spec/node_modules/neutral.js','utf8')!=='dependency')process.exit(92);for(const p of ['/trust/policy.json','/workspace/spec/node_modules/neutral.js'])try{fs.writeFileSync(p,'bad');process.exit(93)}catch{}fs.writeFileSync('results/pass','ok');`);
 const deps=path.join(root,'provisioned-deps');fs.mkdirSync(deps);fs.writeFileSync(path.join(deps,'neutral.js'),'dependency');const trust=path.join(root,'policy.json');fs.writeFileSync(trust,'trusted');
 fs.mkdirSync(path.join(o.filesystem.root,'spec/node_modules'));
 o.readonlyInputs=[{source:deps,target:'/workspace/spec/node_modules'},{source:trust,target:'/trust/policy.json'}];
 const r=await runVerifierSession(o);assert.equal(r.phase,'OUTPUTS_COLLECTED');assert.equal(r.exitCode,0);assert.equal(fs.readFileSync(trust,'utf8'),'trusted');
});
test('read-only dependency shortcuts outside declared tree fail before Docker',()=>{
 const o=options('dependency-alias','process.exit(0)');o.docker='/does/not/exist';const deps=path.join(root,'aliased-deps');fs.mkdirSync(deps);fs.symlinkSync('/etc/passwd',path.join(deps,'outside'));o.readonlyInputs=[{source:deps,target:'/workspace/spec/node_modules'}];assert.throws(()=>prepareSession(o),/External dependency alias/);assert.equal(fs.existsSync(o.directory),false);
});
