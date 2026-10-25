// Governed-change coordinator helpers. No application or model-provider dependencies.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {hash, resolve, within, tree} from './core.mjs';
import {stop} from './processes.mjs';
export {hash, resolve, within, tree, stop};
export const codes={REQUEST_INVALID:2,VERSION_INCOMPATIBLE:3,TRUST_INVALID:4,TOOLING_UNAVAILABLE:5,PERMISSION_DENIED:6,ACCEPTANCE_FAILED:7,EVIDENCE_INVALID:8,COORDINATOR_ERROR:9,IMPLEMENTATION_FAILED:10,INTERRUPTED:130};
export function fail(category,message){throw Object.assign(new Error(message),{category});}
export function need(ok,category,message){if(!ok)fail(category,message);}
export function object(v,keys){need(v&&typeof v==='object'&&!Array.isArray(v)&&keys.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>keys.includes(k)),'REQUEST_INVALID','Invalid object fields: '+keys.join(','));}
export const digest=p=>hash(fs.readFileSync(p));
export function read(p,category='REQUEST_INVALID'){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{fail(category,'Invalid or unreadable JSON: '+p);}}
export function text(v){need(typeof v==='string'&&v.length>0&&!/[\0\r\n]/.test(v),'REQUEST_INVALID','Expected nonempty string');}
export function sha(v,n=64){need(typeof v==='string'&&new RegExp(`^[a-f0-9]{${n}}$`).test(v),'REQUEST_INVALID','Invalid digest/revision');}
export function relative(p){text(p);need(!path.isAbsolute(p)&&!p.includes('\\')&&!/[?*\[\]]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'),'REQUEST_INVALID','Expected literal relative file path');return p;}
export function canonical(p){text(p);need(path.isAbsolute(p),'REQUEST_INVALID','Expected absolute path');const full=path.resolve(p);let ancestor=full;while(!fs.existsSync(ancestor)){const next=path.dirname(ancestor);need(next!==ancestor,'REQUEST_INVALID','Unresolvable path');ancestor=next;}return path.resolve(fs.realpathSync(ancestor),path.relative(ancestor,full));}
export function regular(p,category='REQUEST_INVALID') {let s;try{s=fs.lstatSync(p);}catch{fail(category,'Missing regular file: '+p);}need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,category,'Aliased or nonregular file: '+p);return s;}
export const env=home=>({PATH:path.dirname(process.execPath)+':/usr/bin:/bin',HOME:home,TMPDIR:home,LANG:'C.UTF-8',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_ATTR_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'});
export function git(root,...args){return execFileSync('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false',...args],{cwd:root,env:env('/nonexistent-governed-home'),encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024}).trim();}
export function files(root){return [...new Set(git(root,'ls-files','-co','--exclude-standard','-z').split('\0').filter(Boolean))].sort();}
export function snapshot(root,trackedOnly=false){
 const m={};
 function add(p){relative(p);const f=path.join(root,p);const st=regular(f,'PERMISSION_DENIED');m[p]={sha256:digest(f),mode:st.mode&0o777};}
 function walk(dir,rel=''){for(const name of fs.readdirSync(dir).sort()){if(!rel&&name==='.git')continue;const p=rel?rel+'/'+name:name,st=fs.lstatSync(path.join(dir,name));if(st.isDirectory())walk(path.join(dir,name),p);else add(p);}}
 if(trackedOnly){for(const p of files(root))if(fs.existsSync(path.join(root,p)))add(p);}else walk(root);
 return Object.fromEntries(Object.entries(m).sort(([a],[b])=>a.localeCompare(b)));
}
export function differences(before,after){return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().filter(p=>JSON.stringify(before[p])!==JSON.stringify(after[p])).map(p=>({operation:!before[p]?'create':!after[p]?'delete':'update',path:p,beforeSha256:before[p]?.sha256??null,afterSha256:after[p]?.sha256??null}));}
export function checkGrants(changes,permissions){for(const c of changes)need(permissions[c.operation]?.includes(c.path),'PERMISSION_DENIED','Unapproved '+c.operation+': '+c.path);}
// Includes ignored files and Git administrative state; hashes only, never logs contents.
export function entire(root){const rows=[];function walk(dir,rel){for(const name of fs.readdirSync(dir).sort()){const p=path.join(dir,name),r=rel?rel+'/'+name:name,s=fs.lstatSync(p);if(s.isSymbolicLink())rows.push([r,'link',fs.readlinkSync(p)]);else if(s.isDirectory())walk(p,r);else if(s.isFile())rows.push([r,s.mode&0o777,digest(p)]);else fail('REQUEST_INVALID','Unsupported original file type');}}walk(root,'');return hash(JSON.stringify(rows));}
export function atomic(p,data){const tmp=p+'.tmp';const fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,p);}
export function clone(root,dest,revision,branch){git(path.dirname(dest),'clone','--no-hardlinks','--no-local','--no-checkout','--',root,dest);git(dest,'checkout','-b',branch,revision);git(dest,'remote','remove','origin');need(!fs.existsSync(path.join(dest,'.git/objects/info/alternates')),'COORDINATOR_ERROR','Shared object store forbidden');}
export function transfer(source,dest,before,after){for(const p of Object.keys(before))if(!after[p])fs.unlinkSync(resolve(dest,p));for(const p of Object.keys(after)){const out=resolve(dest,p,false);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(resolve(source,p),out);fs.chmodSync(out,after[p].mode);}git(dest,'add','-A');}
export function trackedDiff(root,start,p){const bytes=execFileSync('git',['-c','core.hooksPath=/dev/null','diff','--binary','--no-ext-diff','--no-textconv',start,'--'],{cwd:root,env:env('/nonexistent-governed-home'),maxBuffer:32*1024*1024});fs.writeFileSync(p,bytes,{mode:0o600});return digest(p);}
export function spawnOwned(argv,cwd,home,stderrPath,input){
 const fd=fs.openSync(stderrPath,'a',0o600);let output='';const child=spawn(argv[0],argv.slice(1),{cwd,env:env(home),detached:true,stdio:['pipe','pipe',fd]});fs.closeSync(fd);
 const state={child,error:null,exited:false,overflow:false};state.done=new Promise(r=>{child.once('error',e=>{state.error=e;state.exited=true;r();});child.once('exit',(code,signal)=>{state.code=code;state.signal=signal;state.exited=true;r();});});
 state.drained=new Promise(r=>child.once('close',r));child.stdout.on('data',b=>{if(output.length+b.length>1024*1024){state.overflow=true;try{process.kill(-child.pid,'SIGKILL');}catch{}}else output+=b;});child.stdin.on('error',()=>{});child.stdin.end(input===undefined?'':JSON.stringify(input));state.output=()=>output;return state;
}
export async function waitOwned(s,timeout,interrupt){let timer;try{const reason=await Promise.race([s.done.then(()=>null),new Promise(r=>timer=setTimeout(()=>r('timeout'),timeout)),interrupt.then(()=> 'interrupt')]);return reason;}finally{clearTimeout(timer);}}
