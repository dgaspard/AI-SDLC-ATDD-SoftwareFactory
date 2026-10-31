import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateNativeProof} from './native-audit-proof.mjs';
const jsonl=xs=>Buffer.from(xs.map(x=>JSON.stringify(x)+'\n').join(''));
function fixture(){return {receipt:{schemaVersion:1,scope:'native observer component',realRunnerQualified:false,exitCode:0,workloadExitCode:0,denials:0,events:6,traceRecords:5,identityRecords:1,observerCleanupConfirmed:true},trace:[{seq:1,event:'start',tid:2},{seq:2,event:'entry',tid:2,nr:64},{seq:3,event:'bound-start',tid:2,entry:2,rootMount:1,rootInode:1,cwdMount:2,cwdInode:3,stopped:[{tid:2,startTime:42}]},{seq:4,event:'bound-exit',tid:2,entry:2,nr:64,bindings:1,disposition:1,kernelResult:1,result:1,denied:false},{seq:5,event:'exit',tid:2}],identities:[{seq:1,entry:2,tid:2,mount:2,inode:4,disposition:1}]};}
const verify=f=>validateNativeProof(f.receipt,jsonl(f.trace),jsonl(f.identities),0);
test('native identity ledger closes an authorized syscall',()=>assert.equal(verify(fixture()).coverageClosed,true));
for(const [name,alter] of [
 ['missing identity stream',f=>{f.identities=[];}],
 ['missing identities with altered count',f=>{f.identities=[];f.receipt.identityRecords=0;}],
 ['missing trace record',f=>{f.trace.splice(2,1);} ],
 ['sequence gap',f=>{f.trace[2].seq=8;}],
 ['unaccounted task',f=>{f.trace[1].tid=3;}],
 ['missing stopped writer',f=>{f.trace[2].stopped=[];}],
 ['identity from another syscall',f=>{f.identities[0].entry=1;}],
 ['duplicate binding disposition',f=>{f.trace.splice(4,0,{...f.trace[3],seq:5});f.trace[5].seq=6;f.receipt.traceRecords=6;}],
 ['false success',f=>{f.receipt.workloadExitCode=1;}],
 ['unconfirmed cleanup',f=>{f.receipt.observerCleanupConfirmed=false;}],
])test('native proof rejects '+name,()=>{const f=fixture();alter(f);assert.throws(()=>verify(f));});
test('native proof rejects truncated JSONL',()=>{const f=fixture();assert.throws(()=>validateNativeProof(f.receipt,jsonl(f.trace).subarray(0,-1),jsonl(f.identities),0),/Truncated/);});
