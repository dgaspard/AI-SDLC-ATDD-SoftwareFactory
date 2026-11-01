// Owner-side integration; the coding process receives only a model capability and isolated files.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {runVerifierSession} from './verifier-session.mjs';import {recoverSession} from './container-session.mjs';
import {clone,digest,read,need,entire} from './change-support.mjs';
export async function openOwnerBroker(profile,runId){
 const {createProfileModelBroker}=await import('./aws/converse.mjs');
 const audit=[];const broker=await createProfileModelBroker({runId,region:profile.broker.region,profile:profile.broker.profile,model:profile.broker.model,audit:e=>audit.push(e)});
 await new Promise((resolve,reject)=>{broker.server.once('error',reject);broker.server.listen(0,'127.0.0.1',resolve);});
 return {broker,audit,channel:{endpoint:`http://127.0.0.1:${broker.server.address().port}/v1/responses`,token:broker.token}};
}
export function confirmRealCleanup(c){
 const directory=path.join(c.output,'real-implementation/execution'),file=path.join(directory,'container-journal.json');
 if(!fs.existsSync(file))return;const j=read(file);
 if(!j.cleanupConfirmed)recoverSession({docker:c.realProfile.docker.path,directory});
 need(read(file).cleanupConfirmed,'COORDINATOR_ERROR','Coding container cleanup not confirmed');
}
export async function verifyRealCandidate(c,{factory,runId,signal}){
 const p=c.realProfile,factoryInput=path.join(c.output,'verifier-factory');
 clone(factory,factoryInput,c.authority.factoryRevision,'factory/verification/'+runId);
 const roots=[c.config.testing.results,c.config.testing.evidence];for(const relative of roots)fs.mkdirSync(path.join(c.verificationRoot,relative),{recursive:true});
 const trust=read(c.consumerTrust),expected={repository:c.authority.consumerRepository,revision:c.authority.startRevision,treeSha256:c.evidence.consumer.candidateTreeSha256,factoryRevision:c.authority.factoryRevision,configSha256:trust.configSha256,policySha256:digest(c.consumerTrust),manifestSha256:trust.protectedManifestSha256,requiredSuites:trust.requiredSuites,requiredEvidence:trust.requiredEvidence};
 const binding={root:'/workspace',outputs:roots.map(x=>'/workspace/'+x),protectedPaths:c.protectedPaths.map(x=>'/workspace/'+x.replace(/\/$/,'')),resources:p.verifier.resources};
 for(const d of p.verifier.dependencies){const base=d.target.startsWith('/workspace/')?c.verificationRoot:factoryInput;const prefix=d.target.startsWith('/workspace/')?'/workspace/':'/opt/factory/';fs.mkdirSync(path.join(base,d.target.slice(prefix.length)),{recursive:true});}
 const directory=path.join(c.output,'real-verification');
 const options={docker:p.docker.path,image:p.verifier.image,argv:['node','/opt/factory/tools/factory/verifier-entry.mjs','--config',c.authority.consumerConfig,'--trust','/trust/consumer.json'],directory,forbiddenRoots:[c.root,factory],filesystem:{root:c.verificationRoot,permissions:{create:[],update:[],delete:[]}},verification:binding,readonlyInputs:[{source:factoryInput,target:'/opt/factory'},{source:c.consumerTrust,target:'/trust/consumer.json'},...p.verifier.dependencies.map(({source,target})=>({source,target}))]};
 const r=await runVerifierSession(options,{signal});
 need(r.cleanupConfirmed,'COORDINATOR_ERROR','Verifier cleanup incomplete');
 const j=read(r.journal);
 for(const b of j.outputBindings){const dest=path.join(c.verificationRoot,path.posix.relative('/workspace',b.target));fs.cpSync(b.source,dest,{recursive:true,verbatimSymlinks:true});}
 const logs=execFileSync(p.docker.path,['logs',j.containerId],{encoding:'utf8',timeout:30000,maxBuffer:2097152,stdio:['ignore','pipe','pipe']});
 fs.writeFileSync(path.join(c.output,'verification.log'),logs,{mode:0o600});
 const responses=logs.trim().split('\n').flatMap(line=>{try{const v=JSON.parse(line);return v&&typeof v.status==='string'?[v]:[];}catch{return [];}});
 const result=responses.at(-1);need(result,'EVIDENCE_INVALID','Missing verifier result');
 // Full envelope validation still occurs in the coordinator after final input checks.
 for(const d of p.verifier.dependencies)need(entire(d.source)===d.sha256,'TRUST_INVALID','Verifier dependency changed during execution');
 return {exitCode:r.exitCode,result,expected,journal:r.journal};
}
export function realEvidenceArtifacts(c){
 const files=['model-audit.json','real-implementation/task-result.json','real-implementation/execution/container-journal.json','real-verification/container-journal.json'];
 const audit=path.join(c.output,'real-implementation/execution/audit');for(const name of fs.readdirSync(audit))files.push('real-implementation/execution/audit/'+name);
 return files.map(relative=>{const file=path.join(c.output,relative),st=fs.lstatSync(file);need(st.isFile()&&st.nlink===1&&!st.isSymbolicLink(),'EVIDENCE_INVALID','Invalid real execution artifact');return {path:relative,sha256:digest(file)};});
}
export async function checkRealExecution(c){
 process.env.DOCKER_HOST=c.realProfile.docker.endpoint;
 const {checkNativeAuditSession}=await import('./native-audit-session.mjs');
 checkNativeAuditSession({docker:c.realProfile.docker.path,directory:path.join(c.output,'real-implementation/execution')});
 const {collectVerifierArtifacts}=await import('./verifier-session.mjs');
 const j=read(path.join(c.output,'real-verification/container-journal.json'));
 need(j.phase==='OUTPUTS_COLLECTED'&&j.exitCode===0,'EVIDENCE_INVALID','Verifier is not successful');
 need(JSON.stringify(collectVerifierArtifacts({docker:c.realProfile.docker.path,j}))===JSON.stringify(j.artifacts),'EVIDENCE_INVALID','Verifier artifacts changed');
}
