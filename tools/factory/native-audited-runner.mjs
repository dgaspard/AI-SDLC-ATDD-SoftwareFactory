// Trusted image supervisor. The native observer drops UID before workload launch.
import fs from 'node:fs';import net from 'node:net';import {spawn} from 'node:child_process';
if(process.platform!=='linux'||process.getuid()!==0||!fs.existsSync('/.dockerenv'))throw Error('Container observer required');
const argv=process.argv.slice(2),modelChannel=argv[0]==='--model-channel';if(modelChannel)argv.shift();if(!argv.length)throw Error('Workload required');
process.umask(0o077);fs.chmodSync('/audit',0o700);
const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',LANG:'C.UTF-8'};
let control,controlClosed,channelLost=false,expectedClose=false,child;
if(modelChannel){
 const server=net.createServer();let timer;
 try{
  const value=await new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(Error('Model channel unavailable')),10000);
   server.on('error',reject);server.on('connection',socket=>{
    if(control){socket.destroy();return;}control=socket;let body='';socket.setEncoding('utf8');
    controlClosed=new Promise(r=>socket.once('close',()=>{if(!expectedClose){channelLost=true;child?.kill('SIGTERM');reject(Error('Model channel lost'));}r();}));
    socket.on('error',()=>socket.destroy());socket.on('data',b=>{body+=b;if(body.length>70000){socket.destroy();reject(Error('Model control too large'));return;}if(body.endsWith('\n')){try{resolve(JSON.parse(body));}catch{reject(Error('Invalid model control'));}}});
   });server.listen('/audit/model-control.sock');
  });
  if(!value||Object.keys(value).sort().join()!=='model,port,prompt,token'||!(/^[a-f0-9]{64}$/).test(value.token)||!(/^[\w.:-]{1,200}$/).test(value.model)||!Number.isInteger(value.port)||value.port<1||value.port>65535||typeof value.prompt!=='string'||value.prompt.length>65536)throw Error('Invalid model control');
  Object.assign(env,{FACTORY_MODEL:value.model,FACTORY_MODEL_PORT:String(value.port),FACTORY_MODEL_TOKEN:value.token,FACTORY_TASK_PROMPT:value.prompt});
 }catch(error){control?.destroy();throw error;}finally{clearTimeout(timer);server.close();fs.rmSync('/audit/model-control.sock',{force:true});}
}
if(channelLost)throw Error('Model channel lost before launch');
child=spawn('/opt/factory/syscall-observer',argv,{env,stdio:['ignore','inherit','inherit']});
if(child.pid)fs.writeFileSync('/audit/observer.pid',String(child.pid)+'\n',{flag:'wx',mode:0o600});
const code=await new Promise(resolve=>{child.once('error',()=>resolve(5));child.once('exit',(code,signal)=>resolve(signal?5:code));});
if(control&&!control.destroyed){expectedClose=true;control.end('{"type":"shutdown"}\n');await controlClosed;}
process.exitCode=channelLost?5:Number.isInteger(code)?code:5;
