// Owner-side relay attachment. Only the already-configured broker may reach its upstream.
import {spawn,execFileSync} from 'node:child_process';
export async function attachModelChannel({session,broker,model,prompt}){
 const info=JSON.parse(execFileSync(session.docker,['inspect',session.j.containerId],{encoding:'utf8',timeout:30000,maxBuffer:1048576,stdio:['ignore','pipe','pipe']}))[0];
 if(!session.j.audit||session.j.argv?.[0]!=='--model-channel'||session.j.phase!=='RUNNING'||info.Id!==session.j.containerId||info.Name!=='/'+session.j.containerName||info.Config.Labels?.['software-factory.session']!==session.j.runId||info.Config.Image!==session.j.image||!info.State.Running||info.HostConfig.NetworkMode!=='none')throw Error('Model channel container identity mismatch');
 const endpoint=`http://127.0.0.1:${broker.server.address().port}/v1/responses`;
 const child=spawn(session.docker,['exec','--interactive','--user','0:0',session.j.containerId,'/usr/local/bin/node','/opt/factory/model-channel.mjs'],{env:{PATH:process.env.PATH,...(process.env.DOCKER_HOST?{DOCKER_HOST:process.env.DOCKER_HOST}:{})},stdio:['pipe','pipe','pipe']});
 let buffer='',ready=false,rejectReady,resolveReady,failed=false,expectedClose=false;const jobs=new Set();let errorBytes=0;
 const started=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 const controller=new AbortController();
 const done=new Promise(resolve=>{child.once('error',()=>{failed=true;rejectReady(Error('Model channel launch failed'));resolve();});child.once('close',(code,signal)=>{if(!expectedClose||code!==0||signal)failed=true;controller.abort();if(!ready)rejectReady(Error('Model channel closed before readiness'));resolve();});});
 function fail(){failed=true;controller.abort();child.stdin.destroy();child.kill('SIGTERM');rejectReady(Error('Invalid model channel'));}
 child.stderr.on('data',b=>{errorBytes+=b.length;if(errorBytes>65536)fail();}); // Never print untrusted diagnostics or bodies.
 function write(value){if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(value)+'\n');}
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
  buffer+=chunk;if(buffer.length>2*1048576)return fail();
  for(;;){const end=buffer.indexOf('\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
   try{const v=JSON.parse(line);if(v.type==='closing'&&ready&&Object.keys(v).length===1){expectedClose=true;continue;}if(v.type==='ready'&&!ready&&Number.isInteger(v.port)&&v.port>0&&v.port<=65535){ready=true;resolveReady();continue;}
    if(!ready||v.type!=='request'||typeof v.id!=='string'||!/^[a-f0-9-]{36}$/.test(v.id)||typeof v.body!=='string'||v.body.length>1400000||jobs.size)throw Error('Invalid request frame');
    const job=(async()=>{
     const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:controller.signal,headers:{authorization:'Bearer '+broker.token,'content-type':'application/json'},body:Buffer.from(v.body,'base64')});
     const chunks=[];let size=0;for await(const b of response.body){size+=b.length;if(size>16777216)throw Error('Model response too large');chunks.push(b);}
     const contentType=(response.headers.get('content-type')??'application/json').split(';')[0];
     write({type:'response',id:v.id,status:response.status,contentType,body:Buffer.concat(chunks).toString('base64')});
    })();jobs.add(job);job.catch(fail).finally(()=>jobs.delete(job));
   }catch{fail();}
  }
 });child.stdin.on('error',()=>{});
 write({type:'configure',model,prompt,token:broker.token});
 let timer;try{await Promise.race([started,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Model channel readiness timeout')),10000))]);}catch(error){fail();await done;await broker.close();throw error;}finally{clearTimeout(timer);}
 return {pid:child.pid,async close(){controller.abort();child.stdin.end();await broker.close();await done;await Promise.allSettled([...jobs]);if(failed)throw Error('Model channel failed');}};
}
