// Closed subset of Responses used by the reviewed local Codex profile.
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const string = v => typeof v === 'string';
const fields = (v, allowed, required=[]) => record(v) && Object.keys(v).every(k=>allowed.includes(k)) && required.every(k=>Object.hasOwn(v,k));
const optional = (v,k,check) => !Object.hasOwn(v,k) || check(v[k]);
const name = v => string(v) && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
const status = v => ['completed','in_progress','incomplete'].includes(v);
function textPart(v) {
  if (!record(v)) return false;
  if(v.type==='input_text') return fields(v,['type','text'],['text']) && string(v.text);
  if(v.type==='output_text') return fields(v,['type','text','annotations','logprobs'],['text']) && string(v.text) && optional(v,'annotations',x=>Array.isArray(x)&&x.length===0) && optional(v,'logprobs',x=>Array.isArray(x)&&x.length===0);
  if(v.type==='refusal') return fields(v,['type','refusal'],['refusal']) && string(v.refusal);
  return false;
}
export function localItem(v) {
  if(!record(v) || !optional(v,'id',x=>x===null||string(x)) || !optional(v,'status',status)) return false;
  switch(v.type) {
    case 'message': return fields(v,['type','id','status','role','content','phase'],['role','content']) && ['system','developer','user','assistant'].includes(v.role) && Array.isArray(v.content) && v.content.every(textPart) && optional(v,'phase',x=>['commentary','final_answer'].includes(x));
    case 'function_call': return fields(v,['type','id','status','call_id','name','arguments'],['call_id','name','arguments']) && string(v.call_id) && name(v.name) && string(v.arguments);
    case 'function_call_output': return fields(v,['type','id','status','call_id','output'],['call_id','output']) && string(v.call_id) && string(v.output);
    case 'custom_tool_call': return fields(v,['type','id','status','call_id','name','input'],['call_id','name','input']) && string(v.call_id) && name(v.name) && string(v.input);
    case 'custom_tool_call_output': return fields(v,['type','id','status','call_id','output'],['call_id','output']) && string(v.call_id) && string(v.output);
    case 'reasoning': return fields(v,['type','id','status','summary','content','encrypted_content'],['summary']) && Array.isArray(v.summary) && v.summary.every(x=>fields(x,['type','text'],['type','text'])&&x.type==='summary_text'&&string(x.text)) && optional(v,'content',x=>Array.isArray(x)&&x.every(y=>fields(y,['type','text'],['type','text'])&&y.type==='reasoning_text'&&string(y.text))) && optional(v,'encrypted_content',x=>x===null||string(x));
    default: return false;
  }
}
function schema(v, depth=0) {
  if(depth>32) return false;
  if(Array.isArray(v)) return v.every(x=>schema(x,depth+1));
  if(record(v)) return Object.entries(v).every(([k,x])=>!(k==='$ref'&&(!string(x)||!x.startsWith('#')))&&schema(x,depth+1));
  return v===null || ['string','number','boolean'].includes(typeof v);
}
function localTool(v) {
  if(!record(v)||!name(v.name)||!optional(v,'description',string)) return false;
  if(v.type==='function') return fields(v,['type','name','description','parameters','strict'],['parameters']) && record(v.parameters) && schema(v.parameters) && optional(v,'strict',x=>x===null||typeof x==='boolean');
  if(v.type==='custom') return fields(v,['type','name','description','format']) && optional(v,'format',f=>fields(f,['type','syntax','definition'],['type'])&&((f.type==='text'&&Object.keys(f).length===1)||(f.type==='grammar'&&['lark','regex'].includes(f.syntax)&&string(f.definition))));
  return false; // No hosted tool, namespace, MCP, browser or remote execution.
}
export function normalizeRequest(body, model, maxOutputTokens) {
  const keys=['model','input','instructions','max_output_tokens','store','stream','background','tools','tool_choice','parallel_tool_calls','reasoning','include','text','prompt_cache_key','client_metadata'];
  if(!fields(body,keys,['model','input','store']) || body.model!==model || body.store!==false ||
     !(string(body.input)||(Array.isArray(body.input)&&body.input.every(localItem))) ||
     !optional(body,'instructions',string)||!optional(body,'background',x=>x===false)||
     !optional(body,'stream',x=>typeof x==='boolean')||
     !optional(body,'tools',x=>Array.isArray(x)&&x.every(localTool)&&new Set(x.map(t=>t.name)).size===x.length)||
     !optional(body,'tool_choice',x=>['auto','none','required'].includes(x))||
     !optional(body,'parallel_tool_calls',x=>typeof x==='boolean')||
     !optional(body,'reasoning',x=>fields(x,['effort','summary'])&&optional(x,'effort',v=>['none','minimal','low','medium','high','xhigh'].includes(v))&&optional(x,'summary',v=>['auto','concise','detailed'].includes(v)))||
     !optional(body,'include',x=>Array.isArray(x)&&x.every(y=>y==='reasoning.encrypted_content'))||
     !optional(body,'text',x=>fields(x,['verbosity','format'])&&optional(x,'verbosity',v=>['low','medium','high'].includes(v))&&optional(x,'format',v=>fields(v,['type'],['type'])&&v.type==='text'))||
     !optional(body,'prompt_cache_key',string)||!optional(body,'client_metadata',x=>record(x)&&Object.values(x).every(string))) return null;
  const limit=body.max_output_tokens??maxOutputTokens;
  if(!Number.isSafeInteger(limit)||limit<1||limit>maxOutputTokens) return null;
  // Client tracing and cache affinity are not authority; never forward them.
  const {client_metadata,prompt_cache_key,...request}=body;
  return {...request,max_output_tokens:limit};
}
const eventTypes = new Set([
  'response.created','response.in_progress','response.completed',
  'response.output_item.added','response.output_item.done','response.content_part.added','response.content_part.done',
  'response.output_text.delta','response.output_text.done','response.refusal.delta','response.refusal.done',
  'response.function_call_arguments.delta','response.function_call_arguments.done',
  'response.custom_tool_call_input.delta','response.custom_tool_call_input.done',
  'response.reasoning_summary_part.added','response.reasoning_summary_part.done',
  'response.reasoning_summary_text.delta','response.reasoning_summary_text.done',
  'response.reasoning_text.delta','response.reasoning_text.done'
]);
export function assertNoSecrets(value,secrets) {
  if(typeof value==='string' && secrets.some(s=>s&&value.includes(s)))throw new Error('Secret reflection');
  if(Array.isArray(value))for(const item of value)assertNoSecrets(item,secrets);
  else if(record(value))for(const [key,item] of Object.entries(value)){assertNoSecrets(key,secrets);assertNoSecrets(item,secrets);}
}
function terminalItem(v) {
  return localItem(v) && (!('status'in v)||v.status==='completed') &&
    (!('id'in v)||string(v.id)) &&
    (v.type!=='message'||(v.role==='assistant'&&v.content.every(p=>['output_text','refusal'].includes(p.type))));
}
export function validateResponse(value,secrets=[]) {
  assertNoSecrets(value,secrets);
  if(!record(value)||value.object!=='response'||!string(value.id)||value.status!=='completed'||!Array.isArray(value.output)||!value.output.every(terminalItem)||value.error||value.incomplete_details)throw new Error('Incomplete response');
}
const index = n => Number.isSafeInteger(n)&&n>=0;
const canonical = v => JSON.stringify(v,(_,x)=>record(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export function validateStream(bytes,secrets=[]) {
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/\r\n/g,'\n');
  if(!text.endsWith('\n\n')) throw new Error('Truncated event');
  let id=null, completed=false, count=0, sequence=null;
  const items=new Map(),deltas=new Map(),dones=[],parts=[];
  for(const block of text.split('\n\n')) {
    if(!block) continue;
    let event=null;const data=[];
    for(const line of block.split('\n')) {
      if(line.startsWith(':')) continue;
      const i=line.indexOf(':'),key=i<0?line:line.slice(0,i),value=(i<0?'':line.slice(i+1)).replace(/^ /,'');
      if(key==='data') data.push(value);else if(key==='event'&&event===null)event=value;else throw new Error('Unsupported SSE field');
    }
    if(!data.length) continue;
    if(completed) throw new Error('Data after completion');
    const e=JSON.parse(data.join('\n'));assertNoSecrets(e,secrets);
    if(!record(e)||!eventTypes.has(e.type)||(event!==null&&event!==e.type)) throw new Error('Unsupported event');
    if(count++===0&&e.type!=='response.created') throw new Error('Missing start');
    if('sequence_number'in e){if(!index(e.sequence_number)||(sequence!==null&&e.sequence_number<=sequence))throw new Error('Bad sequence');sequence=e.sequence_number;}
    const responseEvent=['response.created','response.in_progress','response.completed'].includes(e.type);
    if(responseEvent) {
      const v=e.response;
      if(!record(v)||v.object!=='response'||!string(v.id)||!Array.isArray(v.output)||!v.output.every(localItem)||v.error||v.incomplete_details) throw new Error('Invalid response');
      if(id===null)id=v.id;else if(id!==v.id)throw new Error('Response identity changed');
      if(e.type!=='response.completed'&&v.status!=='in_progress')throw new Error('Invalid progress status');
    } else if('response'in e) throw new Error('Unexpected response payload');
    if(e.type==='response.created'&&count!==1)throw new Error('Invalid start');
    if(e.type.startsWith('response.output_item.')) {
      if(!index(e.output_index)||!localItem(e.item))throw new Error('Missing output item');
      const prior=items.get(e.output_index);
      if(prior&&(prior.done||prior.item.id!==e.item.id||prior.item.type!==e.item.type))throw new Error('Output identity changed');
      const done=e.type.endsWith('.done');if(done&&!terminalItem(e.item))throw new Error('Incomplete output item');
      items.set(e.output_index,{item:e.item,done});
    }
    if(e.type.includes('_part.')) {
      if(!index(e.output_index)||!string(e.item_id)||!record(e.part)||!index(e.content_index??e.summary_index))throw new Error('Missing content part');
      if(!textPart(e.part)&&!(fields(e.part,['type','text'],['type','text'])&&e.part.type==='summary_text'&&string(e.part.text)))throw new Error('Unsupported content');
      if(e.type.endsWith('.done'))parts.push({index:e.output_index,id:e.item_id,part:e.content_index??e.summary_index,summary:e.type.includes('summary'),value:e.part});
    }
    if(e.type.endsWith('.delta')) {
      if(!string(e.delta)||!index(e.output_index)||!string(e.item_id))throw new Error('Invalid delta');
      const family=e.type.slice(0,-6),key=JSON.stringify([family,e.output_index,e.item_id,e.content_index??e.summary_index??null]);
      const value=(deltas.get(key)?.text??'')+e.delta;assertNoSecrets(value,secrets);
      deltas.set(key,{text:value,family,index:e.output_index,id:e.item_id,part:e.content_index??e.summary_index??null});
    }
    if(e.type.endsWith('.done')&&!e.type.includes('_item.')&&!e.type.includes('_part.')) {
      const value=e.type.includes('function_call_arguments')?e.arguments:e.type.includes('custom_tool_call_input')?e.input:e.type.includes('refusal')?e.refusal:e.text;
      if(!string(value)||!index(e.output_index)||!string(e.item_id))throw new Error('Invalid completed content');
      const key=JSON.stringify([e.type.slice(0,-5),e.output_index,e.item_id,e.content_index??e.summary_index??null]);
      if(deltas.has(key)&&deltas.get(key).text!==value)throw new Error('Content differs from deltas');
      dones.push({text:value,family:e.type.slice(0,-5),index:e.output_index,id:e.item_id,part:e.content_index??e.summary_index??null});
    }
    if(e.type==='response.completed') {
      validateResponse(e.response,secrets);
      for(const [i,item] of items)if(!item.done||canonical(e.response.output[i])!==canonical(item.item))throw new Error('Terminal output mismatch');
      for(const p of parts){const item=e.response.output[p.index];if(!item||item.id!==p.id||canonical((p.summary?item.summary:item.content)?.[p.part])!==canonical(p.value))throw new Error('Terminal part mismatch');}
      for(const d of [...deltas.values(),...dones]) {
        const item=e.response.output[d.index];if(!item||item.id!==d.id)throw new Error('Delta identity mismatch');
        const value=d.family==='response.function_call_arguments'?item.arguments:d.family==='response.custom_tool_call_input'?item.input:d.family.startsWith('response.reasoning_summary')?item.summary?.[d.part]?.text:d.family==='response.reasoning_text'?item.content?.[d.part]?.text:d.family==='response.refusal'?item.content?.[d.part]?.refusal:item.content?.[d.part]?.text;
        if(value!==d.text)throw new Error('Terminal content mismatch');
      }
      completed=true;
    }
  }
  if(!completed)throw new Error('Missing completion');
}
