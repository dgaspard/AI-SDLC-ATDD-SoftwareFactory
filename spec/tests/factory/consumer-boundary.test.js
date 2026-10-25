import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
const factory = fileURLToPath(new URL('../../../', import.meta.url));
const cli = path.join(factory, 'tools/factory/consumer.mjs');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');

// Independent synthetic consumer. No PetClinic assertions, guard entry points,
// network calls, or fixture copy of the missing factory implementation.
function fixture(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-boundary-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'consumer with spaces'); fs.mkdirSync(root);
  const write = (p, data) => { fs.mkdirSync(path.dirname(path.join(root,p)), {recursive:true}); fs.writeFileSync(path.join(root,p), data); };
  write('spec/requirements.txt', 'Synthetic contract v1\n');
  write('spec/test.cjs', `const fs=require('node:fs');
if(process.env.FACTORY_APPLICATION_ROOT!==process.cwd()) process.exit(44);
fs.mkdirSync('out/evidence',{recursive:true});
fs.writeFileSync('out/evidence/application.json',JSON.stringify({runId:process.env.FACTORY_RUN_ID,consumerTree:process.env.FACTORY_CONSUMER_TREE,factoryRevision:process.env.FACTORY_REVISION}));\n`);
  write('spec/policy.json', JSON.stringify({suites:{application:{cmd:process.execPath,args:['spec/test.cjs']}},tiers:{full:{suites:['application']},fast:{always:['application']}},rules:{list:[]}}));
  write('spec/paths.json', JSON.stringify({protected:['spec/','factory.config.json'],ignored:['spec/protected.sha256']}));
  write('spec/trust.json','{}\n');
  const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:factory,encoding:'utf8'}).trim();
  const config={schemaVersion:1,application:{id:'boundary-fixture',repository:'example/consumer',root:'.'},factory:{repository:'https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory.git',revision,interfaceVersion:1},locations:Object.fromEntries(['domainContracts','apiContracts','bdd','performanceScenarios','performanceWorkloads','applicationPolicies','fixtures'].map(k=>[k,['spec/requirements.txt']])),runtime:{contract:'spec/requirements.txt',projects:[],startupGroups:[],telemetry:{endpoint:'http://localhost:4318',protocol:'http/protobuf',tracesExporter:'otlp',metricsExporter:'none',logsExporter:'none',batchDelayMs:100,waitMs:5000}},testing:{policy:'spec/policy.json',cwd:'.',results:'out/results',evidence:'out/evidence'},trust:{protectedPaths:'spec/paths.json',manifest:'spec/protected.sha256',configuration:'spec/trust.json'},contractVersions:[{id:'synthetic',version:'1',path:'spec/requirements.txt'}]};
  const trust={schemaVersion:1,applicationId:config.application.id,repository:config.application.repository,factory:config.factory,requiredSuites:['application'],requiredEvidence:['out/evidence/application.json'],protectedPaths:['spec/','factory.config.json']};
  // Test-owned baseline creation is independent of guard and never touches the real baseline.
  const trustPath=path.join(parent,'trusted.json');
  function seal() {
    write('factory.config.json',JSON.stringify(config,null,2)+'\n');
    const paths=['factory.config.json',...fs.readdirSync(path.join(root,'spec')).filter(x=>x!=='protected.sha256').map(x=>'spec/'+x)].sort();
    write('spec/protected.sha256',paths.map(p=>`${hash(fs.readFileSync(path.join(root,p)))}  ${p}\n`).join(''));
    trust.configSha256=hash(fs.readFileSync(path.join(root,'factory.config.json')));
    trust.protectedManifestSha256=hash(fs.readFileSync(path.join(root,'spec/protected.sha256')));
    fs.writeFileSync(trustPath,JSON.stringify(trust));
  }
  seal();
  execFileSync('git',['init','-q'],{cwd:root});
  execFileSync('git',['add','.'],{cwd:root});
  execFileSync('git',['-c','user.name=Boundary Fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null','commit','-qm','synthetic inputs'],{cwd:root});
  return {root,parent,config,trust,write,seal,trustPath};
}
function run(f, extra=[]) {
  assert.ok(fs.existsSync(cli), 'START-02 consumer CLI is not implemented; no boundary behavior has run');
  const r=spawnSync(process.execPath,[cli,'verify','--root',f.root,'--config','factory.config.json','--trust',f.trustPath,'--mode','full',...extra],{cwd:os.tmpdir(),encoding:'utf8',timeout:15000});
  assert.ifError(r.error); return {code:r.status,report:JSON.parse(r.stdout)};
}
function expectFailure(f,code,category) {const r=run(f); assert.equal(r.code,code);assert.equal(r.report.status,'FAILED');assert.equal(r.report.category,category);}
test('FC-001 external consumer with spaces runs its own suite and writes dual-identity evidence',t=>{
 const f=fixture(t);assert.ok(!f.root.startsWith(factory));const r=run(f);assert.equal(r.code,0);assert.equal(r.report.status,'COMPLETE');
 const e=JSON.parse(fs.readFileSync(path.join(f.root,r.report.evidence)));assert.equal(e.consumer.repository,'example/consumer');assert.equal(e.factory.revision,f.config.factory.revision);assert.equal(e.configuration.sha256,f.trust.configSha256);assert.equal(e.contracts[0].sha256,hash(fs.readFileSync(path.join(f.root,'spec/requirements.txt'))));
});
test('FC-002 failing consumer assertion makes factory command fail',t=>{const f=fixture(t);f.write('spec/test.cjs',"require('node:assert/strict').equal(1,2,'consumer assertion');\n");f.seal();expectFailure(f,7,'APPLICATION_TEST_FAILED');});
test('FC-003 missing configuration fails before any suite',t=>{const f=fixture(t);fs.unlinkSync(path.join(f.root,'factory.config.json'));expectFailure(f,2,'CONFIG_INVALID');assert.ok(!fs.existsSync(path.join(f.root,'out')));});
test('FC-004 unknown configuration field is rejected',t=>{const f=fixture(t);f.config.ignoreFailures=true;f.seal();expectFailure(f,2,'CONFIG_INVALID');});
test('FC-005 incompatible schema fails without fallback',t=>{const f=fixture(t);f.config.schemaVersion=99;f.seal();expectFailure(f,3,'VERSION_INCOMPATIBLE');});
test('FC-006 changed factory pin cannot reuse checkout',t=>{const f=fixture(t);f.config.factory.revision='0'.repeat(40);f.seal();expectFailure(f,3,'VERSION_INCOMPATIBLE');});
test('FC-007 removing required suite cannot weaken trusted full gate',t=>{const f=fixture(t);f.write('spec/policy.json',JSON.stringify({suites:{},tiers:{full:{suites:[]}},rules:{list:[]}}));f.seal();expectFailure(f,4,'TRUST_INVALID');});
test('FC-008 unavailable executable is tooling failure',t=>{const f=fixture(t);f.write('spec/policy.json',JSON.stringify({suites:{application:{cmd:'/nonexistent/start02-tool',args:[]}},tiers:{full:{suites:['application']}},rules:{list:[]}}));f.seal();expectFailure(f,5,'TOOLING_UNAVAILABLE');});
test('FC-009 passing test without required evidence cannot complete',t=>{const f=fixture(t);f.write('spec/test.cjs','process.exit(0);\n');f.seal();expectFailure(f,8,'EVIDENCE_MISSING');});
test('FC-010 relocated consumer resolves paths from explicit root',t=>{const f=fixture(t);const moved=path.join(f.parent,'relocated');fs.renameSync(f.root,moved);f.root=moved;assert.equal(run(f).report.status,'COMPLETE');});
test('FC-011 unreviewed config edit fails trust validation',t=>{const f=fixture(t);f.config.testing.results='other';fs.writeFileSync(path.join(f.root,'factory.config.json'),JSON.stringify(f.config));expectFailure(f,4,'TRUST_INVALID');});
test('FC-012 escaping input path is rejected',t=>{const f=fixture(t);f.config.locations.fixtures=['../trusted.json'];f.seal();expectFailure(f,2,'CONFIG_INVALID');});
test('FC-013 stale evidence cannot complete',t=>{const f=fixture(t);f.write('spec/test.cjs',"const fs=require('node:fs');fs.mkdirSync('out/evidence',{recursive:true});fs.writeFileSync('out/evidence/application.json',JSON.stringify({runId:'old',consumerTree:'old',factoryRevision:'old'}));");f.seal();expectFailure(f,8,'EVIDENCE_MISSING');});
test('FC-014 service startup exit is distinct from a failed application test',t=>{
 const f=fixture(t);f.write('spec/start.cjs','process.exit(19);\n');
 f.config.runtime.projects=[{id:'broken',kind:'service',cwd:'.',setup:{argv:[process.execPath,'-e','process.exit(0)'],cwd:'.'},start:{argv:[process.execPath,'spec/start.cjs'],cwd:'.'},dependsOn:[],environment:{},health:{url:'http://127.0.0.1:49873/health',status:200,json:{status:'ok'},timeoutMs:10000},stop:{signal:'SIGTERM',timeoutMs:5000}}];
 f.config.runtime.startupGroups=[['broken']];f.seal();expectFailure(f,6,'STARTUP_FAILED');assert.ok(!fs.existsSync(path.join(f.root,'out/evidence/application.json')));
});
