// Explicit native component qualification. No governed-runner activation.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
import {prepareSession,startSession,finishSession,recoverSession,finalizeAuditSession} from './container-session.mjs';
import {validateNativeProof} from './native-audit-proof.mjs';
import {collectVerifierArtifacts} from './verifier-session.mjs';
export async function runNativeAuditSession(options,{timeoutMs=60000,signal,afterStart,afterCleanup}={}){
 const deadline=Date.now()+timeoutMs;
 const session=prepareSession({...options,audit:true});let ownerCleanup=false;
 async function closeOwner(){if(!ownerCleanup){ownerCleanup=true;await afterCleanup?.(session);}}
 try{
  startSession(session);await afterStart?.(session);
  const remaining=deadline-Date.now();if(remaining<=0)throw Error('Native session deadline expired during startup');
  await finishSession(session,{timeoutMs:remaining,signal,deferSuccess:true});await closeOwner();
  collectVerifierArtifacts(session);
  const volume=JSON.parse(execFileSync(session.docker,['volume','inspect',session.j.auditVolume],{encoding:'utf8',timeout:30000,maxBuffer:1048576}))[0];
  if(volume.Name!==session.j.auditVolume||volume.Labels?.['software-factory.session']!==session.j.runId)throw Error('Audit volume identity mismatch');
  const destination=session.j.outputBindings.find(x=>x.target==='/audit').source;if(fs.readdirSync(destination).length)throw Error('Nonempty audit destination');
  for(const name of ['native-trace.jsonl','native-identities.jsonl','native-receipt.json','stdout','stderr'])execFileSync(session.docker,['cp',session.j.containerId+':/audit/'+name,path.join(destination,name)],{timeout:30000,stdio:'pipe'});
  const artifacts=collectVerifierArtifacts(session);
  function read(name){
   const bytes=fs.readFileSync(path.join(destination,name));
   if(crypto.createHash('sha256').update(bytes).digest('hex')!==artifacts.find(x=>x.path==='/audit/'+name)?.sha256)throw Error('Stale native artifact: '+name);
   return bytes;
  }
  const receipt=JSON.parse(read('native-receipt.json'));
  const proof=validateNativeProof(receipt,read('native-trace.jsonl'),read('native-identities.jsonl'),session.j.exitCode);
  const analysis={scope:'native component only',denials:receipt.denials?[{count:receipt.denials}]:[],unsupportedFailures:receipt.exitCode===5?[{reason:'native observer unavailable'}]:[],mutationFailures:[]};
  const terminal=finalizeAuditSession(session,{analysis,artifacts});
  return {scope:'native observer component only',realRunnerQualified:false,journal:session.file,phase:terminal.phase,exitCode:terminal.exitCode,cleanupConfirmed:terminal.cleanupConfirmed,receipt,proof,artifacts};
 }catch(error){
  try{
   if(session.j.cleanupConfirmed&&['PENDING_EVIDENCE','FAILED','INTERRUPTED','TIMED_OUT'].includes(session.j.phase))finalizeAuditSession(session,{error:true});
   else if(!session.j.cleanupConfirmed)recoverSession({docker:session.docker,directory:path.dirname(session.file)});
  }finally{await closeOwner();}
  throw error;
 }
}

export function checkNativeAuditSession({docker,directory}){
 const file=path.join(fs.realpathSync(directory),'container-journal.json'),st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==process.getuid()||(st.mode&0o077))throw Error('Unsafe native audit journal');
 const j=JSON.parse(fs.readFileSync(file,'utf8'));
 if(j.phase!=='AUDIT_COLLECTED'||!j.audit||!j.cleanupConfirmed||j.exitCode!==0)throw Error('Native audit is not a successful collection');
 const artifacts=collectVerifierArtifacts({docker,j});
 if(JSON.stringify(artifacts)!==JSON.stringify(j.auditArtifacts))throw Error('Stale native artifacts');
 return {phase:j.phase,realRunnerQualified:false,artifacts};
}
