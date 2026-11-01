// Trusted image entry point. Never use on the host; tracee runs as nobody.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
if(process.platform!=='linux'||process.getuid()!==0||!fs.existsSync('/.dockerenv'))throw new Error('Container observer required');
const argv=process.argv.slice(2);
if(!argv.length||argv.some(x=>!x||x.includes('\0')))throw new Error('Missing tracee command');
process.umask(0o077);fs.chmodSync('/audit',0o700);
if(fs.statSync('/audit').uid!==0)throw new Error('Audit storage must be observer-owned');
const stdout=fs.openSync('/audit/stdout','wx',0o600),stderr=fs.openSync('/audit/stderr','wx',0o600);
const child=spawn('/usr/bin/strace',['-f','-qq','-s','4096','-e','trace=all','-o','/audit/trace','-u','nobody','/opt/factory/syscall-guard','--container-owned',...argv],{
 env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',LANG:'C.UTF-8'},stdio:['ignore',stdout,stderr]});
let exceeded=false;
const timer=setInterval(()=>{
 for(const name of ['trace','stdout','stderr']){
  try{if(fs.statSync('/audit/'+name).size>16*1024*1024){exceeded=true;child.kill('SIGKILL');}}catch{}
 }
},25);
const result=await new Promise(resolve=>{child.once('error',()=>resolve({error:true}));child.once('exit',(code,signal)=>resolve({code,signal}));});
clearInterval(timer);fs.closeSync(stdout);fs.closeSync(stderr);
// Only a completed tracer produces a receipt. Host independently stops all container processes.
if(exceeded||result.error||result.signal||!Number.isInteger(result.code))process.exitCode=125;
else {fs.writeFileSync('/audit/receipt.json',JSON.stringify({schemaVersion:1,trace:'all',exitCode:result.code})+'\n',{flag:'wx',mode:0o600});process.exitCode=result.code;}
