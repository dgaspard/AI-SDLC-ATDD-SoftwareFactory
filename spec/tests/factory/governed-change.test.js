// GCH contract tests. Fixture launcher is NOT a real coding agent or OS sandbox.
// These tests remain red until the governed-change CLI exists; no skips/fallbacks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
const factory=fileURLToPath(new URL('../../../',import.meta.url));
const cli=path.join(factory,'tools/factory/change.mjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t,mode='pass') {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'governed change '));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const root=path.join(dir,'consumer');fs.mkdirSync(root);
  const write=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof v==='string'?v:JSON.stringify(v));};
  const put=(p,v)=>write(path.join(root,p),v);
  put('.gitignore','results/\nevidence/\n');put('package.json',{type:'module'});
  put('app/value.txt','before\n');put('app/obsolete.txt','obsolete\n');put('spec/requirement.txt','Value must be after.\n');
  put('spec/check.cjs',`const fs=require('fs'); if(fs.readFileSync('app/value.txt','utf8')!=='after\\n')process.exit(1);fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/result.json',JSON.stringify({runId:process.env.FACTORY_RUN_ID,consumerTree:process.env.FACTORY_CONSUMER_TREE,factoryRevision:process.env.FACTORY_REVISION}));`);
  put('spec/policy.json',{suites:{acceptance:{cmd:process.execPath,args:['spec/check.cjs']}},tiers:{full:{suites:['acceptance']},fast:{always:['acceptance']}},rules:{list:[]}});
  const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:factory,encoding:'utf8'}).trim();
  const task={schemaVersion:1,id:'neutral-update',intent:'Implement the frozen value requirement',requirementPaths:['spec/requirement.txt'],permissions:{create:[],update:['app/value.txt'],delete:[]}};
  put('spec/change.json',task);put('spec/paths.json',{protected:['spec/'],ignored:['spec/protected.sha256']});
  const config={schemaVersion:1,application:{id:'neutral',repository:'example/consumer',root:'.'},factory:{repository:'example/factory',revision,interfaceVersion:1},locations:Object.fromEntries(['domainContracts','apiContracts','bdd','performanceScenarios','performanceWorkloads','applicationPolicies','fixtures'].map(k=>[k,['spec/requirement.txt']])),runtime:{contract:'spec/requirement.txt',projects:[],startupGroups:[],telemetry:{endpoint:'http://localhost:4318',protocol:'http/protobuf',tracesExporter:'otlp',metricsExporter:'none',logsExporter:'none',batchDelayMs:100,waitMs:5000}},testing:{policy:'spec/policy.json',cwd:'.',results:'results',evidence:'evidence'},trust:{protectedPaths:'spec/paths.json',manifest:'spec/protected.sha256',configuration:'spec/authority.json'},contractVersions:[{id:'neutral',version:'1',path:'spec/requirement.txt'}]};
  put('spec/config.json',config);put('spec/authority.json',{requiredSuites:['acceptance'],requiredEvidence:['evidence/result.json']});
  // Synthetic fixture hash list only; never invoke a human freeze tool.
  put('spec/protected.sha256',fs.readdirSync(path.join(root,'spec')).sort().map(p=>`${sha(fs.readFileSync(path.join(root,'spec',p)))}  spec/${p}\n`).join(''));
  execFileSync('git',['init','-q'],{cwd:root});execFileSync('git',['add','.'],{cwd:root});execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','approved synthetic inputs'],{cwd:root});
  const start=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const trust=path.join(dir,'consumer-trust.json');write(trust,{schemaVersion:1,applicationId:'neutral',repository:'example/consumer',factory:config.factory,configSha256:sha(fs.readFileSync(path.join(root,'spec/config.json'))),requiredSuites:['acceptance'],requiredEvidence:['evidence/result.json'],protectedPaths:['spec/'],protectedManifestSha256:sha(fs.readFileSync(path.join(root,'spec/protected.sha256')))});
  const runnerScript=path.join(dir,'fixture-runner.cjs');
  write(runnerScript,`const fs=require('fs'),path=require('path');let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const r=JSON.parse(s);fs.writeFileSync(${JSON.stringify(path.join(dir,'invoked'))},'yes');const mode=${JSON.stringify(mode)};if(mode==='interrupt'){process.kill(process.ppid,'SIGTERM');setInterval(()=>{},1000);return;}if(mode==='denied'){console.log(JSON.stringify({schemaVersion:1,runId:r.runId,status:'denied',exitCode:1,violations:[{operation:'update',path:'spec/requirement.txt'}]}));return;}if(mode==='malformed'){console.log('not-json');return;}if(mode==='create')fs.writeFileSync(path.join(r.workspace,'app/extra.txt'),'new');if(mode==='delete')fs.unlinkSync(path.join(r.workspace,'app/obsolete.txt'));fs.writeFileSync(path.join(r.workspace,'app/value.txt'),mode==='fail'?'wrong\\n':'after\\n');console.log(JSON.stringify({schemaVersion:1,runId:r.runId,status:'finished',exitCode:0,violations:[]}));});`);
  const runner=path.join(dir,'runner.json');write(runner,{schemaVersion:1,kind:'fixture',argv:[process.execPath,runnerScript],executableSha256:sha(fs.readFileSync(process.execPath)),inputs:[{path:runnerScript,sha256:sha(fs.readFileSync(runnerScript))}],timeoutMs:10000,network:'none'});
  const authority=path.join(dir,'authority.json');write(authority,{schemaVersion:1,taskSha256:sha(fs.readFileSync(path.join(root,'spec/change.json'))),startRevision:start,consumerRepository:'example/consumer',factoryRevision:revision,consumerConfig:'spec/config.json',consumerTrust:trust,runnerSha256:sha(fs.readFileSync(runner))});
  const output=path.join(dir,'run');
  const original=()=>execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'});
  const run=(extra=[],destination=output)=>{
    assert.ok(fs.existsSync(cli),'Missing governed-change CLI: red specification, not a passing simulated demonstration');
    const r=spawnSync(process.execPath,[cli,'run','--root',root,'--task','spec/change.json','--authority',authority,'--runner',runner,'--output',destination,...extra],{encoding:'utf8',timeout:60000});
    assert.ifError(r.error);assert.equal(original(),'','original checkout changed');
    const report=JSON.parse(r.stdout);return {r,report};
  };
  const approveTask=()=>{
    put('spec/change.json',task);
    put('spec/protected.sha256',fs.readdirSync(path.join(root,'spec')).filter(p=>p!=='protected.sha256').sort().map(p=>`${sha(fs.readFileSync(path.join(root,'spec',p)))}  spec/${p}\n`).join(''));
    execFileSync('git',['add','.'],{cwd:root});execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','synthetic task variation'],{cwd:root});
    const a=JSON.parse(fs.readFileSync(authority));a.taskSha256=sha(fs.readFileSync(path.join(root,'spec/change.json')));a.startRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();write(authority,a);
    const c=JSON.parse(fs.readFileSync(trust));c.protectedManifestSha256=sha(fs.readFileSync(path.join(root,'spec/protected.sha256')));write(trust,c);
  };
  return {dir,root,output,run,authority,runner,task,write,original,approveTask};
}
const failed=(v,exit,category)=>{assert.equal(v.r.status,exit,v.r.stderr);assert.equal(v.report.status,'FAILED');assert.equal(v.report.category,category);};
test('GCH-001 fixture update yields only simulated evidence, isolated diff and immutable identities',t=>{
 const f=fixture(t),v=f.run();assert.equal(v.r.status,0,v.r.stderr);assert.equal(v.report.status,'SIMULATED_VERIFIED');
 const e=JSON.parse(fs.readFileSync(v.report.evidence));assert.equal(e.runnerKind,'fixture');assert.equal(e.originalUnchanged,true);assert.equal(e.cleanup.runnerStopped,true);assert.equal(e.cleanup.verifierStopped,true);assert.equal(e.verification.exitCode,0);assert.match(e.consumer.startRevision,/^[a-f0-9]{40}$/);assert.match(e.factory.revision,/^[a-f0-9]{40}$/);assert.notEqual(e.consumer.startTreeSha256,e.consumer.candidateTreeSha256);assert.deepEqual(e.diff.changes.map(x=>[x.operation,x.path]),[['update','app/value.txt']]);assert.equal(fs.readFileSync(path.join(f.root,'app/value.txt'),'utf8'),'before\n');
});
test('GCH-002 a denied protected write attempt fails even without byte drift',t=>{const f=fixture(t,'denied'),v=f.run();failed(v,6,'PERMISSION_DENIED');assert.ok(fs.existsSync(f.output));});
test('GCH-003 failed acceptance cannot yield successful evidence',t=>{const f=fixture(t,'fail'),v=f.run();failed(v,7,'ACCEPTANCE_FAILED');assert.ok(fs.existsSync(f.output));if(v.report.evidence){const e=JSON.parse(fs.readFileSync(v.report.evidence));assert.notEqual(e.status,'VERIFIED_CANDIDATE');assert.notEqual(e.status,'SIMULATED_VERIFIED');assert.notEqual(e.verification.exitCode,0);}});
test('GCH-004 interrupted execution is retained and never successful',t=>{const f=fixture(t,'interrupt'),v=f.run();assert.equal(v.r.status,130,v.r.stderr);assert.equal(v.report.status,'INTERRUPTED');assert.ok(fs.existsSync(f.output));});
test('GCH-005 subsequent candidate edit invalidates evidence',t=>{const f=fixture(t),v=f.run();assert.equal(v.r.status,0,v.r.stderr);const e=JSON.parse(fs.readFileSync(v.report.evidence));fs.appendFileSync(path.join(e.isolation.workspace,'app/value.txt'),'later');const r=spawnSync(process.execPath,[cli,'check','--evidence',v.report.evidence],{encoding:'utf8'});assert.equal(r.status,8,r.stderr);assert.equal(JSON.parse(r.stdout).category,'EVIDENCE_INVALID');});
test('GCH-006 edited approved requirements are rejected before runner execution',t=>{const f=fixture(t);fs.appendFileSync(path.join(f.root,'spec/requirement.txt'),'unapproved');assert.ok(fs.existsSync(cli),'Missing governed-change CLI');const r=spawnSync(process.execPath,[cli,'run','--root',f.root,'--task','spec/change.json','--authority',f.authority,'--runner',f.runner,'--output',f.output],{encoding:'utf8'});assert.equal(r.status,4,r.stderr);assert.equal(fs.existsSync(path.join(f.dir,'invoked')),false);});
test('GCH-007 missing launcher has no implicit fallback',t=>{const f=fixture(t);fs.unlinkSync(path.join(f.dir,'fixture-runner.cjs'));failed(f.run(),5,'TOOLING_UNAVAILABLE');assert.equal(fs.existsSync(f.output),false);});
test('GCH-008 malformed runner response fails despite zero exit',t=>{failed(fixture(t,'malformed').run(),10,'IMPLEMENTATION_FAILED');});
test('GCH-009 output shortcut into original protected tree is rejected before execution',t=>{const f=fixture(t);fs.symlinkSync(path.join(f.root,'spec'),f.output);failed(f.run(),2,'REQUEST_INVALID');assert.equal(fs.existsSync(path.join(f.dir,'invoked')),false);});
test('GCH-010 existing output cannot be overwritten',t=>{const f=fixture(t);fs.mkdirSync(f.output);fs.writeFileSync(path.join(f.output,'keep'),'retained');failed(f.run(),2,'REQUEST_INVALID');assert.equal(fs.readFileSync(path.join(f.output,'keep'),'utf8'),'retained');});

