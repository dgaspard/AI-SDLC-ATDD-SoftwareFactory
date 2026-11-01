import {test} from 'node:test';
import assert from 'node:assert/strict';
import {secretsManagerStore} from './aws-secrets.mjs';
import {brokerUpstream} from './broker-upstream.mjs';
const binding={region:'us-east-1',secretArn:'arn:aws:secretsmanager:us-east-1:123456789012:secret:neutral-broker-Ab12Cd',versionId:'12345678-1234-1234-1234-123456789012'};
const secret='synthetic-offline-canary-12345';
const response=()=>({ARN:binding.secretArn,VersionId:binding.versionId,SecretString:secret});
test('Bedrock endpoint selection is owner-bound with no arbitrary URL or implicit Region',()=>{
 assert.equal(brokerUpstream({provider:'bedrock',endpoint:'runtime',region:'us-east-1'}),'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/responses');
 assert.equal(brokerUpstream({provider:'bedrock',endpoint:'mantle',region:'us-east-2'}),'https://bedrock-mantle.us-east-2.api.aws/v1/responses');
 assert.equal(brokerUpstream({provider:'bedrock',endpoint:'mantle-openai',region:'us-east-2'}),'https://bedrock-mantle.us-east-2.api.aws/openai/v1/responses');
 for(const extra of [{region:'east'},{region:'us-east-1.evil.test'},{url:'http://127.0.0.1'},{endpoint:'constructor'}])assert.throws(()=>brokerUpstream({provider:'bedrock',endpoint:'runtime',region:'us-east-1',...extra}));
});
test('Secrets Manager requests exactly the approved ARN/version and propagates cancellation',async()=>{
 const controller=new AbortController();let called=0;
 const store=secretsManagerStore({...binding,getSecretValue:async(input,options)=>{called++;assert.deepEqual(input,{SecretId:binding.secretArn,VersionId:binding.versionId});assert.equal(options.abortSignal,controller.signal);return response();}});
 assert.equal(await store.readSecret({signal:controller.signal}),secret);controller.abort();
 await assert.rejects(store.readSecret({signal:controller.signal}),/^Error: Credential unavailable$/);assert.equal(called,1);
});
test('Secret identity drift, binary/JSON secrets and reflected SDK errors fail closed',async()=>{
 for(const mutation of [{ARN:binding.secretArn+'wrong'},{VersionId:'different'},{SecretBinary:new Uint8Array([1])},{SecretString:'{"apiKey":"'+secret+'"}'},{SecretString:''}]){
  const store=secretsManagerStore({...binding,getSecretValue:async()=>({...response(),...mutation})});
  await assert.rejects(store.readSecret(),/^Error: Credential unavailable$/);
 }
 const store=secretsManagerStore({...binding,getSecretValue:async()=>{throw Error(secret);}});
 await assert.rejects(store.readSecret(),/^Error: Credential unavailable$/);
});
test('Secret selectors reject floating versions and cross-Region/partial identities before transport',()=>{
 for(const mutation of [{versionId:'AWSCURRENT'},{secretArn:'neutral-broker'},{region:'us-east-2'}])assert.throws(()=>secretsManagerStore({...binding,...mutation,getSecretValue:async()=>{assert.fail('transport reached');}}));
});
test('Cancellation while the SDK returns cannot release a secret',async()=>{
 const controller=new AbortController();const store=secretsManagerStore({...binding,getSecretValue:async()=>{controller.abort();return response();}});
 await assert.rejects(store.readSecret({signal:controller.signal}),/^Error: Credential unavailable$/);
});
