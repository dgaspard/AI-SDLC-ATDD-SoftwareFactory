import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProfileConverseTransport,createProfileModelBroker} from './converse.mjs';
const config={region:'us-east-1',profile:'offline-profile-does-not-exist',model:'us.moonshotai.kimi-k3'};
test('profile Converse construction performs no credential lookup and requires an explicit profile',()=>{
 for(const profile of [undefined,'','../default'])assert.throws(()=>createProfileConverseTransport({...config,profile}));
 const transport=createProfileConverseTransport(config);transport.close();
});
test('owner-side broker wiring accepts bounded configuration without reading credentials',async()=>{
 const broker=await createProfileModelBroker({runId:'offline-profile',...config,timeoutMs:50});await broker.close();
 await assert.rejects(createProfileModelBroker({runId:'offline-profile',...config,credentialStore:{readSecret(){throw Error('must not run');}}}),/Unsupported/);
});
