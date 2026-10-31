import {test} from 'node:test';
import assert from 'node:assert/strict';
import {converseRequest,converseResponse,createConverseTransport} from './bedrock-converse.mjs';
import {createModelBroker} from './model-broker.mjs';
import {validateStream} from './broker-protocol.mjs';
const model='us.moonshotai.kimi-k3';
const tool={type:'function',name:'read_value',parameters:{type:'object',properties:{},additionalProperties:false},strict:false};
const body={model,input:'Read the value',store:false,max_output_tokens:64};
const answer={stopReason:'end_turn',output:{message:{role:'assistant',content:[{text:'Done'}]}}};
const toolAnswer={stopReason:'tool_use',output:{message:{role:'assistant',content:[{toolUse:{toolUseId:'call_1',name:'read_value',input:{}}}]}}};
test('Converse preserves instructions token budget and exact pinned model',()=>{
 const r=converseRequest({...body,instructions:'Bounded task'},model);
 assert.equal(r.modelId,model);assert.deepEqual(r.system,[{text:'Bounded task'}]);assert.equal(r.inferenceConfig.maxTokens,64);assert.deepEqual(r.messages,[{role:'user',content:[{text:body.input}]}]);
 assert.throws(()=>converseRequest({...body,model:'other'},model));
});
test('Converse function round trip omits prior reasoning and preserves tool identity',()=>{
 const b={...body,tools:[tool],tool_choice:'required'};
 const r=converseRequest(b,model);assert.deepEqual(r.toolConfig.toolChoice,{any:{}});
 const out=converseResponse(toolAnswer,b);assert.equal(out.output[0].call_id,'call_1');
 const follow=converseRequest({...b,tool_choice:'auto',input:[{type:'message',role:'user',content:[{type:'input_text',text:'Read'}]},{type:'reasoning',summary:[]},out.output[0],{type:'function_call_output',call_id:'call_1',output:'42'}]},model);
 assert.deepEqual(follow.messages.at(-1).content,[{toolResult:{toolUseId:'call_1',content:[{text:'42'}]}}]);assert.ok(!JSON.stringify(follow).includes('reasoning'));
});
test('Converse refuses unsupported effort custom tools documents and orphan results',()=>{
 for(const extra of [{tools:[{...tool,strict:true}]},{text:{verbosity:'low'}},{reasoning:{summary:'auto'}},{reasoning:{effort:'low'}},{tools:[{type:'custom',name:'patch'}]},{input:[{type:'message',role:'user',content:[{type:'input_file',file_id:'x'}]}]},{input:[{type:'function_call_output',call_id:'missing',output:'42'}]}])assert.throws(()=>converseRequest({...body,...extra},model));
});
test('Converse never marks truncated filtered or inconsistent tool output complete',()=>{
 for(const stopReason of ['max_tokens','content_filtered','guardrail_intervened','unknown'])assert.throws(()=>converseResponse({...answer,stopReason},body));
 assert.throws(()=>converseResponse(toolAnswer,body));
 assert.throws(()=>converseResponse(answer,{...body,tools:[tool],tool_choice:'required'}));
 const many=structuredClone(toolAnswer);many.output.message.content.push({toolUse:{toolUseId:'call_2',name:'read_value',input:{}}});
 assert.throws(()=>converseResponse(many,{...body,tools:[tool],parallel_tool_calls:false}));
});
async function fixture(t,send,options={}){
 const calls=[];const transport=createConverseTransport({model,send:async(...args)=>{calls.push(args[0]);return send(...args);}});
 const broker=createModelBroker({runId:'converse-test',model,converseTransport:transport,...options});
 await new Promise(r=>broker.server.listen(0,'127.0.0.1',r));t.after(()=>broker.close());
 return {broker,calls,request:(extra={})=>fetch(`http://127.0.0.1:${broker.server.address().port}/v1/responses`,{method:'POST',headers:{authorization:'Bearer '+broker.token,'content-type':'application/json'},body:JSON.stringify({...body,...extra})})};
}
test('Converse integrated broker emits validated buffered SSE and JSON',async t=>{
 const f=await fixture(t,async()=>answer);const r=await f.request();assert.equal(r.status,200);assert.equal((await r.json()).output[0].content[0].text,'Done');
 const stream=await f.request({stream:true});assert.equal(stream.status,200);validateStream(Buffer.from(await stream.text()));assert.equal(f.calls.length,2);
});
test('Converse broker rejects model and unsupported requests before SDK invocation',async t=>{
 const f=await fixture(t,async()=>answer);assert.equal((await f.request({model:'other'})).status,403);assert.equal((await f.request({reasoning:{effort:'low'}})).status,502);assert.equal(f.calls.length,0);
});
test('Converse broker sanitizes SDK failures and rejects incomplete responses',async t=>{
 for(const send of [async()=>{throw Error('private-provider-detail');},async()=>({...answer,stopReason:'max_tokens'})]){const f=await fixture(t,send);const r=await f.request();assert.equal(r.status,502);assert.ok(!(await r.text()).includes('private-provider-detail'));}
});
test('Converse deadline cancels a stalled SDK and permits cleanup',async t=>{
 const f=await fixture(t,()=>new Promise(()=>{}),{timeoutMs:40});assert.equal((await f.request()).status,504);await f.broker.close();
});
test('Converse broker blocks runner-token reflection',async t=>{
 const f=await fixture(t,async()=>({...answer,output:{message:{role:'assistant',content:[{text:f.broker.token}]}}}));assert.equal((await f.request()).status,502);
});

test('Converse accepts legacy encrypted-content include without inventing reasoning state',()=>{
 const request=converseRequest({...body,reasoning:{},include:['reasoning.encrypted_content']},model);
 assert.deepEqual(request,converseRequest(body,model));
 const response=converseResponse(answer,{...body,include:['reasoning.encrypted_content']});
 assert.ok(response.output.every(x=>x.type!=='reasoning'));assert.ok(!JSON.stringify(response).includes('encrypted_content'));
 assert.throws(()=>converseRequest({...body,include:['unqualified-field']},model));
 assert.throws(()=>converseRequest({...body,include:['reasoning.encrypted_content'],reasoning:{summary:'auto'}},model));
});
