// Local container lifecycle component. Not a qualified coding-agent launcher.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const factory=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
const label='software-factory.session';
const inside=(a,b)=>b===a||b.startsWith(a+path.sep);
function save(file,value){
 const temp=file+'.'+crypto.randomUUID()+'.tmp';const fd=fs.openSync(temp,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(temp,file);
 const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
}
function command(docker,args){return execFileSync(docker,args,{encoding:'utf8',timeout:30000,maxBuffer:1048576,stdio:['ignore','pipe','pipe']}).trim();}
function inspect(docker,id){return JSON.parse(command(docker,['inspect',id]))[0];}
function assertIdentity(info,j){
 if(info.Id!==j.containerId||info.Name!=='/'+j.containerName||info.Config.Labels?.[label]!==j.runId||info.Config.Image!==j.image)
  throw new Error('Container ownership identity mismatch');
}
function absent(docker,name){
 // A failed daemon query must never be interpreted as a missing container.
 return !command(docker,['container','ls','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']).split('\n').includes(name);
}
function shutdown(docker,j){
 let info=inspect(docker,j.containerId);assertIdentity(info,j);
 if(info.State.Running){command(docker,['stop','--signal','SIGTERM','--timeout','2',j.containerId]);info=inspect(docker,j.containerId);assertIdentity(info,j);}
 if(info.State.Running||info.State.Paused||info.State.Restarting||info.State.Pid!==0)throw new Error('Container cleanup not confirmed');
 return info;
}
export function prepareSession({docker,image,argv,directory,forbiddenRoots=[]}){
 if(!path.isAbsolute(docker)||!/^sha256:[a-f0-9]{64}$/.test(image)||!Array.isArray(argv)||!argv.length||argv.some(x=>typeof x!=='string'||!x||x.includes('\0')))
  throw new Error('Invalid immutable container invocation');
 if(!path.isAbsolute(directory)||fs.existsSync(directory)||fs.lstatSync(path.dirname(directory)).isSymbolicLink())throw new Error('Expected new canonical external session directory');
 const dest=path.join(fs.realpathSync(path.dirname(directory)),path.basename(directory));
 for(const root of [factory,...forbiddenRoots].map(p=>fs.realpathSync(p)))if(inside(root,dest)||inside(dest,root))throw new Error('Session directory overlaps protected input');
 // All destination checks precede even a Docker read operation.
 const runId=crypto.randomUUID(),containerName='factory-session-'+runId;
 if(!absent(docker,containerName))throw new Error('Container name already exists');
 const imageInfo=JSON.parse(command(docker,['image','inspect',image]))[0]; // Cached image required; no pull.
 if(Object.keys(imageInfo.Config.Volumes??{}).length)throw new Error('Implicit image volumes are forbidden');
 fs.mkdirSync(dest,{mode:0o700});const parentFd=fs.openSync(path.dirname(dest),'r');try{fs.fsyncSync(parentFd);}finally{fs.closeSync(parentFd);}const file=path.join(dest,'container-journal.json');
 const j={schemaVersion:1,runId,containerName,containerId:null,image,argv,phase:'PREPARED',cleanupConfirmed:false,exitCode:null};
 save(file,j); // Name and run label durable BEFORE create/start; recover even across lost create response.
 const id=command(docker,['create','--pull=never','--name',containerName,'--label',label+'='+runId,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user','65534:65534','--pids-limit=128','--memory=512m','--cpus=2','--restart=no','--no-healthcheck','--log-driver=json-file','--log-opt=max-size=10m','--log-opt=max-file=1','--memory-swap=512m','--tmpfs','/tmp:rw,nosuid,nodev,size=128m,mode=1777','--entrypoint',argv[0],image,...argv.slice(1)]);
 if(!/^[a-f0-9]{64}$/.test(id))throw new Error('Invalid container identity');
 j.containerId=id;assertIdentity(inspect(docker,id),j);j.phase='CREATED';save(file,j);
 return {docker,file,j};
}
export function startSession(session){
 const {docker,file,j}=session;if(j.phase!=='CREATED')throw new Error('Session is not ready to start');
 assertIdentity(inspect(docker,j.containerId),j);
 j.phase='STARTING';save(file,j);command(docker,['start',j.containerId]);j.phase='RUNNING';save(file,j);
}
export async function finishSession(session,{timeoutMs=30000,signal}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>1800000)throw new Error('Invalid session timeout');
 const {docker,file,j}=session;if(j.phase!=='RUNNING')throw new Error('Session is not running');
 let reason='exited';
 try{
  const deadline=Date.now()+timeoutMs;
  for(;;){
   const info=inspect(docker,j.containerId);assertIdentity(info,j);
   if(signal?.aborted){reason='interrupted';break;}
   if(!info.State.Running)break;
   if(Date.now()>=deadline){reason='timeout';break;}
   await new Promise(r=>setTimeout(r,50));
  }
  const info=shutdown(docker,j); // Cleanup precedes terminal status and any future evidence validation.
  if(info.State.Status!=='exited'||!Number.isInteger(info.State.ExitCode))throw new Error('Invalid terminal container state');
  if(signal?.aborted)reason='interrupted';
  j.cleanupConfirmed=true;j.exitCode=info.State.ExitCode;
  j.phase=reason==='interrupted'?'INTERRUPTED':reason==='timeout'?'TIMED_OUT':j.exitCode===0?'COMPLETE':'FAILED';
  save(file,j);return {...j};
 }catch(error){
  j.phase='CLEANUP_FAILED';j.cleanupConfirmed=false;save(file,j);throw error;
 }
}

export function recoverSession({docker,directory}){
 const file=path.join(fs.realpathSync(directory),'container-journal.json');
 const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==process.getuid()||(st.mode&0o077))throw new Error('Unsafe recovery journal');
 const j=JSON.parse(fs.readFileSync(file,'utf8'));
 if(j.schemaVersion!==1||!/^factory-session-[a-f0-9-]{36}$/.test(j.containerName)||j.containerName!=='factory-session-'+j.runId||!/^sha256:[a-f0-9]{64}$/.test(j.image))throw new Error('Invalid recovery identity');
 if(!['PREPARED','CREATED','STARTING','RUNNING','CLEANUP_FAILED'].includes(j.phase))throw new Error('Terminal journal cannot be recovered or rewritten');
 if(j.containerId===null){
  if(absent(docker,j.containerName)){j.phase='INTERRUPTED';j.cleanupConfirmed=true;save(file,j);return j;}
  const info=inspect(docker,j.containerName);j.containerId=info.Id;assertIdentity(info,j);save(file,j);
 }
 const info=shutdown(docker,j);j.exitCode=info.State.ExitCode;j.cleanupConfirmed=true;
 // Recovery never promotes an incomplete run to success, even after exit zero.
 j.phase='INTERRUPTED';save(file,j);return j;
}
