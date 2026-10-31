// Shared semantic check. Expectations must come from coordinator-validated authority,
// never from the verifier's stdout or its evidence document.
import {need,relative} from './change-support.mjs';
export function validateConsumerProof(e,expected,inventory){
 const check=(ok,message)=>need(ok,'EVIDENCE_INVALID',message);
 check(e&&e.schemaVersion===1&&e.mode==='full'&&e.status==='COMPLETE'&&e.category===null,'Incomplete consumer proof');
 for(const [actual,wanted] of [[e.consumer?.repository,expected.repository],[e.consumer?.revision,expected.revision],[e.consumer?.treeSha256,expected.treeSha256],[e.factory?.revision,expected.factoryRevision],[e.configuration?.sha256,expected.configSha256],[e.trust?.policySha256,expected.policySha256],[e.trust?.manifestSha256,expected.manifestSha256]])check(typeof wanted==='string'&&wanted.length>0&&actual===wanted,'Consumer proof identity mismatch');
 check(Array.isArray(expected.requiredSuites)&&expected.requiredSuites.length>0&&Array.isArray(expected.requiredEvidence)&&expected.requiredEvidence.length>0,'Missing trusted proof requirements');
 check(Array.isArray(e.suites)&&e.suites.every(s=>s&&typeof s.id==='string'&&s.exitCode===0)&&new Set(e.suites.map(s=>s.id)).size===e.suites.length,'Failed or duplicate consumer suite');
 check(expected.requiredSuites.every(id=>e.suites.some(s=>s.id===id)),'Missing required consumer suite');
 check(Array.isArray(e.artifacts)&&Array.isArray(inventory),'Missing artifact inventory');
 const paths=new Set();
 for(const a of e.artifacts){
  check(a&&typeof a.path==='string'&&/^[a-f0-9]{64}$/.test(a.sha256),'Invalid consumer artifact');
  try{relative(a.path);}catch{check(false,'Unsafe consumer artifact path');}
  check(!paths.has(a.path),'Duplicate consumer artifact');paths.add(a.path);
  check(inventory.some(i=>i.path===a.path&&i.sha256===a.sha256),'Stale or missing consumer artifact');
 }
 check(expected.requiredEvidence.every(p=>paths.has(p)),'Missing required consumer evidence');
 return true;
}