for(const operation of ['create','update','delete'])test(`GCH-011-${operation} approved task cannot grant protected ${operation}`,t=>{
 const f=fixture(t);f.task.permissions={create:[],update:[],delete:[]};f.task.permissions[operation]=[operation==='create'?'spec/new.txt':'spec/requirement.txt'];f.approveTask();failed(f.run(),2,'REQUEST_INVALID');assert.equal(fs.existsSync(path.join(f.dir,'invoked')),false);
});
test('GCH-012 runner input byte drift is detected before execution',t=>{const f=fixture(t);fs.appendFileSync(path.join(f.dir,'fixture-runner.cjs'),'\n// changed');failed(f.run(),4,'TRUST_INVALID');assert.equal(fs.existsSync(path.join(f.dir,'invoked')),false);});

test('GCH-013 nonexistent output beneath shortcut into protected original is rejected',t=>{const f=fixture(t);const alias=path.join(f.dir,'shortcut');fs.symlinkSync(path.join(f.root,'spec'),alias);failed(f.run([],path.join(alias,'not-created')),2,'REQUEST_INVALID');assert.equal(fs.existsSync(path.join(f.root,'spec/not-created')),false);assert.equal(fs.existsSync(path.join(f.dir,'invoked')),false);});

test('GCH-014 scoped create is recorded independently from update',t=>{const f=fixture(t,'create');f.task.permissions.create=['app/extra.txt'];f.approveTask();const v=f.run();assert.equal(v.r.status,0,v.r.stderr);const e=JSON.parse(fs.readFileSync(v.report.evidence));assert.ok(e.diff.changes.some(x=>x.operation==='create'&&x.path==='app/extra.txt'&&x.beforeSha256===null));assert.equal(fs.existsSync(path.join(f.root,'app/extra.txt')),false);});
test('GCH-015 scoped source deletion preserves original and requirements',t=>{const f=fixture(t,'delete');f.task.permissions.delete=['app/obsolete.txt'];f.approveTask();const v=f.run();assert.equal(v.r.status,0,v.r.stderr);const e=JSON.parse(fs.readFileSync(v.report.evidence));assert.ok(e.diff.changes.some(x=>x.operation==='delete'&&x.path==='app/obsolete.txt'&&x.afterSha256===null));assert.equal(fs.readFileSync(path.join(f.root,'app/obsolete.txt'),'utf8'),'obsolete\n');});
test('GCH-016 source deletion without a task grant fails',t=>{failed(fixture(t,'delete').run(),6,'PERMISSION_DENIED');});
