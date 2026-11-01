import {BedrockRuntimeClient,ConverseCommand} from '@aws-sdk/client-bedrock-runtime';
import {fromIni} from '@aws-sdk/credential-provider-ini';
import {createConverseTransport} from '../bedrock-converse.mjs';
export function createProfileConverseTransport({region,profile,model}){
 if(typeof profile!=='string'||!/^[\w-]+$/.test(profile)||typeof region!=='string'||!/^(us|eu|ap|ca|sa|me|af|il|mx)-[a-z]+-\d$/.test(region)||typeof model!=='string'||!/^[\w.:-]+$/.test(model))throw Error('Explicit AWS Region, profile and model required');
 const client=new BedrockRuntimeClient({region,credentials:fromIni({profile}),maxAttempts:1,endpoint:`https://bedrock-runtime.${region}.amazonaws.com`,ignoreConfiguredEndpointUrls:true});
 const transport=createConverseTransport({model,send:(input,options)=>client.send(new ConverseCommand(input),options)});
 return Object.freeze({...transport,close:()=>client.destroy()});
}

// Explicit owner-side component wiring; never mounts the profile into a runner.
export async function createProfileModelBroker({runId,region,profile,model,...limits}){
 const {createModelBroker}=await import('../model-broker.mjs');
 const allowed=new Set(['ttlMs','maxRequests','maxConcurrent','requestBytes','responseBytes','timeoutMs','maxOutputTokens','audit']);
 if(Object.keys(limits).some(k=>!allowed.has(k)))throw Error('Unsupported profile broker option');
 const transport=createProfileConverseTransport({region,profile,model});
 try {
  const broker=createModelBroker({runId,model,...limits,upstreamConfig:{provider:'bedrock',region,endpoint:'runtime'},converseTransport:transport});
  return Object.freeze({...broker,async close(){try{await broker.close();}finally{transport.close();}}});
 } catch(error){transport.close();throw error;}
}
