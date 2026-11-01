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

function routeFixture(){const f=fixture();Object.assign(f.trace[1],{nr:200,args:['3','1000','c','0','0','0']});Object.assign(f.trace[2],{addressFamily:16,netlinkPort:0,netlinkGroups:0,netlinkPadding:0});Object.assign(f.trace[3],{nr:200,result:0,kernelResult:0});Object.assign(f.identities[0],{kind:'route-socket',operation:'bind',fd:3,domain:16,type:3,protocol:0,localPort:0,groups:0,netCookie:7,ownerNetCookie:7});return f;}
test('route socket proof binds current protocol namespace and native result',()=>assert.equal(verify(routeFixture()).coverageClosed,true));
for(const [name,alter] of [
 ['protocol',f=>f.identities[0].protocol=2],['domain',f=>f.identities[0].domain=2],['type',f=>f.identities[0].type=2],
 ['namespace',f=>f.identities[0].netCookie=8],['groups',f=>f.trace[2].netlinkGroups=1],['port',f=>f.trace[2].netlinkPort=1],['padding',f=>f.trace[2].netlinkPadding=1],
 ['descriptor',f=>f.identities[0].fd=4],['length',f=>f.trace[1].args[2]='b'],['native result',f=>f.trace[3].result=1],
 ['substituted family',f=>f.trace[2].addressFamily=2],['missing address',f=>delete f.trace[2].addressFamily],['missing identity',f=>{f.identities=[];f.receipt.identityRecords=0;Object.assign(f.trace[3],{bindings:0,disposition:2});}],
 ['missing group',f=>{f.identities=[];f.receipt.identityRecords=0;f.trace=[f.trace[0],f.trace[1],{seq:3,event:'exit-syscall',tid:2,nr:200,result:0},{seq:4,event:'exit',tid:2}];f.receipt.traceRecords=4;}]
])test('route socket proof rejects '+name,()=>{const f=routeFixture();alter(f);assert.throws(()=>verify(f));});

function routeReceiveFixture(){const f=routeFixture();Object.assign(f.trace[1],{nr:212,args:['3','1000','0','0','0','0']});Object.assign(f.trace[3],{nr:212,result:-11,kernelResult:-11});f.identities[0].operation='receive';return f;}
test('route receive proof preserves native failure',()=>assert.equal(verify(routeReceiveFixture()).coverageClosed,true));
for(const [name,alter] of [['native result',f=>f.trace[3].result=0],['flags',f=>f.trace[1].args[2]='2'],['operation',f=>f.identities[0].operation='bind'],['protocol',f=>f.identities[0].protocol=2],['namespace',f=>f.identities[0].ownerNetCookie=8],['missing binding',f=>{f.identities=[];f.receipt.identityRecords=0;Object.assign(f.trace[3],{bindings:0,disposition:2});}]])test('route receive rejects '+name,()=>{const f=routeReceiveFixture();alter(f);assert.throws(()=>verify(f));});
