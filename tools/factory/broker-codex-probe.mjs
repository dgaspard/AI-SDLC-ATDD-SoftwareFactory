#!/usr/bin/env node
// Explicit offline compatibility probe: a real CLI, a fake model, no real-agent proof.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createModelBroker} from './model-broker.mjs';
import {createConverseTransport} from './bedrock-converse.mjs';
import {stop} from './processes.mjs';
import {waitOwned} from './change-support.mjs';

const args=process.argv.slice(2);
const externalContainer=args[2]==='--external-container-probe';
const flags=args.slice(3),denialProbe=flags.includes('--denials'),updateProbe=flags.includes('--update'),converseProbe=flags.includes('--converse');
if(args[0]!=='--codex'||!path.isAbsolute(args[1]??'')||(!externalContainer&&args.length!==2)||new Set(flags).size!==flags.length||flags.some(x=>!['--denials','--update','--converse'].includes(x))||(denialProbe&&updateProbe))throw Error('Invalid offline CLI qualification arguments');
if(externalContainer&&(process.platform!=='linux'||!fs.existsSync('/.dockerenv')))throw new Error('External qualification requires the provisioned Linux container');
const executable=fs.realpathSync(args[1]);
const executableSha256=crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'factory-codex-protocol-'));
for(const name of ['home','work','tmp'])fs.mkdirSync(path.join(root,name),{mode:0o700});
const environment={PATH:'/usr/bin:/bin',HOME:path.join(root,'home'),CODEX_HOME:path.join(root,'home'),TMPDIR:path.join(root,'tmp'),LANG:'C.UTF-8',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
execFileSync('git',['init','-q'],{cwd:path.join(root,'work'),env:environment});
const canary='offline-model-secret-not-a-real-credential';
const audit=[],observations=[],upstreamCalls=[];
// Fixed neutral attacks only, never consumer code. The independent observer must
// detect attempts even though this command suppresses errors and reports success.
const attack=`const fs=require('fs'),cp=require('child_process');
for(const p of ['/inputs/protected.txt','/inputs/symlink.txt','/inputs/hardlink.txt','/inputs/new.txt','/inputs/.git/HEAD','/factory/input','/verifier/input','/audit/trace'])try{fs.writeFileSync(p,'denied')}catch{}
try{fs.unlinkSync('/inputs/protected.txt')}catch{}
cp.spawnSync(process.execPath,['-e',"try{require('fs').writeFileSync('/inputs/descendant.txt','denied')}catch{}"]);
console.log('protocol-tool-ok');`;
const chosen=updateProbe?"require('fs').writeFileSync('/workspace/source/allowed.js','approved');console.log('protocol-tool-ok');":attack;
const fixedCommand=(denialProbe||updateProbe)?'/usr/local/bin/node -e '+"'"+chosen.replaceAll("'","'\\''")+"'":null;

const upstream=http.createServer(async(req,res)=>{
  let body='';for await(const b of req)body+=b;
  const request=JSON.parse(body);
  const outputs=Array.isArray(request.input)?request.input.filter(x=>x.type==='function_call_output'):[];
  upstreamCalls.push({path:req.url,credentialBound:req.headers.authorization==='Bearer '+canary,hasToolResult:outputs.some(x=>typeof x.output==='string'&&x.output.includes('protocol-tool-ok')),bounded:request.max_output_tokens===8192,metadataStripped:!('client_metadata'in request)&&!('prompt_cache_key'in request)});
  const item=upstreamCalls.length===1?
    {id:'fc_probe',type:'function_call',call_id:'call_probe',name:'exec_command',arguments:JSON.stringify({cmd:fixedCommand??"printf '%s\\n' protocol-tool-ok",max_output_tokens:100,shell:'/bin/sh',login:false}),status:'completed'}:
    {id:'msg_probe',type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:'Protocol roundtrip complete.',annotations:[]}]};
  const response={id:'resp_probe_'+upstreamCalls.length,object:'response',created_at:1,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}};
  res.writeHead(200,{'content-type':'text/event-stream'});
  for(const event of [{type:'response.created',response:{...response,status:'in_progress',output:[]}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response}])res.write('data: '+JSON.stringify(event)+'\n\n');
  res.end();
});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const converseCalls=[];
const converseTransport=converseProbe?createConverseTransport({model:'neutral-probe',send:async request=>{
 converseCalls.push({model:request.modelId,toolResult:request.messages.some(m=>m.content.some(c=>c.toolResult)),tools:request.toolConfig?.tools.map(t=>t.toolSpec.name)});
 const content=converseCalls.length===1?[{toolUse:{toolUseId:'call_probe',name:'exec_command',input:{cmd:fixedCommand??"printf '%s\\n' protocol-tool-ok",max_output_tokens:100,shell:'/bin/sh',login:false}}}]:[{text:'Protocol roundtrip complete.'}];
 return {stopReason:converseCalls.length===1?'tool_use':'end_turn',output:{message:{role:'assistant',content}}};
}}):null;
const broker=createModelBroker({runId:'offline-codex-probe',model:'neutral-probe',...(converseTransport?{converseTransport:{async request(body,options){try{return await converseTransport.request(body,options);}catch(error){console.error('CONVERSE_REJECT: '+error.message);throw error;}}}}:{credentialStore:{async readSecret(){return canary;}},offlineUpstream:`http://127.0.0.1:${upstream.address().port}/v1/responses`}),maxRequests:4,timeoutMs:10000,audit:e=>audit.push(e)});

