#!/usr/bin/env node
// Explicit credential-free component qualification; does not enable a real launcher.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {prepareSession,startSession,finishSession,recoverSession} from './container-session.mjs';
import {collectVerifierArtifacts} from './verifier-session.mjs';
import {fileURLToPath} from 'node:url';
import {canonical,within} from './change-support.mjs';
const args=process.argv.slice(2),options={};
if(args.length!==6)throw new Error('Expected --docker, --image and --output');
for(let i=0;i<args.length;i+=2){if(!['--docker','--image','--output'].includes(args[i])||options[args[i]])throw new Error('Unknown or duplicate argument');options[args[i]]=args[i+1];}
const docker=options['--docker'],image=options['--image'],directory=canonical(options['--output']);
const factory=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
if(!path.isAbsolute(docker)||!/^sha256:[a-f0-9]{64}$/.test(image)||fs.existsSync(directory)||within(factory,directory)||within(directory,factory))throw new Error('Unsafe qualification output or tooling');
fs.mkdirSync(directory,{mode:0o700});
const p={directory,image},results=[],sessions=[];
function owned(options){const session=prepareSession(options);sessions.push(session);return session;}
try {
const protocolSession=owned({docker,image,argv:['node','/opt/protocol/broker-codex-probe.mjs','--codex','/opt/guarded-codex','--external-container-probe'],directory:path.join(directory,'protocol')});
startSession(protocolSession);const outer=await finishSession(protocolSession,{timeoutMs:60000});
const logs=execFileSync(docker,['logs',outer.containerId],{encoding:'utf8',timeout:30000,maxBuffer:1048576});fs.writeFileSync(path.join(directory,'protocol.stdout'),logs,{mode:0o600});
const lines=logs.trim().split('\n').map(JSON.parse),protocol=lines.find(x=>x.report&&typeof x.report==='object')?.report;
if(!protocol?.protocolPassed||!protocol.requiresOuterCleanup||protocol.passed||outer.exitCode!==0||outer.phase!=='COMPLETE'||!outer.cleanupConfirmed)throw new Error('Protocol or outer cleanup failed');
for(const mode of ['default','container']){
 const s=owned({docker,image:p.image,argv:['/opt/guard-check','inherit',mode],directory:path.join(p.directory,'native-'+mode)});startSession(s);const r=await finishSession(s);const receipt=execFileSync(docker,['logs',r.containerId],{encoding:'utf8',timeout:30000});if(r.phase!=='COMPLETE'||r.exitCode!==0||!r.cleanupConfirmed||!receipt.includes(mode==='default'?'DEFAULT_GUARD_CHECK_PASS':'CONTAINER_GUARD_CHECK_PASS'))throw new Error('Native guard failed');results.push({mode,journal:s.file,...r});
}
const root=path.join(p.directory,'detached-workspace');fs.mkdirSync(root);fs.mkdirSync(path.join(root,'results'));fs.mkdirSync(path.join(root,'spec'));
const child="const fs=require('fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.writeFileSync('/workspace/results/ticks',String(Date.now())),10);";
const code=`require('child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{detached:true,stdio:'ignore'});setInterval(()=>{},100);`;
const s=owned({docker,image:p.image,argv:['/opt/factory/syscall-guard','--container-owned','node','-e',code],directory:path.join(p.directory,'detached-session'),filesystem:{root,permissions:{create:[],update:[],delete:[]}},verification:{root:'/workspace',outputs:['/workspace/results'],protectedPaths:['/workspace/spec']}});startSession(s);
const ticks=path.join(s.j.outputBindings[0].source,'ticks');const deadline=Date.now()+5000;while(!fs.existsSync(ticks)){if(Date.now()>deadline)throw new Error('Detached writer did not start');await new Promise(r=>setTimeout(r,30));}
const terminal=await finishSession(s,{timeoutMs:100,deferSuccess:true});if(!terminal.cleanupConfirmed||terminal.phase!=='TIMED_OUT')throw new Error('Detached cleanup failed');
const first=collectVerifierArtifacts(s);await new Promise(r=>setTimeout(r,150));const after=collectVerifierArtifacts(s);if(JSON.stringify(first)!==JSON.stringify(after))throw new Error('Detached writer survived cleanup');results.push({kind:'detached-writer',journal:s.file,phase:terminal.phase,cleanupConfirmed:true,stableArtifacts:after});
fs.writeFileSync(path.join(directory,'checks.json'),JSON.stringify({scope:'credential-free external-container components, not complete launcher conformance',protocolPassed:true,outerCleanupConfirmed:true,results},null,2)+'\n');console.log('Protocol + both native guard modes + detached writer cleanup passed');

} finally {
 const failures=[];
 for(const session of sessions){
  const current=JSON.parse(fs.readFileSync(session.file,'utf8'));
  if(['PREPARED','CREATED','STARTING','RUNNING','CLEANUP_FAILED'].includes(current.phase)){
   try {recoverSession({docker,directory:path.dirname(session.file)});}catch(error){failures.push(error);}
  }
 }
 if(failures.length)throw new AggregateError(failures,'Qualification container cleanup failed');
}
