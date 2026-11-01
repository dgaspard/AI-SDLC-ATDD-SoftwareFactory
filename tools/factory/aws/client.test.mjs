import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAwsSecretsManagerStore} from './client.mjs';
const binding={region:'us-east-1',secretArn:'arn:aws:secretsmanager:us-east-1:123456789012:secret:neutral-broker-Ab12Cd',versionId:'12345678-1234-1234-1234-123456789012'};
test('SDK adapter refuses default credentials and never resolves explicit credentials during construction',()=>{
 assert.throws(()=>createAwsSecretsManagerStore(binding),/Explicit owner-approved/);
 let calls=0;const store=createAwsSecretsManagerStore({...binding,credentials:async()=>{calls++;throw Error('No live identity in offline test');}});
 assert.equal(calls,0);store.close();assert.equal(calls,0);
});
