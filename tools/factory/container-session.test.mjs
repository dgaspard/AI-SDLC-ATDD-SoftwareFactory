// Explicit credential-free Docker component tests, not portable gate or launcher conformance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {prepareSession,startSession,finishSession,recoverSession} from './container-session.mjs';
const docker=process.env.FACTORY_DOCKER;
const image=process.env.FACTORY_COMPONENT_IMAGE;
if(!docker||!image)throw new Error('Explicit FACTORY_DOCKER and pinned FACTORY_COMPONENT_IMAGE required');
const output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'factory-container-sessions-'));
console.error('Retained component records: '+output);
const opts=(name,script)=>({docker,image,argv:['node','-e',script],directory:path.join(output,name)});
const read=s=>JSON.parse(fs.readFileSync(s.file));
const info=s=>JSON.parse(execFileSync(docker,['inspect',s.j.containerId],{encoding:'utf8'}))[0];
function removeStopped(s){const value=info(s);assert.equal(value.State.Running,false);execFileSync(docker,['rm',s.j.containerId]);}
test('pre-start journal identifies stopped container and success follows confirmed shutdown',async()=>{
 const s=prepareSession(opts('success','process.exit(0)'));
 assert.equal(read(s).phase,'CREATED');assert.equal(read(s).containerId,s.j.containerId);assert.equal(info(s).State.Status,'created');
 startSession(s);const result=await finishSession(s);assert.equal(result.phase,'COMPLETE');assert.equal(result.cleanupConfirmed,true);assert.equal(result.exitCode,0);assert.equal(info(s).State.Running,false);removeStopped(s);
});
test('nonzero application exit remains failure after cleanup',async()=>{
 const s=prepareSession(opts('failure','process.exit(17)'));startSession(s);const result=await finishSession(s);
 assert.equal(result.phase,'FAILED');assert.equal(result.exitCode,17);assert.equal(result.cleanupConfirmed,true);removeStopped(s);
});
test('timeout stops TERM-resistant code before recording a terminal result',async()=>{
 const s=prepareSession(opts('timeout',"process.on('SIGTERM',()=>{});console.log('READY');setInterval(()=>{},10)"));startSession(s);
 const deadline=Date.now()+5000;
 while(!execFileSync(docker,['logs',s.j.containerId],{encoding:'utf8'}).includes('READY')){assert.ok(Date.now()<deadline,'TERM-resistant workload did not become ready');await new Promise(r=>setTimeout(r,20));}
 const result=await finishSession(s,{timeoutMs:150});assert.equal(result.phase,'TIMED_OUT');assert.equal(result.cleanupConfirmed,true);assert.equal(info(s).State.Running,false);removeStopped(s);
});
test('interrupt confirms cleanup and never produces COMPLETE',async()=>{
 const s=prepareSession(opts('interrupt','setInterval(()=>{},10)'));startSession(s);const signal=AbortSignal.abort();
 const result=await finishSession(s,{signal});assert.equal(result.phase,'INTERRUPTED');assert.equal(result.cleanupConfirmed,true);removeStopped(s);
});
test('recovery of lost create response discovers container by durable identity and never starts it',()=>{
 const s=prepareSession(opts('lost-create','process.exit(0)'));const j=read(s);j.containerId=null;j.phase='PREPARED';fs.writeFileSync(s.file,JSON.stringify(j));
 fs.writeFileSync(s.file+'.tmp','incomplete prior write');
 const result=recoverSession({docker,directory:path.dirname(s.file)});assert.equal(result.containerId,s.j.containerId);assert.equal(result.phase,'INTERRUPTED');assert.equal(info(s).State.Status,'created');removeStopped(s);
});
test('recovery stops running work and refuses mismatched ownership',()=>{
 const s=prepareSession(opts('recovery','setInterval(()=>{},10)'));startSession(s);const original=read(s);
 fs.writeFileSync(s.file,JSON.stringify({...original,image:'sha256:'+'0'.repeat(64)}));
 assert.throws(()=>recoverSession({docker,directory:path.dirname(s.file)}),/identity mismatch/);assert.equal(info(s).State.Running,true);
 fs.writeFileSync(s.file,JSON.stringify(original));const result=recoverSession({docker,directory:path.dirname(s.file)});
 assert.equal(result.phase,'INTERRUPTED');assert.equal(result.cleanupConfirmed,true);removeStopped(s);
});
test('shortcut into forbidden root is rejected before Docker execution',()=>{
 const protectedRoot=path.join(output,'protected');fs.mkdirSync(protectedRoot);const alias=path.join(output,'alias');fs.symlinkSync(protectedRoot,alias);
 assert.throws(()=>prepareSession({...opts('unused','process.exit(0)'),docker:'/does/not/exist',directory:path.join(alias,'new'),forbiddenRoots:[protectedRoot]}),/canonical|overlaps/);
 assert.equal(fs.existsSync(path.join(protectedRoot,'new')),false);
});

test('an observed interrupt wins even after a zero exit, and recovery preserves terminal history',async()=>{
 const s=prepareSession(opts('exited-interrupt','process.exit(0)'));startSession(s);
 execFileSync(docker,['wait',s.j.containerId]);
 const result=await finishSession(s,{signal:AbortSignal.abort()});assert.equal(result.exitCode,0);assert.equal(result.phase,'INTERRUPTED');
 const before=fs.readFileSync(s.file,'utf8');assert.throws(()=>recoverSession({docker,directory:path.dirname(s.file)}),/Terminal/);assert.equal(fs.readFileSync(s.file,'utf8'),before);removeStopped(s);
});

test('killed coordinator leaves a recoverable running container with durable ownership',async()=>{
 const options=opts('killed-coordinator','setInterval(()=>{},10)');
 const moduleUrl=new URL('./container-session.mjs',import.meta.url).href;
 const source=`import {prepareSession,startSession} from ${JSON.stringify(moduleUrl)}; const s=prepareSession(${JSON.stringify(options)});startSession(s);console.log(JSON.stringify({file:s.file,j:s.j}));setInterval(()=>{},100);`;
 const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe']});
 const closed=once(child,'close');let bytes='';
 let timer;
 try{
  const payload=await Promise.race([new Promise((resolve,reject)=>{child.stdout.on('data',b=>{bytes+=b;if(bytes.includes('\n')){try{resolve(JSON.parse(bytes.trim()));}catch(e){reject(e);}}});child.once('error',reject);child.once('exit',()=>reject(new Error('Coordinator exited before readiness')));}),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Coordinator readiness timeout')),10000))]);
  clearTimeout(timer);child.kill('SIGKILL');await closed;
  const s={...payload,docker};assert.equal(info(s).State.Running,true);assert.equal(read(s).phase,'RUNNING');
  const result=recoverSession({docker,directory:options.directory});assert.equal(result.phase,'INTERRUPTED');assert.equal(result.cleanupConfirmed,true);removeStopped(s);
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await closed;}}
});
