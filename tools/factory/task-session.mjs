// Trusted update-only staging and native audit. Authority validation belongs to change.mjs.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runNativeAuditSession} from './native-audit-session.mjs';
const factory=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
const inside=(a,b)=>a===b||b.startsWith(a+path.sep);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const literal=p=>typeof p==='string'&&p&&!path.isAbsolute(p)&&!/[\\\0,]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
function inventory(root){
 const entries={};
 function walk(dir){for(const name of fs.readdirSync(dir).sort()){
  const file=path.join(dir,name),relative=path.relative(root,file),s=fs.lstatSync(file);
  if(s.isDirectory()){entries[relative]={type:'directory',mode:s.mode&0o777};walk(file);}
  else if(s.isSymbolicLink())entries[relative]={type:'symlink',target:fs.readlinkSync(file)};
  else if(s.isFile())entries[relative]={type:'file',mode:s.mode&0o777,sha256:hash(fs.readFileSync(file))};
  else throw Error('Special file in task workspace');
 }}walk(root);return entries;
}
export function validateUpdateTask({workspace,permissions,protectedPaths,readOnlyRoots=[],directory}){
 if(typeof workspace!=='string'||!path.isAbsolute(workspace)||fs.realpathSync(workspace)!==workspace||!fs.statSync(workspace).isDirectory())throw Error('Canonical isolated workspace required');
 if(typeof directory!=='string'||!path.isAbsolute(directory)||fs.existsSync(directory)||!fs.statSync(path.dirname(directory)).isDirectory())throw Error('New task session directory required');
 const destination=path.join(fs.realpathSync(path.dirname(directory)),path.basename(directory));
 const forbidden=[workspace,factory,...readOnlyRoots.map(p=>fs.realpathSync(p))];
 if(forbidden.some(p=>inside(p,destination)||inside(destination,p)))throw Error('Task session overlaps protected input');
 if(!permissions||Object.keys(permissions).sort().join()!=='create,delete,update'||Object.values(permissions).some(x=>!Array.isArray(x)))throw Error('Invalid task permissions');
 if(permissions.update.length>64)throw Error('Too many update grants');
 if(permissions.create.length||permissions.delete.length)throw Error('Create/delete unavailable in update-only profile');
 if(!Array.isArray(protectedPaths)||!protectedPaths.length||protectedPaths.some(p=>!literal(p.replace(/\/$/,''))))throw Error('Explicit protected paths required');
 const denied=[...protectedPaths.map(p=>p.replace(/\/$/,'')),'.git','.github','.claude','AGENTS.md','CLAUDE.md'];const seen=new Set();
 for(const p of permissions.update){
  if(!literal(p)||seen.has(p)||denied.some(d=>p===d||p.startsWith(d+'/')))throw Error('Invalid, duplicate or protected update grant');seen.add(p);
  const file=path.join(workspace,p),s=fs.lstatSync(file);
  if(fs.realpathSync(file)!==file||!s.isFile()||s.nlink!==1)throw Error('Aliased update grant');
 }
 const before=inventory(workspace); // reject special files before any Docker operation
 return {destination,before,forbidden};
}
export async function runTaskSession(options,settings={}){
 const started=Date.now();const timeoutMs=settings.timeoutMs??60000;if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>1800000)throw Error('Invalid bounded task deadline');
 const plan=validateUpdateTask(options),{docker,image,argv,workspace,permissions}=options;
 if(!Array.isArray(argv)||!argv.length||argv.some(x=>typeof x!=='string'||!x||x.includes('\0')))throw Error('Invalid task workload');
 fs.mkdirSync(plan.destination,{mode:0o700});
 const staging=path.join(plan.destination,'input');fs.cpSync(workspace,staging,{recursive:true,verbatimSymlinks:true,preserveTimestamps:true});
 // Preserve within-tree hardlink topology without ever linking back to the caller's tree.
 const links=new Map();for(const [relative,entry] of Object.entries(plan.before))if(entry.type==='file'){
  const original=fs.lstatSync(path.join(workspace,relative));if(original.nlink<2)continue;
  const identity=String(original.dev)+':'+String(original.ino),copy=path.join(staging,relative);
  if(links.has(identity)){fs.unlinkSync(copy);fs.linkSync(links.get(identity),copy);}else links.set(identity,copy);
 }

 // Host-owned private copies allow nobody to update bytes; original/candidate modes are preserved.
 for(const p of permissions.update)fs.chmodSync(path.join(staging,p),0o666);
 let result;
 try{
  result=await runNativeAuditSession({docker,image,argv:[...(options.modelChannel?['--model-channel']:[]),'--timeout-seconds',String(Math.ceil(timeoutMs/1000)),...permissions.update.flatMap(p=>['--grant-update','/workspace/'+p]),'--',...argv],directory:path.join(plan.destination,'execution'),forbiddenRoots:plan.forbidden,filesystem:{root:staging,permissions}},{...settings,timeoutMs:Math.max(1,timeoutMs-(Date.now()-started))});
 }catch(error){throw error;}
 // No candidate application or evidence inspection precedes confirmed container cleanup.
 if(!result.cleanupConfirmed)throw Error('Task cleanup not confirmed');
 for(const p of permissions.update)fs.chmodSync(path.join(staging,p),plan.before[p].mode);
 if(JSON.stringify(inventory(workspace))!==JSON.stringify(plan.before))throw Error('Candidate changed during task execution');
 const after=inventory(staging),changes=[];
 for(const p of new Set([...Object.keys(plan.before),...Object.keys(after)])){
  if(JSON.stringify(plan.before[p])===JSON.stringify(after[p]))continue;
  if(!permissions.update.includes(p)||plan.before[p]?.type!=='file'||after[p]?.type!=='file'||after[p].mode!==plan.before[p].mode)throw Error('Task changed an ungranted path or mode');
  changes.push({operation:'update',path:p,beforeSha256:plan.before[p].sha256,afterSha256:after[p].sha256});
 }
 // Retain failed output for inspection. Only a fully audited successful workload may supply a candidate.
 if(result.phase==='AUDIT_COLLECTED'&&result.exitCode===0){
  for(const change of changes){const src=path.join(staging,change.path),dst=path.join(workspace,change.path);const bytes=fs.readFileSync(src);if(hash(bytes)!==change.afterSha256)throw Error('Task output changed after cleanup');fs.writeFileSync(dst,bytes);}
 }
 const record={schemaVersion:1,scope:'update-only task component',realRunnerQualified:false,workspace,permissions,changes,...result};
 fs.writeFileSync(path.join(plan.destination,'task-result.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600,flag:'wx'});return record;
}
