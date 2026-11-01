import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateConsumerProof} from './consumer-proof.mjs';
const hash='a'.repeat(64), revision='b'.repeat(40);
const expected={repository:'neutral/consumer',revision,treeSha256:hash,factoryRevision:revision,configSha256:hash,policySha256:hash,manifestSha256:hash,requiredSuites:['acceptance'],requiredEvidence:['out/result.json']};
const inventory=[{path:'out/result.json',sha256:hash}];
function proof(){return {schemaVersion:1,status:'COMPLETE',mode:'full',category:null,consumer:{repository:expected.repository,revision,treeSha256:hash},factory:{revision},configuration:{sha256:hash},trust:{policySha256:hash,manifestSha256:hash},suites:[{id:'acceptance',exitCode:0}],artifacts:structuredClone(inventory)};}
test('complete proof matches independent authority and collected bytes',()=>assert.equal(validateConsumerProof(proof(),expected,inventory),true));
for(const [name,edit] of Object.entries({failed:e=>e.suites[0].exitCode=1,missingSuite:e=>e.suites=[],duplicateSuite:e=>e.suites.push({...e.suites[0]}),staleTree:e=>e.consumer.treeSha256='c'.repeat(64),wrongFactory:e=>e.factory.revision='c'.repeat(40),wrongTrust:e=>e.trust.policySha256='c'.repeat(64),missingEvidence:e=>e.artifacts=[],staleArtifact:e=>e.artifacts[0].sha256='c'.repeat(64),duplicateArtifact:e=>e.artifacts.push({...e.artifacts[0]}),escape:e=>e.artifacts[0].path='../out/result.json',incomplete:e=>e.status='INCOMPLETE'}))test('reject '+name,()=>{const e=proof();edit(e);assert.throws(()=>validateConsumerProof(e,expected,inventory),{category:'EVIDENCE_INVALID'});});
