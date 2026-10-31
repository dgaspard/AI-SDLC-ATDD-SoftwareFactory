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
function filesystemPlan(filesystem,forbiddenRoots,destination){
 if(filesystem===undefined)return {args:[],binding:null};
 if(!filesystem||Object.keys(filesystem).sort().join(',')!=='permissions,root')throw new Error('Invalid filesystem profile');
 const {root,permissions}=filesystem;
 if(typeof root!=='string'||!path.isAbsolute(root)||root.includes(',')||fs.realpathSync(root)!==root||!fs.statSync(root).isDirectory())throw new Error('Expected canonical isolated workspace');
 for(const forbidden of [...forbiddenRoots,destination])if(inside(forbidden,root)||inside(root,forbidden))throw new Error('Workspace overlaps protected input or session evidence');
 if(!permissions||Object.keys(permissions).sort().join(',')!=='create,delete,update'||Object.values(permissions).some(a=>!Array.isArray(a)))throw new Error('Invalid filesystem permissions');
 if(permissions.create.length||permissions.delete.length)throw new Error('Source create/delete isolation unavailable in update-only profile');
 // Read-only bind mounts do not prevent connecting to Unix sockets. No host IPC
 // or device nodes may enter the private workspace, including ignored files.
 function regularTree(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const child=path.join(dir,entry.name),st=fs.lstatSync(child);
  if(st.isDirectory())regularTree(child);
  else if(!st.isFile()&&!st.isSymbolicLink())throw new Error('Special file in isolated workspace');
 }}
 regularTree(root);
 const seen=new Set(),files=[];
 for(const relative of permissions.update){
  if(typeof relative!=='string'||!relative||relative.includes(',')||relative.includes('\0')||relative.includes('\\')||path.isAbsolute(relative)||relative.split('/').some(p=>!p||p==='.'||p==='..')||seen.has(relative))throw new Error('Invalid literal update grant');
  seen.add(relative);const file=path.join(root,relative),stat=fs.lstatSync(file);
  if(fs.realpathSync(file)!==file||!stat.isFile()||stat.nlink!==1)throw new Error('Update grant must be an unaliased regular file');
  files.push({relative,source:file});
 }
 return {binding:{root,permissions},args:['--mount',`type=bind,src=${root},dst=/workspace,readonly`,...files.flatMap(f=>['--mount',`type=bind,src=${f.source},dst=/workspace/${f.relative}`])]};
}
export function prepareSession({docker,image,argv,directory,forbiddenRoots=[],filesystem,verification,audit=false,readonlyInputs=[]}){
 if(!path.isAbsolute(docker)||!/^sha256:[a-f0-9]{64}$/.test(image)||!Array.isArray(argv)||!argv.length||argv.some(x=>typeof x!=='string'||!x||x.includes('\0')))
  throw new Error('Invalid immutable container invocation');
 if(!path.isAbsolute(directory)||fs.existsSync(directory)||fs.lstatSync(path.dirname(directory)).isSymbolicLink())throw new Error('Expected new canonical external session directory');
 const dest=path.join(fs.realpathSync(path.dirname(directory)),path.basename(directory));
 for(const root of [factory,...forbiddenRoots].map(p=>fs.realpathSync(p)))if(inside(root,dest)||inside(dest,root))throw new Error('Session directory overlaps protected input');
 const roots=[factory,...forbiddenRoots].map(p=>fs.realpathSync(p));
 const profile=filesystemPlan(filesystem,roots,dest);
 // Verification uses a read-only isolated source mount and a provisioned image.
 // Targets and protected paths must come from the trusted consumer profile.
 if(typeof audit!=='boolean'||(audit&&verification))throw new Error('Invalid audit profile');
 let outputBindings=[];
 let limits={memoryMiB:512,pids:128,scratchMiB:128,shmMiB:64,executableScratch:false};
 if(verification!==undefined){
  if(!filesystem||filesystem.permissions.update.length||!verification||Object.keys(verification).some(k=>!['outputs','protectedPaths','root','resources'].includes(k)))throw new Error('Invalid verification profile');
  const {root,outputs,protectedPaths}=verification;
  if(verification.resources!==undefined){
   const r=verification.resources;
   if(!r||Object.keys(r).sort().join(',')!=='executableScratch,memoryMiB,pids,scratchMiB,shmMiB'||typeof r.executableScratch!=='boolean'||!Number.isInteger(r.memoryMiB)||r.memoryMiB<512||r.memoryMiB>4096||!Number.isInteger(r.pids)||r.pids<128||r.pids>1024||!Number.isInteger(r.scratchMiB)||r.scratchMiB<128||r.scratchMiB>1024||!Number.isInteger(r.shmMiB)||r.shmMiB<64||r.shmMiB>512)throw new Error('Invalid bounded verifier resources');
   limits={...r};
  }
  const absolute=p=>typeof p==='string'&&p.startsWith('/')&&p!=='/'&&!p.includes(',')&&!p.includes('\\')&&!p.includes('\0')&&p.split('/').slice(1).every(x=>x&&x!=='.'&&x!=='..');
  if(root!=='/workspace'||!Array.isArray(outputs)||!outputs.length||!Array.isArray(protectedPaths)||!protectedPaths.length||!protectedPaths.every(absolute))throw new Error('Invalid verification paths');
  const protectedRoots=[...protectedPaths,...['.git','.github','.claude','AGENTS.md','CLAUDE.md'].map(x=>root+'/'+x)];
  for(const target of outputs){
   if(!absolute(target)||!inside(root,target)||target===root||[...protectedRoots,...outputBindings.map(x=>x.target)].some(p=>inside(p,target)||inside(target,p)))throw new Error('Verification output overlaps protected or output path');
   const inputTarget=path.join(filesystem.root,path.relative(root,target));
   if(fs.realpathSync(inputTarget)!==inputTarget||!fs.statSync(inputTarget).isDirectory())throw new Error('Verification output must be an existing unaliased directory');
   outputBindings.push({target,source:path.join(dest,'outputs',String(outputBindings.length))});
  }
 }
 // Additional verifier inputs are owner-provisioned dependencies, factory and trust, never runner-selected.
 if(!Array.isArray(readonlyInputs)||(!verification&&readonlyInputs.length))throw Error('Read-only inputs require verifier profile');
 const readBindings=[];
 for(const input of readonlyInputs){
  if(!input||Object.keys(input).sort().join()!=='source,target'||typeof input.source!=='string'||!path.isAbsolute(input.source)||input.source.includes(',')||fs.realpathSync(input.source)!==input.source||typeof input.target!=='string'||!/^\/(?:opt\/factory(?:\/[\w.-]+)*|trust\/[\w.-]+|workspace\/(?:[\w.-]+\/)*node_modules)$/.test(input.target))throw Error('Invalid read-only verifier input');
  if(outputBindings.some(b=>inside(b.target,input.target)||inside(input.target,b.target))||readBindings.some(b=>b.target===input.target))throw Error('Read-only input overlaps output/input');
  function safe(file){const st=fs.lstatSync(file);if(st.isDirectory()){for(const n of fs.readdirSync(file))safe(path.join(file,n));}else if(st.isSymbolicLink()){if(!inside(input.source,fs.realpathSync(file)))throw Error('External dependency alias');}else if(!st.isFile())throw Error('Special read-only input');}
  safe(input.source);readBindings.push({...input});
 }
 // All destination and filesystem checks precede even a Docker read operation.
 const runId=crypto.randomUUID(),containerName='factory-session-'+runId;
 if(!absent(docker,containerName))throw new Error('Container name already exists');
 const imageInfo=JSON.parse(command(docker,['image','inspect',image]))[0]; // Cached image required; no pull.
 if(Object.keys(imageInfo.Config.Volumes??{}).length)throw new Error('Implicit image volumes are forbidden');
 fs.mkdirSync(dest,{mode:0o700});const parentFd=fs.openSync(path.dirname(dest),'r');try{fs.fsyncSync(parentFd);}finally{fs.closeSync(parentFd);}const file=path.join(dest,'container-journal.json');
 if(audit){const source=path.join(dest,'audit');fs.mkdirSync(source,{mode:0o700});outputBindings.push({target:'/audit',source});}
 for(const binding of outputBindings.filter(b=>b.target!=='/audit')){fs.mkdirSync(binding.source,{recursive:true,mode:0o700});fs.chmodSync(binding.source,0o777);}
 const auditVolume=audit?containerName+'-audit':null;
 const outputArgs=outputBindings.flatMap(b=>['--mount',b.target==='/audit'?`type=volume,src=${auditVolume},dst=/audit,volume-nocopy`:`type=bind,src=${b.source},dst=${b.target}`]);
 const j={schemaVersion:1,runId,containerName,containerId:null,image,argv,audit,auditVolume,resources:limits,verification:verification??null,outputBindings,filesystem:profile.binding,readonlyInputs:readBindings,phase:'PREPARED',cleanupConfirmed:false,exitCode:null};
 save(file,j); // Name and run label durable BEFORE create/start; recover even across lost create response.
 if(audit){
  if(command(docker,['volume','ls','--filter','name=^'+auditVolume+'$','--format','{{.Name}}']))throw new Error('Audit volume already exists');
  command(docker,['volume','create','--label',label+'='+runId,auditVolume]);
 }
 const id=command(docker,['create','--pull=never','--name',containerName,'--label',label+'='+runId,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user',audit?'0:0':'65534:65534',...(audit?['--cap-add=SETUID','--cap-add=SETGID','--cap-add=SYS_PTRACE']:[]),'--pids-limit='+limits.pids,'--memory='+limits.memoryMiB+'m','--cpus=2','--restart=no','--no-healthcheck','--log-driver=json-file','--log-opt=max-size=10m','--log-opt=max-file=1','--memory-swap='+limits.memoryMiB+'m','--shm-size='+limits.shmMiB+'m','--tmpfs',`/tmp:rw,${limits.executableScratch?'exec':'noexec'},nosuid,nodev,size=${limits.scratchMiB}m,mode=1777`,...profile.args,...readBindings.flatMap(b=>['--mount',`type=bind,src=${b.source},dst=${b.target},readonly`]),...outputArgs,...(verification?['--workdir','/workspace']:[]),'--entrypoint',audit?'/usr/local/bin/node':argv[0],image,...(audit?['/opt/factory/audited-runner.mjs',...argv]:argv.slice(1))]);
 if(!/^[a-f0-9]{64}$/.test(id))throw new Error('Invalid container identity');
 j.containerId=id;assertIdentity(inspect(docker,id),j);j.phase='CREATED';save(file,j);
 return {docker,file,j};
}
export function startSession(session){
 const {docker,file,j}=session;if(j.phase!=='CREATED')throw new Error('Session is not ready to start');
 assertIdentity(inspect(docker,j.containerId),j);
 j.phase='STARTING';save(file,j);command(docker,['start',j.containerId]);j.phase='RUNNING';save(file,j);
}
export async function finishSession(session,{timeoutMs=30000,signal,deferSuccess=false}={}){
 if(typeof deferSuccess!=='boolean')throw new Error('Invalid finalization mode');
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
  j.phase=reason==='interrupted'?'INTERRUPTED':reason==='timeout'?'TIMED_OUT':j.exitCode===0?(deferSuccess?'PENDING_EVIDENCE':'COMPLETE'):'FAILED';
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

// Only verifier sessions defer success until their output collection has completed.
export function finalizeVerifierSession(session,{artifacts,error=false}){
 const {docker,file,j}=session;
 if(!j.verification||!j.cleanupConfirmed||!['PENDING_EVIDENCE','FAILED','INTERRUPTED','TIMED_OUT'].includes(j.phase))throw new Error('Verifier cannot finalize');
 shutdown(docker,j);
 j.verificationStatus=error?'INVALID':'COLLECTED';
 if(j.phase==='PENDING_EVIDENCE')j.phase=error?'EVIDENCE_INVALID':'OUTPUTS_COLLECTED';
 j.artifacts=error?null:artifacts;
 save(file,j);
 return {...j};
}

export function finalizeAuditSession(session,{analysis,artifacts,error=false}){
 const {docker,file,j}=session;
 if(!j.audit||!j.cleanupConfirmed||!['PENDING_EVIDENCE','FAILED','INTERRUPTED','TIMED_OUT'].includes(j.phase))throw new Error('Audit cannot finalize');
 shutdown(docker,j);
 j.auditAnalysis=analysis??null;j.auditArtifacts=artifacts??null;
 if(j.phase==='PENDING_EVIDENCE')j.phase=error?'AUDIT_INVALID':analysis?.denials?.length?'PERMISSION_DENIED':(analysis?.mutationFailures?.length||analysis?.unsupportedFailures?.length)?'AUDIT_UNRESOLVED':'AUDIT_COLLECTED';
 save(file,j);return {...j};
}
