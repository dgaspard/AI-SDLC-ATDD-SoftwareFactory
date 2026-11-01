// Trusted container relay: model-only HTTP over owned Docker-exec pipes. No credentials or host socket mounts.
import http from 'node:http';import net from 'node:net';import crypto from 'node:crypto';
if(process.platform!=='linux'||process.getuid()!==0)throw Error('Container supervisor required');
const MAX_REQUEST=1048576,MAX_FRAME=24*1048576,pending=new Map();let config=null,buffer='',closed=false;
function close(){if(closed)return;closed=true;for(const r of pending.values())r.destroy();pending.clear();server.closeAllConnections();server.close();process.exitCode=5;}
function send(value){process.stdout.write(JSON.stringify(value)+'\n');}
const server=http.createServer((req,res)=>{
 (async()=>{
 if(!config||req.method!=='POST'||req.url!=='/v1/responses'||req.headers.authorization!=='Bearer '+config.token||req.headers['content-type']!=='application/json'){res.writeHead(403);res.end();return;}
 if(pending.size){res.writeHead(429);res.end();return;}
 let length=0;const chunks=[];for await(const b of req){length+=b.length;if(length>MAX_REQUEST){res.writeHead(413);res.end();return;}chunks.push(b);}
 const id=crypto.randomUUID();pending.set(id,res);const timer=setTimeout(()=>{pending.delete(id);res.destroy();},120000);res.once('close',()=>{clearTimeout(timer);pending.delete(id);});
 send({type:'request',id,body:Buffer.concat(chunks).toString('base64')});
 })().catch(()=>{res.destroy();});
});
async function configure(value){
 if(config||!value||Object.keys(value).sort().join()!=='model,prompt,token,type'||value.type!=='configure'||!/^[a-f0-9]{64}$/.test(value.token)||typeof value.prompt!=='string'||value.prompt.length>65536||typeof value.model!=='string'||!/^[\w.:-]{1,200}$/.test(value.model))throw Error('Invalid model channel configuration');
 config=value;
 const control=net.connect('/audit/model-control.sock');await new Promise((resolve,reject)=>{control.once('connect',resolve);control.once('error',reject);});
 process.setgroups([]);process.setgid(65533);process.setuid(65533);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let terminal='';control.setEncoding('utf8');control.on('data',b=>{terminal+=b;if(terminal.length>256)return close();});
 control.once('end',()=>{
  try{if(JSON.stringify(JSON.parse(terminal))!==JSON.stringify({type:'shutdown'}))throw Error('Invalid shutdown');
   closed=true;server.closeAllConnections();server.close();control.end();
   process.stdout.write(JSON.stringify({type:'closing'})+'\n',()=>process.exit(0));
  }catch{close();}
 });control.once('error',close);
 control.write(JSON.stringify({model:value.model,prompt:value.prompt,token:value.token,port:server.address().port})+'\n');
 send({type:'ready',port:server.address().port});
}
process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{
 buffer+=chunk;if(buffer.length>MAX_FRAME)return close();
 for(;;){const end=buffer.indexOf('\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
  try{const v=JSON.parse(line);if(!config){configure(v).catch(close);continue;}
   if(v.type!=='response'||!pending.has(v.id)||![200,400,401,403,413,429,500,502,504].includes(v.status)||typeof v.body!=='string'||!['application/json','text/event-stream'].includes(v.contentType))throw Error('Invalid model response frame');
   const r=pending.get(v.id);pending.delete(v.id);r.writeHead(v.status,{'content-type':v.contentType});r.end(Buffer.from(v.body,'base64'));
  }catch{close();}
 }
});process.stdin.once('end',close);process.stdin.once('error',close);process.on('SIGTERM',close);
