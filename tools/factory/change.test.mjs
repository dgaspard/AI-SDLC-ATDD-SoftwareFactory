// GCH contract tests. Fixture launcher is NOT a real coding agent or OS sandbox.
// Additional engineering regressions; neutral fixture mirrors the frozen GCH setup.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
const factory=fileURLToPath(new URL('../../',import.meta.url));
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

function rebind(f,transform){
 const p=path.join(f.dir,'fixture-runner.cjs');fs.writeFileSync(p,transform(fs.readFileSync(p,'utf8')));
 const r=JSON.parse(fs.readFileSync(f.runner));r.inputs[0].sha256=sha(fs.readFileSync(p));f.write(f.runner,r);
 const a=JSON.parse(fs.readFileSync(f.authority));a.runnerSha256=sha(fs.readFileSync(f.runner));f.write(f.authority,a);
}
function check(e){return spawnSync(process.execPath,[cli,'check','--evidence',e],{encoding:'utf8'});}
test('ignored out-of-grant creation is denied',t=>{
 const f=fixture(t);rebind(f,s=>s.replace("const mode=", "fs.mkdirSync(path.join(r.workspace,'results'));fs.writeFileSync(path.join(r.workspace,'results/unauthorized'),'x');const mode="));
 failed(f.run(),6,'PERMISSION_DENIED');
});
test('successful evidence checks, then ignored candidate addition invalidates it',t=>{
 const f=fixture(t),v=f.run();assert.equal(v.r.status,0,v.r.stderr);assert.equal(check(v.report.evidence).status,0);
 const e=JSON.parse(fs.readFileSync(v.report.evidence));fs.mkdirSync(path.join(e.isolation.workspace,'results'));fs.writeFileSync(path.join(e.isolation.workspace,'results/later'),'x');assert.equal(check(v.report.evidence).status,8);
});
test('tampered Git configuration is never executed during failed recovery',t=>{
 const f=fixture(t),marker=path.join(f.dir,'filter-executed');
 rebind(f,s=>s.replace("const mode=",`fs.appendFileSync(path.join(r.workspace,'.git/config'),${JSON.stringify('\n[filter "hostile"]\n clean = touch '+JSON.stringify(marker)+'\n required = true\n')});fs.writeFileSync(path.join(r.workspace,'.gitattributes'),'* filter=hostile\\n');const mode=`));
 const v=f.run();failed(v,6,'PERMISSION_DENIED');assert.equal(fs.existsSync(marker),false);assert.ok(v.report.evidence);assert.equal(JSON.parse(fs.readFileSync(v.report.evidence)).diff.path,'candidate-changes.json');
});
test('real runner is refused before invocation or output creation',t=>{
 const f=fixture(t),r=JSON.parse(fs.readFileSync(f.runner));r.kind='real';f.write(f.runner,r);const a=JSON.parse(fs.readFileSync(f.authority));a.runnerSha256=sha(fs.readFileSync(f.runner));f.write(f.authority,a);
 failed(f.run(),5,'TOOLING_UNAVAILABLE');assert.equal(fs.existsSync(path.join(f.dir,'invoked')),false);assert.equal(fs.existsSync(f.output),false);
});
test('malformed authority is classified as invalid trust before invocation',t=>{
 const f=fixture(t);fs.writeFileSync(f.authority,'{');failed(f.run(),4,'TRUST_INVALID');assert.equal(fs.existsSync(path.join(f.dir,'invoked')),false);
});

test('verifier ignored non-output writes invalidate evidence after cleanup',t=>{
 const f=fixture(t);fs.appendFileSync(path.join(f.root,'.gitignore'),'app/ignored\n');fs.appendFileSync(path.join(f.root,'spec/check.cjs'),"fs.writeFileSync('app/ignored','unexpected');");f.approveTask();
 const v=f.run();failed(v,8,'EVIDENCE_INVALID');const e=JSON.parse(fs.readFileSync(v.report.evidence));assert.equal(e.cleanup.verifierStopped,true);
});
test('later verifier ignored non-output write invalidates check',t=>{
 const f=fixture(t);fs.appendFileSync(path.join(f.root,'.gitignore'),'app/ignored\n');f.approveTask();const v=f.run();assert.equal(v.r.status,0,v.r.stderr);assert.equal(check(v.report.evidence).status,0);const e=JSON.parse(fs.readFileSync(v.report.evidence));fs.writeFileSync(path.join(e.isolation.verificationRoot,'app/ignored'),'later');assert.equal(check(v.report.evidence).status,8);
});

test('later Git metadata mutation is rejected by evidence checking',t=>{const f=fixture(t),v=f.run();assert.equal(v.r.status,0,v.r.stderr);const e=JSON.parse(fs.readFileSync(v.report.evidence));fs.appendFileSync(path.join(e.isolation.workspace,'.git/config'),'\n[arbitrary]\n value = changed\n');assert.equal(check(v.report.evidence).status,8);});
