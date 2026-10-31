// Credential-free observer integration component. Does not activate the real coordinator.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {prepareSession,startSession,finishSession,recoverSession,finalizeAuditSession} from './container-session.mjs';
import {collectVerifierArtifacts} from './verifier-session.mjs';
import {analyzeSyscallTrace} from './syscall-audit.mjs';
export async function runAuditSession(options,{timeoutMs=30000,signal}={}){
 const session=prepareSession({...options,audit:true});
 try{
  startSession(session);await finishSession(session,{timeoutMs,signal,deferSuccess:true});
  // Recheck ownership and shutdown before copying observer-owned native volume files.
  collectVerifierArtifacts(session);
  const volume=JSON.parse(execFileSync(session.docker,['volume','inspect',session.j.auditVolume],{encoding:'utf8',timeout:30000,maxBuffer:1048576}))[0];
  if(volume.Name!==session.j.auditVolume||volume.Labels?.['software-factory.session']!==session.j.runId)throw new Error('Audit volume ownership mismatch');
  const destination=session.j.outputBindings.find(b=>b.target==='/audit').source;
  if(fs.readdirSync(destination).length)throw new Error('Audit collection destination is not empty');
  for(const name of ['trace','stdout','stderr','receipt.json'])execFileSync(session.docker,['cp',session.j.containerId+':/audit/'+name,path.join(destination,name)],{timeout:30000,stdio:'pipe'});
  const artifacts=collectVerifierArtifacts(session);
  function read(name){
   const target='/audit/'+name,a=artifacts.find(x=>x.path===target);
   if(!a)throw new Error('Missing independent audit artifact');
   const bytes=fs.readFileSync(path.join(session.j.outputBindings.find(b=>b.target==='/audit').source,name));
   if(crypto.createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw new Error('Audit artifact changed');return bytes;
  }
  const receipt=JSON.parse(read('receipt.json'));
  if(receipt.schemaVersion!==1||receipt.trace!=='all'||receipt.exitCode!==session.j.exitCode)throw new Error('Invalid observer receipt');
  const analysis=analyzeSyscallTrace(read('trace'));
  const result=finalizeAuditSession(session,{analysis,artifacts});
  return {scope:'credential-free audited container component',realRunnerQualified:false,journal:session.file,phase:result.phase,exitCode:result.exitCode,cleanupConfirmed:result.cleanupConfirmed,analysis,artifacts};
 }catch(error){
  if(session.j.cleanupConfirmed&&['PENDING_EVIDENCE','FAILED','INTERRUPTED','TIMED_OUT'].includes(session.j.phase))finalizeAuditSession(session,{error:true});
  else if(!session.j.cleanupConfirmed)recoverSession({docker:session.docker,directory:path.dirname(session.file)});
  throw error;
 }
}

export function checkAuditSession({docker,directory}){
 const file=path.join(fs.realpathSync(directory),'container-journal.json'),st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==process.getuid()||(st.mode&0o077))throw new Error('Unsafe audit journal');
 const j=JSON.parse(fs.readFileSync(file,'utf8'));
 if(j.phase!=='AUDIT_COLLECTED'||!j.audit||!j.cleanupConfirmed||j.exitCode!==0)throw new Error('Audit is not a successful collection');
 const artifacts=collectVerifierArtifacts({docker,j});
 if(JSON.stringify(artifacts)!==JSON.stringify(j.auditArtifacts))throw new Error('Stale audit artifacts');
 return {phase:j.phase,realRunnerQualified:false,artifacts};
}
