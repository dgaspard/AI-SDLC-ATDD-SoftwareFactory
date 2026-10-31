// Fixed CLI entry inside the audited tracee. Broker capability is per-run, never an AWS credential.
import fs from 'node:fs';import {spawn} from 'node:child_process';
const {FACTORY_MODEL:model,FACTORY_MODEL_TOKEN:token,FACTORY_MODEL_PORT:port,FACTORY_TASK_PROMPT:prompt}=process.env;
if(!/^[\w.:-]{1,200}$/.test(model??'')||!(/^[a-f0-9]{64}$/).test(token??'')||!/^\d{1,5}$/.test(port??'')||!prompt)throw Error('Model channel missing');
const home=fs.mkdtempSync('/tmp/coding-home-');
const args=['--no-daemon','-a','never','exec','--ephemeral','--skip-git-repo-check','-s','danger-full-access','--json','--color','never','-C','/workspace','-c','web_search="disabled"','-c','features.multi_agent=false','-c','features.shell_snapshot=false','-c','model_supports_reasoning_summaries=false','-c','model_reasoning_summary="none"','-c','model_provider="factory_broker"','-c',`model=${JSON.stringify(model)}`,'-c',`model_providers.factory_broker={name="Factory broker",base_url="http://127.0.0.1:${port}/v1",wire_api="responses",env_key="BROKER_TOKEN",requires_openai_auth=false,request_max_retries=0,stream_max_retries=0}`,prompt];
const child=spawn('/opt/guarded-codex',args,{env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:home,CODEX_HOME:home,TMPDIR:'/tmp',LANG:'C.UTF-8',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',BROKER_TOKEN:token},stdio:['ignore','pipe','pipe']});
// Redact the scoped capability even if the coding process echoes it.
let output='',errors='';child.stdout.on('data',b=>{output+=b;if(output.length>1048576)child.kill('SIGTERM');});child.stderr.on('data',b=>{errors+=b;if(errors.length>1048576)child.kill('SIGTERM');});
const code=await new Promise(resolve=>{child.once('error',()=>resolve(5));child.once('exit',(c)=>resolve(c??10));});
if(output.includes(token)||errors.includes(token)){process.stderr.write('Runner capability reflection rejected\n');process.exitCode=10;}else{process.stdout.write(output);process.stderr.write(errors);process.exitCode=code;}
