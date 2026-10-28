// Credential-free fixed qualification probe only. Never runs a consumer or arbitrary argv.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {stop} from '../broker/processes.mjs';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const protectedBefore=sha(fs.readFileSync('/inputs/protected.txt'));
const trace='/audit/syscalls.log';
let child,state,timer;
try{
 child=spawn('/usr/bin/strace',['-f','-qq','-yy','-s','256','-u','nobody','-e','trace=%file,kill','-o',trace,process.execPath,'/opt/factory/audit/workload.mjs'],{detached:true,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';state={child,exited:false};
 state.done=new Promise(resolve=>{child.once('error',e=>{state.error=e;state.exited=true;resolve();});child.once('exit',(code,signal)=>{state.code=code;state.signal=signal;state.exited=true;resolve();});});
 const drained=new Promise(resolve=>child.once('close',resolve));
 child.stdout.on('data',b=>{stdout+=b;if(stdout.length>4096)child.kill('SIGKILL');});
 child.stderr.on('data',b=>{stderr+=b;if(stderr.length>4096)child.kill('SIGKILL');});
 const timedOut=await Promise.race([state.done.then(()=>false),new Promise(r=>timer=setTimeout(()=>r(true),10000))]);clearTimeout(timer);
 await stop(state,2000);await drained; // Observe and fingerprint only after tracer/tracee cleanup.
 if(timedOut||state.error||state.code!==0||stderr)throw new Error('Observer unavailable or incomplete');
 if(fs.statSync(trace).size>1048576)throw new Error('Audit trace exceeded probe limit');
 const bytes=fs.readFileSync(trace,'utf8');
 const lines=bytes.split('\n');
 const denied=(operation,target)=>lines.filter(line=>line.includes('"'+target+'"')&&operation.test(line)&&/= -1 (EROFS|EACCES|EPERM)\b/.test(line));
 const cases=[
  ['direct update',/openat\(.*O_WRONLY/,'/inputs/protected.txt'],
  ['symlink update',/openat\(.*O_WRONLY/,'/inputs/symlink.txt'],
  ['hardlink update',/openat\(.*O_WRONLY/,'/inputs/hardlink.txt'],
  ['protected create',/openat\(.*O_WRONLY/,'/inputs/new.txt'],
  ['protected delete',/unlink(at)?\(/,'/inputs/protected.txt'],
  ['descendant create',/openat\(.*O_WRONLY/,'/inputs/descendant.txt'],
  ['audit overwrite',/openat\(.*O_WRONLY/,'/audit/syscalls.log'],
  ['audit read',/openat\(.*O_RDONLY/,'/audit/syscalls.log']
 ].map(([name,operation,target])=>({name,observed:denied(operation,target).length>0}));
 cases.push({name:'observer signal',observed:lines.some(line=>/kill\(\d+, SIGTERM\)\s+= -1 EPERM/.test(line))});
 const protectedUnchanged=protectedBefore===sha(fs.readFileSync('/inputs/protected.txt'));
 const scratchAllowed=fs.readFileSync('/tmp/allowed.txt','utf8')==='private scratch';
 const cleanClaim=stdout.trim()==='RUNNER_REPORT_FINISHED';
 const pass=cases.every(c=>c.observed)&&protectedUnchanged&&scratchAllowed&&cleanClaim;
 console.log(JSON.stringify({schemaVersion:1,scope:'fixed neutral syscall-audit probe',realRunnerQualified:false,status:pass?'PROBE_PASSED':'PROBE_FAILED',workloadReportedFinished:cleanClaim,cleanupConfirmed:true,protectedUnchanged,scratchAllowed,cases,traceSha256:sha(bytes),trace:bytes}));
 process.exitCode=pass?0:1;
}catch(error){console.error(error.message);process.exitCode=1;}finally{clearTimeout(timer);if(state)try{await stop(state,2000);}catch{process.exitCode=1;}}
