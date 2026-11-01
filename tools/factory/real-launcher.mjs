#!/usr/bin/env node
// Built-in host launcher protocol. The owner coordinator holds AWS credentials, never this sandbox.
import fs from 'node:fs';import path from 'node:path';
import {runTaskSession} from './task-session.mjs';import {attachModelChannel} from './model-channel-session.mjs';
const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--profile')throw Error('Reviewed profile required');
const profile=JSON.parse(fs.readFileSync(args[1]));let bytes='';for await(const b of process.stdin){bytes+=b;if(bytes.length>1048576)throw Error('Launcher request too large');}
const request=JSON.parse(bytes),signal=new AbortController();for(const name of ['SIGINT','SIGTERM'])process.on(name,()=>signal.abort());
let channel;const reply={schemaVersion:1,runId:request.runId,status:'failed',exitCode:5,violations:[]};
try{
 if(!profile.enabled||request.schemaVersion!==1||request.limits.network!=='model-proxy')throw Error('Unsupported real invocation');
 const endpoint=new URL(request.limits.modelChannel.endpoint);
 if(endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1'||endpoint.pathname!=='/v1/responses'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!(/^[a-f0-9]{64}$/).test(request.limits.modelChannel.token))throw Error('Invalid owner broker channel');
 process.env.DOCKER_HOST=profile.docker.endpoint;
 const broker={token:request.limits.modelChannel.token,server:{address:()=>({port:Number(endpoint.port)})},async close(){}};
 const prompt=`Implement only this human-approved frozen task. Read the requirement files, preserve tests/policy/Git and all ungranted files. Use in-place writes; atomic replacement, create/delete and metadata changes are unavailable. Do not install, commit, fetch, merge or deploy. This is the implementation stage only: a separate independent verifier runs every required application gate after you finish, using the frozen tests and provisioned dependencies. Do not run package managers, application services or test suites in this coding sandbox. Read the task requirement files and relevant implementation, make only the granted change, inspect the resulting source with bounded read-only commands, then finish. Do not search dependency directories or repeat broad repository scans. Your output is a candidate, never approval.\n${JSON.stringify(request.task)}`;
 const result=await runTaskSession({docker:profile.docker.path,image:profile.runnerImage,workspace:request.workspace,permissions:request.task.permissions,protectedPaths:request.limits.protectedPaths,readOnlyRoots:request.limits.readOnlyRoots,directory:path.join(path.dirname(request.workspace),'real-implementation'),modelChannel:true,argv:['node','/opt/factory/coding-client.mjs']},{signal:signal.signal,timeoutMs:Math.max(1,Date.parse(request.limits.deadline)-Date.now()),afterStart:async session=>{channel=await attachModelChannel({session,broker,model:profile.broker.model,prompt});},afterCleanup:async()=>{await channel?.close();}});
 reply.exitCode=result.exitCode;reply.status=result.exitCode===6?'denied':result.phase==='AUDIT_COLLECTED'&&result.exitCode===0?'finished':'failed';
}catch{reply.status='failed';reply.exitCode=signal.signal.aborted?130:5;process.stderr.write('Real launcher failed; inspect retained session evidence.\n');}
console.log(JSON.stringify(reply));process.exitCode=reply.exitCode;