broker.server.prependListener('request',req=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{try{const b=JSON.parse(body);observations.push({fields:Object.keys(b),reasoning:b.reasoning,include:b.include,text:b.text,input:b.input?.map(x=>({type:x.type,fields:Object.keys(x),outputType:typeof x.output})),tools:b.tools?.map(x=>({type:x.type,name:x.name,strict:x.strict}))});}catch{}});});
await new Promise(r=>broker.server.listen(0,'127.0.0.1',r));
let state=null,stdout='',stderr='',code=null,timedOut=false,runnerStopped=false,groupCheck=null;const errors=[];
try {
 const child=spawn(executable,['--no-daemon','-a','never','exec','--ephemeral','-s',externalContainer?'danger-full-access':'read-only','--json','--color','never','-C',path.join(root,'work'),'-c','web_search="disabled"','-c','features.multi_agent=false','-c','features.shell_snapshot=false','-c','model_supports_reasoning_summaries=false','-c','model_reasoning_summary="none"','-c','model_provider="factory_probe"','-c','model="neutral-probe"','-c',`model_providers.factory_probe={name="Offline factory probe",base_url="http://127.0.0.1:${broker.server.address().port}/v1",wire_api="responses",env_key="BROKER_TOKEN",requires_openai_auth=false,request_max_retries=0,stream_max_retries=0}`,'This is an offline protocol test. Run only the supplied fixed neutral qualification command and report completion.'],{env:{...environment,BROKER_TOKEN:broker.token},detached:true,stdio:['ignore','pipe','pipe']});
 state={child,error:null,exited:false};state.done=new Promise(resolve=>{child.once('error',e=>{state.error=e;state.exited=true;resolve();});child.once('exit',(c,signal)=>{state.code=c;state.signal=signal;state.exited=true;resolve();});});
 const closed=new Promise(r=>child.once('close',r));
 child.stdout.on('data',b=>{stdout+=b;if(stdout.length>1048576)child.kill('SIGTERM');});child.stderr.on('data',b=>{stderr+=b;if(stderr.length>1048576)child.kill('SIGTERM');});
 timedOut=(await waitOwned(state,externalContainer?45000:20000,new Promise(()=>{})))==='timeout';
 if(state.exited){let drainTimer;try{await Promise.race([closed,new Promise(r=>drainTimer=setTimeout(r,100))]);}finally{clearTimeout(drainTimer);}}
 try{process.kill(-child.pid,0);groupCheck='present';}catch(e){groupCheck=e.code;}
 if(externalContainer){code=state.code;child.stdout.destroy();child.stderr.destroy();}
 else {await stop(state);runnerStopped=true;await closed;code=state.code;}
} catch(error) { errors.push(error.code??'PROBE_ERROR'); } finally {
 if(state&&!runnerStopped&&!externalContainer){try{await stop(state);runnerStopped=true;}catch(error){errors.push(error.code??'CLEANUP_ERROR');}}
 await broker.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));
}
const secretAbsent=![stdout,stderr,JSON.stringify(audit)].some(s=>s.includes(canary)||s.includes(broker.token));
const events=stdout.trim().split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
const commandCompleted=events.some(e=>e.type==='item.completed'&&e.item?.type==='command_execution'&&e.item.exit_code===0&&e.item.status==='completed'&&e.item.aggregated_output.trim()==='protocol-tool-ok');
const finalMessage=events.some(e=>e.type==='item.completed'&&e.item?.type==='agent_message'&&e.item.text==='Protocol roundtrip complete.');
const protocolPassed=errors.length===0&&commandCompleted&&finalMessage&&!timedOut&&code===0&&(converseProbe?(converseCalls.length===2&&converseCalls[1].toolResult):(upstreamCalls.length===2&&upstreamCalls.every(c=>c.credentialBound&&c.bounded&&c.metadataStripped)&&upstreamCalls[1].hasToolResult))&&secretAbsent&&audit.every(e=>e.status===200);
const passed=!externalContainer&&runnerStopped&&protocolPassed;
const report={externalContainer,denialProbe,updateProbe,converseProbe,converseCalls,protocolPassed,requiresOuterCleanup:externalContainer,scope:'Offline CLI protocol compatibility only; synthetic model and credential, no application or real-agent proof',passed,executable,executableSha256,version:execFileSync(executable,['--version'],{env:environment,encoding:'utf8',timeout:5000}).trim(),code,pid:state?.child.pid,groupCheck,timedOut,commandCompleted,finalMessage,secretAbsent,upstreamCalls,observations,audit,cleanupComplete:runnerStopped&&errors.length===0,errors};
fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
// Do not retain stdout/stderr if any token was reflected.
if(secretAbsent){fs.writeFileSync(path.join(root,'stdout.log'),stdout,{mode:0o600});fs.writeFileSync(path.join(root,'stderr.log'),stderr,{mode:0o600});}
console.log(JSON.stringify({passed,report:path.join(root,'report.json'),code,requests:upstreamCalls.length}));if(externalContainer)console.log(JSON.stringify({report}));
process.exitCode=(externalContainer?protocolPassed:passed)?0:1;
