#!/usr/bin/env node
// Local governed-change coordinator. Real agents fail closed until a sandbox is qualified.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validate,verifyTrust} from './core.mjs';
import {codes,fail,need,object,digest,read,text,sha,relative,canonical,regular,git,resolve,within,tree,snapshot,differences,checkGrants,entire,atomic,clone,transfer,trackedDiff,spawnOwned,waitOwned,stop} from './change-support.mjs';
const factory=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
const result={schemaVersion:1,runId:crypto.randomUUID(),status:'FAILED',category:null,runDirectory:null,evidence:null};
let context=null,runnerProcess=null,verifierProcess=null,interrupted=false;
let interruptResolve;const interruption=new Promise(r=>interruptResolve=r);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{interrupted=true;interruptResolve();});
function journal(phase){context.journal.phase=phase;context.journal.updatedAt=new Date().toISOString();atomic(path.join(context.output,'journal.json'),context.journal);}
function digestInventory(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function equivalent(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function pinned(revision){need(git(factory,'rev-parse','HEAD')===revision&&!git(factory,'status','--porcelain','--untracked-files=all'),'VERSION_INCOMPATIBLE','Factory must be clean and match the immutable pin');}
function ownedPath(root,rel){relative(rel);const p=resolve(root,rel,false);need(p===path.join(root,rel),'REQUEST_INVALID','Path aliases are not allowed');return p;}
function external(p,root){const out=canonical(p);regular(out,'TRUST_INVALID');need(!within(root,out)&&!within(factory,out),'TRUST_INVALID','Authority and launcher must be external');return out;}
function validateRunner(r){object(r,['schemaVersion','kind','argv','executableSha256','inputs','timeoutMs','network']);need(r.schemaVersion===1&&['fixture','real'].includes(r.kind)&&['none','model-proxy'].includes(r.network),'REQUEST_INVALID','Unsupported launcher descriptor');need(Array.isArray(r.argv)&&r.argv.length>0&&r.argv.every(x=>typeof x==='string'&&x&&!x.includes('\0')),'REQUEST_INVALID','Invalid launcher argv');need(Number.isInteger(r.timeoutMs)&&r.timeoutMs>0&&r.timeoutMs<=1800000,'REQUEST_INVALID','Invalid runner timeout');sha(r.executableSha256);need(path.isAbsolute(r.argv[0]),'REQUEST_INVALID','Launcher executable must be absolute');regular(r.argv[0],'TOOLING_UNAVAILABLE');need(digest(r.argv[0])===r.executableSha256,'TRUST_INVALID','Launcher executable changed');need(Array.isArray(r.inputs),'REQUEST_INVALID','Launcher inputs required');const seen=new Set();for(const item of r.inputs){object(item,['path','sha256']);sha(item.sha256);need(path.isAbsolute(item.path)&&!seen.has(canonical(item.path)),'REQUEST_INVALID','Invalid/duplicate launcher input');seen.add(canonical(item.path));regular(item.path,'TOOLING_UNAVAILABLE');need(digest(item.path)===item.sha256,'TRUST_INVALID','Launcher input changed');}
 // There is deliberately no unrestricted "real" execution path.
 need(r.kind==='fixture','TOOLING_UNAVAILABLE','No OS-isolated real launcher and independent verification profile have been qualified; real execution is disabled');
 need(r.network==='none','TOOLING_UNAVAILABLE','Fixture protocol runs do not support model credentials or proxy access');
}
function preflight(o){
 const root=canonical(o.root);need(fs.realpathSync(root)===root&&git(root,'rev-parse','--show-toplevel')===root,'REQUEST_INVALID','Expected consumer Git root');need(!within(factory,root)&&!within(root,factory),'REQUEST_INVALID','Consumer/factory overlap');
 const authorityPath=external(o.authority,root),runnerPath=external(o.runner,root),authority=read(authorityPath,'TRUST_INVALID'),runner=read(runnerPath,'TRUST_INVALID');
 object(authority,['schemaVersion','taskSha256','startRevision','consumerRepository','factoryRevision','consumerConfig','consumerTrust','runnerSha256']);need(authority.schemaVersion===1,'REQUEST_INVALID','Unsupported authority');sha(authority.taskSha256);sha(authority.startRevision,40);sha(authority.factoryRevision,40);sha(authority.runnerSha256);text(authority.consumerRepository);
 const output=canonical(o.output);
 need(!fs.existsSync(output)&&![root,factory].some(x=>within(x,output)||within(output,x)),'REQUEST_INVALID','Output exists or overlaps source/factory');
 const consumerTrust=external(authority.consumerTrust,root);
 for(const input of [authorityPath,runnerPath,consumerTrust,...(runner.inputs??[]).map(i=>i.path)])need(!within(output,canonical(input)),'REQUEST_INVALID','Output overlaps authority');
 const taskPath=ownedPath(root,o.task);regular(taskPath,'TRUST_INVALID');need(digest(taskPath)===authority.taskSha256,'TRUST_INVALID','Task differs from reviewed authority');
 const task=read(taskPath);object(task,['schemaVersion','id','requirementPaths','intent','permissions']);need(task.schemaVersion===1&&/^[a-z0-9-]+$/.test(task.id),'REQUEST_INVALID','Invalid task');text(task.intent);object(task.permissions,['create','update','delete']);
 const configPath=ownedPath(root,authority.consumerConfig),config=read(configPath);
 const {outputs}=validate(config,root,factory);const {trust}=verifyTrust(root,config,configPath,consumerTrust,outputs);
 need(authority.consumerRepository===config.application.repository&&authority.factoryRevision===config.factory.revision,'TRUST_INVALID','Authority/config identity mismatch');
 const denied=[...trust.protectedPaths,'.git/','.github/','.claude/','AGENTS.md','CLAUDE.md',o.task,authority.consumerConfig,...Object.values(config.trust),config.testing.policy,...Object.values(config.locations).flat()];
 const protectedPath=p=>denied.some(x=>{const q=x.replace(/\/$/,'');return p===q||p.startsWith(q+'/');});
 need(Array.isArray(task.requirementPaths)&&task.requirementPaths.length>0&&new Set(task.requirementPaths).size===task.requirementPaths.length,'REQUEST_INVALID','Requirements required');
 for(const p of [o.task,...task.requirementPaths]){relative(p);regular(ownedPath(root,p),'TRUST_INVALID');need(trust.protectedPaths.some(x=>p===x||p.startsWith(x.endsWith('/')?x:x+'/')),'TRUST_INVALID','Task/requirement must be protected');git(root,'ls-files','--error-unmatch','--',p);}
 const seen=new Set();for(const operation of ['create','update','delete']){const paths=task.permissions[operation];need(Array.isArray(paths),'REQUEST_INVALID','Permission array required');for(const p of paths){relative(p);need(!seen.has(p)&&!protectedPath(p),'REQUEST_INVALID','Overlapping or protected grant: '+p);seen.add(p);const dest=ownedPath(root,p);need(operation==='create'?!fs.existsSync(dest):fs.existsSync(dest),'REQUEST_INVALID','Grant existence mismatch: '+p);if(operation!=='create')regular(dest);}}
 need(!git(root,'status','--porcelain','--untracked-files=all'),'REQUEST_INVALID','Original consumer is dirty');need(git(root,'rev-parse','HEAD')===authority.startRevision,'TRUST_INVALID','Consumer starting revision mismatch');pinned(authority.factoryRevision);
 need(digest(runnerPath)===authority.runnerSha256,'TRUST_INVALID','Launcher descriptor changed');validateRunner(runner);
 return {root,authorityPath,runnerPath,consumerTrust,taskPath,configPath,authority,runner,task,config,outputs,output,originalHash:entire(root),base:snapshot(root,true),authorityHash:digest(authorityPath),trustHash:digest(consumerTrust),startedAt:new Date().toISOString()};
}
function stable(c){need(entire(c.root)===c.originalHash,'PERMISSION_DENIED','Original checkout changed');need(digest(c.authorityPath)===c.authorityHash&&digest(c.consumerTrust)===c.trustHash&&digest(c.runnerPath)===c.authority.runnerSha256,'TRUST_INVALID','External authority changed');validateRunner(c.runner);pinned(c.authority.factoryRevision);}
function inputInventory(c,root){const outputs=[resolve(root,c.config.testing.results,false),resolve(root,c.config.testing.evidence,false)];return Object.fromEntries(Object.entries(snapshot(root)).filter(([p])=>!outputs.some(o=>within(o,path.join(root,p)))));}
function protectedCandidate(c,root){const {outputs}=validate(c.config,root,factory);verifyTrust(root,c.config,path.join(root,c.authority.consumerConfig),c.consumerTrust,outputs);return outputs;}
function envelopeCheck(c,e,root){need(e.status==='COMPLETE'&&e.mode==='full'&&e.consumer.revision===c.authority.startRevision&&e.consumer.repository===c.authority.consumerRepository&&e.factory.revision===c.authority.factoryRevision,'EVIDENCE_INVALID','Wrong consumer evidence identity');const outputs=protectedCandidate(c,root);need(e.consumer.treeSha256===tree(root,outputs),'EVIDENCE_INVALID','Stale consumer evidence tree');const trust=read(c.consumerTrust);need(e.trust.policySha256===digest(c.consumerTrust)&&e.trust.manifestSha256===trust.protectedManifestSha256&&e.configuration.sha256===trust.configSha256,'EVIDENCE_INVALID','Stale consumer evidence trust');need(trust.requiredSuites.every(id=>e.suites.some(s=>s.id===id&&s.exitCode===0)),'EVIDENCE_INVALID','Missing passing suite');need(Array.isArray(e.artifacts)&&trust.requiredEvidence.every(p=>e.artifacts.some(a=>a.path===p)),'EVIDENCE_INVALID','Missing required evidence');for(const a of e.artifacts){const p=resolve(root,a.path);need(outputs.some(o=>within(o,p))&&digest(p)===a.sha256,'EVIDENCE_INVALID','Changed consumer artifact');}}
async function execute(o){
 const c=context=preflight(o);const runId=result.runId;const branch=`factory/change/${c.task.id}/${runId}`;
 need(canonical(o.output)===c.output&&!fs.existsSync(c.output),'REQUEST_INVALID','Output destination changed');fs.mkdirSync(c.output,{mode:0o700});result.runDirectory=c.output;
 const workspace=path.join(c.output,'candidate'),verificationRoot=path.join(c.output,'verification');c.workspace=workspace;c.verificationRoot=verificationRoot;
 c.journal={schemaVersion:1,runId,phase:'VALIDATED',root:c.root,originalHash:c.originalHash,authorityPath:c.authorityPath,runnerPath:c.runnerPath,consumerTrust:c.consumerTrust,taskPath:c.taskPath,authoritySha256:c.authorityHash,trustSha256:c.trustHash,startRevision:c.authority.startRevision,factoryRevision:c.authority.factoryRevision,workspace,verificationRoot,branch,permissions:c.task.permissions,processes:[]};journal('VALIDATED');
 c.evidence={schemaVersion:1,runId,status:'FAILED',category:null,runnerKind:c.runner.kind,startedAt:c.startedAt,finishedAt:null,consumer:{repository:c.authority.consumerRepository,startRevision:c.authority.startRevision,startTreeSha256:tree(c.root,c.outputs),candidateTreeSha256:null},factory:{revision:c.authority.factoryRevision},authoritySha256:c.authorityHash,taskSha256:c.authority.taskSha256,runnerDescriptorSha256:c.authority.runnerSha256,requirements:c.task.requirementPaths.map(p=>({path:p,sha256:digest(path.join(c.root,p))})),permissions:c.task.permissions,isolation:{workspace,verificationRoot,branch},implementation:null,verification:null,diff:null,cleanup:{runnerStopped:false,verifierStopped:false},originalUnchanged:true,artifacts:[]};
 clone(c.root,workspace,c.authority.startRevision,branch);journal('ISOLATED');
 const home=path.join(c.output,'runner-home');fs.mkdirSync(home,{mode:0o700});const meta=c.gitMetadata=entire(path.join(workspace,'.git'));journal('IMPLEMENTING');
 runnerProcess=spawnOwned(c.runner.argv,workspace,home,path.join(c.output,'runner.log'),{schemaVersion:1,runId,workspace,task:c.task,limits:{...c.task.permissions,readOnlyRoots:[c.root,factory,c.authorityPath,c.consumerTrust,c.runnerPath,...c.runner.inputs.map(i=>i.path)],network:c.runner.network,deadline:new Date(Date.now()+c.runner.timeoutMs).toISOString()}});
 c.journal.processes.push({role:'runner',pid:runnerProcess.child.pid??null});journal('IMPLEMENTING');
 const reason=await waitOwned(runnerProcess,c.runner.timeoutMs,interruption);await stop(runnerProcess);await runnerProcess.drained;c.evidence.cleanup.runnerStopped=true;
 if(reason==='interrupt'||interrupted)fail('INTERRUPTED','Implementation interrupted');if(reason==='timeout')fail('IMPLEMENTATION_FAILED','Runner timeout');need(!runnerProcess.error,'TOOLING_UNAVAILABLE','Runner could not start');
 stable(c);need(entire(path.join(workspace,'.git'))===meta,'PERMISSION_DENIED','Runner modified Git metadata');
 let response;try{response=JSON.parse(runnerProcess.output());object(response,['schemaVersion','runId','status','exitCode','violations']);need(response.schemaVersion===1&&response.runId===runId&&['finished','failed','denied'].includes(response.status)&&Number.isInteger(response.exitCode)&&Array.isArray(response.violations),'IMPLEMENTATION_FAILED','Invalid runner response');for(const v of response.violations){object(v,['operation','path']);need(['create','update','delete'].includes(v.operation)&&typeof v.path==='string','IMPLEMENTATION_FAILED','Invalid violation');}}catch{fail('IMPLEMENTATION_FAILED','Malformed runner response');}
 c.evidence.implementation={exitCode:response.exitCode,violations:response.violations};
 const after=snapshot(workspace),changes=differences(c.base,after);git(workspace,'add','-A');const diffPath=path.join(c.output,'candidate.patch');c.evidence.diff={path:'candidate.patch',sha256:trackedDiff(workspace,c.authority.startRevision,diffPath),changes};
 need(response.status!=='denied'&&!response.violations.length,'PERMISSION_DENIED','Runner reported denied operation');checkGrants(changes,c.task.permissions);need(!runnerProcess.overflow&&runnerProcess.code===0&&response.exitCode===0&&response.status==='finished'&&changes.length>0,'IMPLEMENTATION_FAILED','Runner failed or produced no implementation');
 protectedCandidate(c,workspace);c.evidence.consumer.candidateTreeSha256=tree(workspace,[resolve(workspace,c.config.testing.results,false),resolve(workspace,c.config.testing.evidence,false)]);journal('IMPLEMENTED');
 clone(c.root,verificationRoot,c.authority.startRevision,branch+'-verification');transfer(workspace,verificationRoot,c.base,after);protectedCandidate(c,verificationRoot);const verifierMeta=entire(path.join(verificationRoot,'.git'));const candidateMeta=entire(path.join(workspace,'.git'));const verificationHome=path.join(c.output,'verifier-home');fs.mkdirSync(verificationHome,{mode:0o700});journal('VERIFYING');
 verifierProcess=spawnOwned([process.execPath,path.join(factory,'tools/factory/consumer.mjs'),'verify','--root',verificationRoot,'--config',c.authority.consumerConfig,'--trust',c.consumerTrust,'--mode','full'],verificationRoot,verificationHome,path.join(c.output,'verification.log'));
 c.journal.processes.push({role:'verifier',pid:verifierProcess.child.pid??null});journal('VERIFYING');
 const vReason=await waitOwned(verifierProcess,1800000,interruption);await stop(verifierProcess);await verifierProcess.drained;c.evidence.cleanup.verifierStopped=true;
 if(vReason==='interrupt'||interrupted)fail('INTERRUPTED','Verification interrupted');need(!vReason&&!verifierProcess.error&&!verifierProcess.overflow,'COORDINATOR_ERROR','Verifier timeout, launch or output failure');
 let v;try{v=JSON.parse(verifierProcess.output());}catch{fail('EVIDENCE_INVALID','Malformed verifier result');}
 c.evidence.verification={exitCode:verifierProcess.code,envelopePath:v.evidence??null,envelopeSha256:null,category:v.category??null};
 need(verifierProcess.code===0,'ACCEPTANCE_FAILED',`Consumer verifier failed: ${v.category}`);need(v.status==='COMPLETE'&&typeof v.evidence==='string','EVIDENCE_INVALID','Verifier did not produce complete evidence');journal('FINALIZING');
 stable(c);need(entire(path.join(workspace,'.git'))===candidateMeta&&entire(path.join(verificationRoot,'.git'))===verifierMeta,'PERMISSION_DENIED','Verification changed Git metadata');const outputs=protectedCandidate(c,workspace);need(tree(workspace,outputs)===c.evidence.consumer.candidateTreeSha256&&equivalent(snapshot(workspace),after),'EVIDENCE_INVALID','Candidate changed after implementation');need(tree(verificationRoot,protectedCandidate(c,verificationRoot))===c.evidence.consumer.candidateTreeSha256,'EVIDENCE_INVALID','Verifier changed inputs');
 need(equivalent(inputInventory(c,verificationRoot),after),'EVIDENCE_INVALID','Verifier modified non-output files');
 const ep=resolve(verificationRoot,v.evidence),e=read(ep);envelopeCheck(c,e,verificationRoot);c.evidence.verification.envelopeSha256=digest(ep);c.evidence.artifacts=[{path:path.relative(c.output,ep),sha256:digest(ep)},...e.artifacts.map(a=>({path:path.relative(c.output,path.join(verificationRoot,a.path)),sha256:a.sha256}))];
 c.journal.gitMetadata={candidate:candidateMeta,verification:verifierMeta};
 c.journal.candidateFilesSha256=digestInventory(snapshot(workspace));
 c.evidence.status='SIMULATED_VERIFIED';result.status='SIMULATED_VERIFIED';result.category=null;
}
async function check(o){
 const evidencePath=canonical(o.evidence),output=path.dirname(evidencePath),e=read(evidencePath),j=read(path.join(output,'journal.json'));
 need(j.phase==='SIMULATED_VERIFIED'&&e.status==='SIMULATED_VERIFIED'&&e.runnerKind==='fixture'&&j.runId===e.runId&&j.evidenceSha256===digest(evidencePath),'EVIDENCE_INVALID','Nonterminal or changed evidence');
 for(const item of j.processes){if(!item.pid)continue;try{process.kill(-item.pid,0);fail('EVIDENCE_INVALID','Recorded writer still exists');}catch(error){if(error.code!=='ESRCH')throw error;}}
 const c=preflightForCheck(j);need(c.authorityHash===e.authoritySha256&&c.authority.taskSha256===e.taskSha256&&c.authority.runnerSha256===e.runnerDescriptorSha256,'EVIDENCE_INVALID','Changed authority');stable(c);
 need(e.cleanup.runnerStopped&&e.cleanup.verifierStopped&&e.originalUnchanged,'EVIDENCE_INVALID','Cleanup incomplete');need(equivalent(e.isolation,{workspace:j.workspace,verificationRoot:j.verificationRoot,branch:j.branch}),'EVIDENCE_INVALID','Changed isolation paths');
 need(entire(path.join(j.workspace,'.git'))===j.gitMetadata?.candidate&&entire(path.join(j.verificationRoot,'.git'))===j.gitMetadata?.verification,'EVIDENCE_INVALID','Retained Git metadata changed');
 for(const root of [j.workspace,j.verificationRoot]){need(within(output,root)&&canonical(root)===root,'EVIDENCE_INVALID','Workspace escape');const outs=protectedCandidate(c,root);need(tree(root,outs)===e.consumer.candidateTreeSha256,'EVIDENCE_INVALID','Stale candidate/verification inputs');}
 need(digestInventory(snapshot(j.workspace))===j.candidateFilesSha256,'EVIDENCE_INVALID','Candidate filesystem changed');
 need(equivalent(inputInventory(c,j.verificationRoot),snapshot(j.workspace)),'EVIDENCE_INVALID','Verifier filesystem changed');
 const changes=differences(c.base,snapshot(j.workspace));checkGrants(changes,c.task.permissions);need(equivalent(changes,e.diff.changes)&&equivalent(c.task.permissions,e.permissions),'EVIDENCE_INVALID','Changed permission diff');
 need(e.verification.exitCode===0&&digest(resolve(j.verificationRoot,e.verification.envelopePath))===e.verification.envelopeSha256,'EVIDENCE_INVALID','Changed envelope');envelopeCheck(c,read(resolve(j.verificationRoot,e.verification.envelopePath)),j.verificationRoot);
 for(const a of [...e.artifacts,e.diff])need(digest(resolve(output,a.path))===a.sha256,'EVIDENCE_INVALID','Changed artifact/diff');
 Object.assign(result,{runId:e.runId,status:e.status,category:null,runDirectory:output,evidence:evidencePath});
}
function preflightForCheck(j){const authority=read(j.authorityPath),runner=read(j.runnerPath),config=read(path.join(j.root,authority.consumerConfig));return {root:j.root,authorityPath:j.authorityPath,runnerPath:j.runnerPath,consumerTrust:j.consumerTrust,taskPath:j.taskPath,authority,runner,task:read(j.taskPath),config,originalHash:j.originalHash,authorityHash:j.authoritySha256,trustHash:j.trustSha256,base:snapshot(j.root,true)};}
let command;
try{
 const args=process.argv.slice(2);command=args.shift();need(['run','check'].includes(command),'REQUEST_INVALID','Expected run or check');const allowed=command==='run'?['root','task','authority','runner','output']:['evidence'];const o={};while(args.length){const k=args.shift();need(k?.startsWith('--')&&allowed.includes(k.slice(2))&&!Object.hasOwn(o,k.slice(2))&&args.length,'REQUEST_INVALID','Invalid arguments');o[k.slice(2)]=args.shift();}need(allowed.every(k=>o[k]),'REQUEST_INVALID','Missing arguments');if(command==='run')await execute(o);else await check(o);
}catch(error){result.status=error.category==='INTERRUPTED'?'INTERRUPTED':'FAILED';result.category=command==='check'?'EVIDENCE_INVALID':({CONFIG_INVALID:'REQUEST_INVALID',FACTORY_ERROR:'COORDINATOR_ERROR'}[error.category]??error.category??'COORDINATOR_ERROR');if(!codes[result.category])result.category='COORDINATOR_ERROR';console.error(error.message);
}finally{
 for(const [role,s] of [['runner',runnerProcess],['verifier',verifierProcess]])if(s){try{await stop(s);if(context?.evidence)context.evidence.cleanup[role+'Stopped']=true;}catch(error){if(context?.evidence)(context.evidence.secondaryFailures??=[]).push({phase:'cleanup',primaryCategory:result.category,message:error.message});result.status='FAILED';result.category='COORDINATOR_ERROR';console.error(error.message);}}
 if(context?.evidence){const c=context;try{
  // Preserve partial diffs even on malformed response, interruption or runner failure.
  if(!c.evidence.diff&&fs.existsSync(c.workspace)){try{const after=snapshot(c.workspace),changes=differences(c.base,after);
   if(c.gitMetadata&&entire(path.join(c.workspace,'.git'))===c.gitMetadata){git(c.workspace,'add','-A');c.evidence.diff={path:'candidate.patch',sha256:trackedDiff(c.workspace,c.authority.startRevision,path.join(c.output,'candidate.patch')),changes};}
   else {const p=path.join(c.output,'candidate-changes.json');atomic(p,{changes});c.evidence.diff={path:'candidate-changes.json',sha256:digest(p),changes};}
  }catch(error){(c.evidence.secondaryFailures??=[]).push({phase:'diff-recovery',message:error.message});}}

  c.evidence.status=result.status;c.evidence.category=result.category;c.evidence.finishedAt=new Date().toISOString();c.evidence.originalUnchanged=entire(c.root)===c.originalHash;
  if(!c.evidence.originalUnchanged){(c.evidence.secondaryFailures??=[]).push({phase:'finalization',category:'PERMISSION_DENIED',message:'Original checkout changed'});if(!result.category){result.status=c.evidence.status='FAILED';result.category=c.evidence.category='PERMISSION_DENIED';}}
  const p=path.join(c.output,'governed-change-evidence.v1.json');atomic(p,c.evidence);result.evidence=p;c.journal.evidenceSha256=digest(p);journal(result.status);
 }catch(error){result.status='FAILED';result.category='COORDINATOR_ERROR';result.evidence=null;console.error(error.message);}}
 console.log(JSON.stringify(result));process.exitCode=result.category?codes[result.category]:0;
}
