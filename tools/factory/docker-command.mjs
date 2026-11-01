// Retry only read-only daemon queries after an explicit connection refusal.
import {execFileSync} from 'node:child_process';
const pause=new Int32Array(new SharedArrayBuffer(4));
export function dockerCommand(docker,args){
 const readOnly=args[0]==='inspect'||(['container','image','volume'].includes(args[0])&&['inspect','ls'].includes(args[1]));
 const deadline=Date.now()+30000;
 for(let attempt=0;;attempt++){
  try{return execFileSync(docker,args,{encoding:'utf8',timeout:Math.max(1,deadline-Date.now()),maxBuffer:1048576,stdio:['ignore','pipe','pipe']}).trim();}
  catch(error){
   const disconnected=error.status===1&&!error.signal&&/^Cannot connect to the Docker daemon at [^\r\n]+\. Is the docker daemon running\?\s*$/.test(String(error.stderr??''));
   if(!readOnly||!disconnected||attempt>=2||Date.now()+100>=deadline)throw error;
   Atomics.wait(pause,0,0,100);
  }
 }
}
