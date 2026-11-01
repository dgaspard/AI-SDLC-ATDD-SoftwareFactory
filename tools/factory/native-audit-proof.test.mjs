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

function terminalFixture(){const f=fixture();Object.assign(f.trace[1],{nr:56,args:['ffffffffffffff9c','1000','802','0','0','0']});Object.assign(f.trace[3],{nr:56,disposition:4,kernelResult:-38,result:-6});Object.assign(f.identities[0],{disposition:4,kind:'terminal-probe',flags:2050,deviceMajor:5,deviceMinor:0,startTime:42,session:2,controllingTerminal:0});return f;}
test('terminal emulation requires a closed suppressed syscall with no descriptor',()=>assert.equal(verify(terminalFixture()).coverageClosed,true));
for(const [name,alter] of [
 ['flags',f=>f.trace[1].args[2]='2'],['device',f=>f.identities[0].deviceMinor=1],
 ['session',f=>delete f.identities[0].session],['process',f=>f.identities[0].startTime=99],
 ['controlling terminal',f=>f.identities[0].controllingTerminal=123],['missing disposition',f=>delete f.identities[0].kind],
 ['kernel executed',f=>f.trace[3].kernelResult=3],['returned descriptor',f=>f.trace[3].result=3],
 ['missing target',f=>{f.identities=[];f.receipt.identityRecords=0;f.trace[3].bindings=0;}],
 ['substituted operation',f=>f.trace[1].nr=64],['stale terminal evidence',f=>f.identities[0].entry=1]
])test('terminal proof rejects '+name,()=>{const f=terminalFixture();alter(f);assert.throws(()=>verify(f));});

for(const [name,nr,args] of [['probe',56,['ffffffffffffff9c','1000','802','0','0','0']],['query',29,['2','540f','1000','0','0','0']]])test('terminal proof rejects whole '+name+' binding removal',()=>{
 const f=terminalFixture();f.identities=[];f.receipt.identityRecords=0;f.trace=[f.trace[0],{seq:2,event:'entry',tid:2,nr,args},{seq:3,event:'exit-syscall',tid:2,nr,result:-6},{seq:4,event:'exit',tid:2}];f.receipt.traceRecords=4;assert.throws(()=>verify(f),/Missing mandatory/);
});

for(const disposition of [2,3])test('terminal proof rejects substituted disposition '+disposition,()=>{const f=terminalFixture();f.identities=[];f.receipt.identityRecords=0;Object.assign(f.trace[3],{disposition,bindings:0});assert.throws(()=>verify(f),/Invalid writable probe disposition/);});
