// Explicit real-CLI/relay qualification with synthetic model responses only.
import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync,spawnSync} from 'node:child_process';
import {runTaskSession} from './task-session.mjs';import {createModelBroker} from './model-broker.mjs';import {createConverseTransport} from './bedrock-converse.mjs';import {attachModelChannel} from './model-channel-session.mjs';
const docker=process.env.FACTORY_DOCKER,image=process.env.FACTORY_NATIVE_IMAGE;if(!docker||!image)throw Error('Explicit immutable tooling required');
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'factory-model-channel-'));console.error('Retained records: '+root);
function task(name,argv){const workspace=path.join(root,name+'-candidate');fs.mkdirSync(workspace);fs.mkdirSync(workspace+'/source');fs.mkdirSync(workspace+'/spec');fs.writeFileSync(workspace+'/source/allowed.js','before');return {docker,image,workspace,permissions:{create:[],update:['source/allowed.js'],delete:[]},protectedPaths:['spec'],directory:path.join(root,name),modelChannel:true,argv};}
async function brokerFixture(name,tool){let calls=0;const audit=[];const model='neutral-probe';const transport=createConverseTransport({model,send:async()=>{calls++;return {stopReason:tool&&calls===1?'tool_use':'end_turn',output:{message:{role:'assistant',content:tool&&calls===1?[{toolUse:{toolUseId:'qualified_call',name:'exec_command',input:typeof tool==='string'?{cmd:tool,shell:'/bin/sh',login:false,max_output_tokens:100}:tool}}]:[{text:'Completed approved update.'}]}}};}});const broker=createModelBroker({runId:name,model,converseTransport:transport,audit:e=>audit.push(e)});await new Promise(r=>broker.server.listen(0,'127.0.0.1',r));return {broker,model,audit,calls:()=>calls};}
async function execute(name,argv,tool,hook){const f=await brokerFixture(name,tool),options=task(name,argv);let channel;
 try{const result=await runTaskSession(options,{afterStart:async session=>{channel=await attachModelChannel({session,...f,prompt:'Update only source/allowed.js in place with the supplied neutral behavior. No other writes are authorized.'});await hook?.(session,f);},afterCleanup:async()=>{if(channel)await channel.close();else await f.broker.close();}});fs.writeFileSync(path.join(options.directory,'model-audit.json'),JSON.stringify({calls:f.calls(),audit:f.audit},null,2));return {result,options,...f};}finally{await f.broker.close();}}
test('actual pinned CLI updates only granted bytes through external Converse relay',async()=>{
 const f=await execute('cli',['node','/opt/factory/coding-client.mjs'],"node -e \"require('fs').writeFileSync('/workspace/source/allowed.js','approved')\"");assert.equal(f.result.phase,'AUDIT_COLLECTED');assert.equal(f.calls(),2);assert.ok(f.audit.every(x=>x.status===200));assert.equal(fs.readFileSync(f.options.workspace+'/source/allowed.js','utf8'),'approved');
 const journal=JSON.parse(fs.readFileSync(f.result.journal));const c=JSON.parse(execFileSync(docker,['inspect',journal.containerId],{encoding:'utf8'}))[0];assert.equal(c.HostConfig.NetworkMode,'none');assert.equal(Object.keys(c.HostConfig.PortBindings??{}).length,0);assert.ok(c.Mounts.every(x=>!x.Source.includes('.aws')&&!x.Source.includes('docker.sock')));
});
test('relay loss after readiness prevents a successful task',async()=>{
 await assert.rejects(execute('relay-death',['node','-e','setInterval(()=>{},100)'],null,async session=>{
  // Keep the trusted injector alive until container shutdown: transient docker-exec
  // helpers must not create an unrelated /proc disappearance during target census.
  const inject="const fs=require('fs');let target;for(const p of fs.readdirSync('/proc')){if(!/^\\d+$/.test(p))continue;try{if(fs.readFileSync('/proc/'+p+'/cmdline','utf8').split('\\0').includes('/opt/factory/model-channel.mjs'))target=Number(p)}catch{}}if(!target)process.exit(91);process.setgid(65533);process.setuid(65533);process.kill(target,'SIGKILL');fs.writeSync(1,'RELAY_SIGNAL_SENT\\n');setInterval(()=>{},100);";
  let output='';try{output=execFileSync(docker,['exec','--user','0:0',session.j.containerId,'node','-e',inject],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']});}catch(error){output=String(error.stdout??'');}
  assert.match(output,/RELAY_SIGNAL_SENT/,'confirmed signal delivery, not an unrelated container failure');
 }),/^Error: Model channel failed$/);
 const j=JSON.parse(fs.readFileSync(path.join(root,'relay-death/execution/container-journal.json')));assert.equal(j.cleanupConfirmed,true);assert.notEqual(j.phase,'AUDIT_COLLECTED');
 const logs=spawnSync(docker,['logs',j.containerId],{encoding:'utf8',timeout:10000});assert.equal(logs.status,0);assert.doesNotMatch(logs.stdout+logs.stderr,/TOOLING_UNAVAILABLE:/,'no unrelated observer failure may satisfy relay-loss qualification');
});
test('aborted HTTP upload cannot crash relay or bypass broker validation',async()=>{
 const script=`const http=require('http');(async()=>{await new Promise(resolve=>{const r=http.request({host:'127.0.0.1',port:process.env.FACTORY_MODEL_PORT,path:'/v1/responses',method:'POST',headers:{authorization:'Bearer '+process.env.FACTORY_MODEL_TOKEN,'content-type':'application/json','content-length':'999',expect:'100-continue'}});r.on('continue',()=>r.destroy());r.on('error',resolve);r.flushHeaders();});const r=await fetch('http://127.0.0.1:'+process.env.FACTORY_MODEL_PORT+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+process.env.FACTORY_MODEL_TOKEN,'content-type':'application/json'},body:JSON.stringify({model:'neutral-probe',store:false,input:'neutral qualification'})});if(r.status!==200)process.exitCode=1;await r.text();})().catch(()=>process.exitCode=1);`;
 const f=await execute('aborted-upload',['node','-e',script]);assert.equal(f.result.phase,'AUDIT_COLLECTED');assert.equal(f.calls(),1);
});
test('root relay attachment rejects substituted container identity',async()=>{
 const f=await brokerFixture('identity');try{await assert.rejects(attachModelChannel({session:{docker,j:{containerId:'0'.repeat(64),audit:true,argv:['--model-channel'],phase:'RUNNING'}},...f,prompt:'neutral'}));}finally{await f.broker.close();}
});

test('actual pinned CLI default shell startup preserves bounded task writes',async()=>{
 const f=await execute('default-shell',['node','/opt/factory/coding-client.mjs'],{cmd:"node -e \"require('fs').writeFileSync('/workspace/source/allowed.js','approved')\"",max_output_tokens:100});
 assert.equal(f.result.phase,'AUDIT_COLLECTED');assert.equal(f.calls(),2);assert.equal(f.result.receipt.denials,0);assert.equal(f.result.proof.coverageClosed,true);assert.equal(f.result.cleanupConfirmed,true);
 assert.equal(fs.readFileSync(f.options.workspace+'/source/allowed.js','utf8'),'approved');
});
