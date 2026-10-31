// Closed Responses -> Converse bridge. No credentials or network in this module.
import crypto from 'node:crypto';
import {normalizeRequest} from './broker-protocol.mjs';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
export function converseRequest(body,model){
 const b=normalizeRequest(body,model,8192);if(!b)throw Error('Invalid broker request');
 // The pinned CLI always sends the legacy encrypted-content include. This bridge
 // returns no reasoning items, so it adds no encrypted state or placeholder content.
 if(b.text!==undefined||b.reasoning?.summary!==undefined)throw Error('Unsupported Converse response controls');
 if(b.reasoning?.effort!==undefined)throw Error('Explicit reasoning effort is not qualified through Kimi Converse');
 const system=[],messages=[];
 if(b.instructions)system.push({text:b.instructions});
 function append(role,content){if(!content.length)return;const last=messages.at(-1);if(last?.role===role)last.content.push(...content);else messages.push({role,content});}
 const input=typeof b.input==='string'?[{type:'message',role:'user',content:[{type:'input_text',text:b.input}]}]:b.input;
 const calls=new Set(),pending=new Set();
 for(const item of input){
  if(item.type==='reasoning')continue; // Kimi Converse rejects previous-turn reasoning blocks.
  if(item.type==='message'){
   const content=item.content.map(p=>{if(!['input_text','output_text'].includes(p.type)||!p.text)throw Error('Unsupported content');return {text:p.text};});
   if(['system','developer'].includes(item.role)){if(messages.length)throw Error('Late system instructions unsupported');system.push(...content);}else {if(pending.size)throw Error('Missing tool results');append(item.role,content);}continue;
  }
  if(item.type==='function_call'){
   if(calls.has(item.call_id)||!/^[\w-]{1,64}$/.test(item.call_id)||!/^[\w-]{1,64}$/.test(item.name))throw Error('Invalid tool identity');
   const input=JSON.parse(item.arguments);if(!object(input))throw Error('Tool input must be an object');
   calls.add(item.call_id);pending.add(item.call_id);append('assistant',[{toolUse:{toolUseId:item.call_id,name:item.name,input}}]);continue;
  }
  if(item.type==='function_call_output'){
   if(!pending.delete(item.call_id))throw Error('Orphan tool result');append('user',[{toolResult:{toolUseId:item.call_id,content:[{text:item.output}]}}]);continue;
  }
  throw Error('Custom or unsupported tool cannot be translated to Converse');
 }
 if(!messages.length||messages[0].role!=='user'||messages.at(-1).role!=='user'||pending.size)throw Error('Incomplete Converse history');
 const request={modelId:model,messages,inferenceConfig:{maxTokens:b.max_output_tokens}};
 if(system.length)request.system=system;
 if(b.tools?.length&&b.tool_choice!=='none'){
  const tools=b.tools.map(t=>{if(t.type!=='function'||t.strict===true||!/^[\w-]{1,64}$/.test(t.name))throw Error('Unsupported Converse tool');return {toolSpec:{name:t.name,...(t.description?{description:t.description}:{}),inputSchema:{json:t.parameters}}};});
  request.toolConfig={tools,toolChoice:b.tool_choice==='required'?{any:{}}:{auto:{}}};
 }
 if(b.tool_choice==='required'&&!request.toolConfig)throw Error('Required tool missing');
 return request;
}
export function converseResponse(value,body){
 if(!['end_turn','tool_use'].includes(value?.stopReason)||value.output?.message?.role!=='assistant'||!Array.isArray(value.output.message.content))throw Error('Incomplete Converse response');
 const definitions=new Map((body.tools??[]).map(t=>[t.name,t]));const ids=new Set(),output=[];
 for(const block of value.output.message.content){
  if(Object.keys(block).length===1&&object(block.reasoningContent))continue;
  if(typeof block.text==='string'&&Object.keys(block).length===1){if(block.text)output.push({type:'message',id:'msg_'+crypto.randomUUID(),role:'assistant',status:'completed',content:[{type:'output_text',text:block.text,annotations:[]}]});continue;}
  const t=block.toolUse;
  if(Object.keys(block).length===1&&t&&definitions.get(t.name)?.type==='function'&&body.tool_choice!=='none'&&/^[\w-]{1,64}$/.test(t.toolUseId)&&!ids.has(t.toolUseId)&&object(t.input)){
   ids.add(t.toolUseId);output.push({type:'function_call',id:'fc_'+crypto.randomUUID(),call_id:t.toolUseId,name:t.name,arguments:JSON.stringify(t.input),status:'completed'});continue;
  }
  throw Error('Unsupported Converse output');
 }
 if(body.parallel_tool_calls===false&&ids.size>1)throw Error('Parallel tool calls disabled');
 if(!output.length||(value.stopReason==='tool_use')!==(ids.size>0)||(body.tool_choice==='required'&&!ids.size))throw Error('Inconsistent Converse stop reason');
 return {id:'resp_'+crypto.randomUUID(),object:'response',status:'completed',model:body.model,output};
}
export function createConverseTransport({model,send}){
 if(typeof send!=='function'||typeof model!=='string')throw Error('Explicit Converse transport required');
 return Object.freeze({async request(body,{signal}){
  const request=converseRequest(body,model),value=await send(request,{abortSignal:signal});
  if(signal.aborted)throw Error('Converse cancelled');
  const response=converseResponse(value,body);
  const payload=body.stream?[
   {type:'response.created',response:{...response,status:'in_progress',output:[]}},
   ...response.output.map((item,output_index)=>({type:'response.output_item.done',item,output_index})),
   {type:'response.completed',response}
  ].map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''):JSON.stringify(response);
  return new Response(payload,{headers:{'content-type':body.stream?'text/event-stream':'application/json'}});
 }});
}
