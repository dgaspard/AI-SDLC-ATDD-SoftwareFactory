import {dockerCommand} from './docker-command.mjs';
// Offline verifier execution component. Does not authorize a runner or qualify a change.
import fs from 'node:fs';
import {validateConsumerProof} from './consumer-proof.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {prepareSession,startSession,finishSession,recoverSession,finalizeVerifierSession} from './container-session.mjs';

// Only consume outputs after the owned verifier container is confirmed stopped.
// Evidence content validity and consumer identity still belong to consumer.mjs/coordinator.
export function collectVerifierArtifacts(session){
 const {docker,j}=session;
 const info=JSON.parse(dockerCommand(docker,['inspect',j.containerId]))[0];
 if(!j.cleanupConfirmed||info.Id!==j.containerId||info.Name!=='/'+j.containerName||info.Config.Image!==j.image||info.Config.Labels?.['software-factory.session']!==j.runId||info.State.Running||info.State.Paused||info.State.Restarting||info.State.Pid!==0)throw new Error('Verifier cleanup not confirmed');
 const artifacts=[];
 function walk(directory,target){
  const stat=fs.lstatSync(directory);
  if(!stat.isDirectory()||fs.realpathSync(directory)!==directory)throw new Error('Aliased evidence directory');
  for(const name of fs.readdirSync(directory).sort()){
   const file=path.join(directory,name),destination=path.posix.join(target,name),before=fs.lstatSync(file);
   if(before.isDirectory()){walk(file,destination);continue;}
   if(!before.isFile()||before.nlink!==1)throw new Error('Nonregular or aliased evidence file');
   const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
   try{
    const current=fs.fstatSync(fd);
    if(!current.isFile()||current.nlink!==1||current.dev!==before.dev||current.ino!==before.ino)throw new Error('Evidence changed during open');
    const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(65536);let bytes;
    while((bytes=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,bytes));
    const after=fs.fstatSync(fd);
    if(after.size!==current.size||after.mtimeMs!==current.mtimeMs||after.ctimeMs!==current.ctimeMs||after.nlink!==1)throw new Error('Evidence changed during read');
    artifacts.push({path:destination,sha256:hash.digest('hex')});
   }finally{fs.closeSync(fd);}
  }
 }
 for(const binding of j.outputBindings)walk(binding.source,binding.target);
 return artifacts;
}
export async function runVerifierSession(options,{timeoutMs=1800000,signal,consumerEvidence}={}){
 if(!options.verification)throw new Error('Verification profile required');
 const session=prepareSession(options);
 try{
  startSession(session);
  await finishSession(session,{timeoutMs,signal,deferSuccess:true});
  // finishSession returns a snapshot; artifact collection uses the durable session state.
  const artifacts=collectVerifierArtifacts(session);
  if(consumerEvidence!==undefined){
   if(session.j.phase!=='PENDING_EVIDENCE')throw new Error('Consumer verification did not exit successfully');
   const target='/workspace/'+consumerEvidence.path;
   const collected=artifacts.find(a=>a.path===target);
   if(!collected)throw new Error('Missing consumer envelope');
   const binding=session.j.outputBindings.find(b=>target.startsWith(b.target+'/'));
   if(!binding)throw new Error('Consumer envelope outside outputs');
   const bytes=fs.readFileSync(path.join(binding.source,path.posix.relative(binding.target,target)));
   if(crypto.createHash('sha256').update(bytes).digest('hex')!==collected.sha256)throw new Error('Consumer envelope changed after collection');
   validateConsumerProof(JSON.parse(bytes),consumerEvidence.expected,artifacts.map(a=>({path:path.posix.relative('/workspace',a.path),sha256:a.sha256})));
  }
  const terminal=finalizeVerifierSession(session,{artifacts});
  return {scope:'isolated-verifier-component',realRunnerQualified:false,journal:session.file,
   phase:terminal.phase,exitCode:terminal.exitCode,cleanupConfirmed:terminal.cleanupConfirmed,artifacts};
 }catch(error){
  if(session.j.cleanupConfirmed&&['PENDING_EVIDENCE','FAILED','INTERRUPTED','TIMED_OUT'].includes(session.j.phase))finalizeVerifierSession(session,{error:true});
  if(!session.j.cleanupConfirmed)recoverSession({docker:session.docker,directory:path.dirname(session.file)});
  throw error; // Invalid evidence cannot be returned as a successful verifier result.
 }
}
