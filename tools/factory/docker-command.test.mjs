import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {dockerCommand} from './docker-command.mjs';
function fixture(t,{failures=1,message='Cannot connect to the Docker daemon at unix:///fixture.sock. Is the docker daemon running?',status=1}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docker-transport-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'docker'),calls=path.join(dir,'calls');
 fs.writeFileSync(file,'#!'+process.execPath+'\n'+`const fs=require('fs');const calls=${JSON.stringify(calls)};const n=fs.existsSync(calls)?Number(fs.readFileSync(calls)):0;fs.writeFileSync(calls,String(n+1));if(n<${failures}){process.stderr.write(${JSON.stringify(message)});process.exit(${status});}console.log('[{"State":{"Running":true,"Pid":42}}]');`,{mode:0o700});return {file,count:()=>Number(fs.readFileSync(calls))};
}
test('read-only Docker queries recover only from explicit connection failure',t=>{
 for(const args of [['inspect','id'],['container','ls'],['image','inspect','sha'],['volume','inspect','vol'],['volume','ls']]){const f=fixture(t);const result=JSON.parse(dockerCommand(f.file,args));assert.equal(result[0].State.Running,true);assert.equal(result[0].State.Pid,42);assert.equal(f.count(),2);}
});
test('persistent connection failure is bounded and never means absent or stopped',t=>{
 for(const args of [['inspect','id'],['container','ls']]){const f=fixture(t,{failures:10});assert.throws(()=>dockerCommand(f.file,args));assert.equal(f.count(),3);}
});
test('Docker mutations are never retried after a lost connection',t=>{
 for(const args of [['create'],['start'],['stop'],['rm'],['volume','create'],['exec'],['cp']]){const f=fixture(t);assert.throws(()=>dockerCommand(f.file,args));assert.equal(f.count(),1);}
});
test('other Docker failures are not reclassified as transient transport failures',t=>{
 for(const config of [{message:'No such container'},{message:'permission denied'},{status:2}]){const f=fixture(t,config);assert.throws(()=>dockerCommand(f.file,['inspect','id']));assert.equal(f.count(),1);}
});
