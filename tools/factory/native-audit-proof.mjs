// Independent structural verification after container cleanup. Platform qualification is separate.
export function validateNativeProof(receipt, traceBytes, identityBytes, exitCode) {
 const keys=['schemaVersion','scope','realRunnerQualified','exitCode','workloadExitCode','denials','events','traceRecords','identityRecords','observerCleanupConfirmed'];
 const integer=n=>Number.isSafeInteger(n)&&n>=0, positive=n=>integer(n)&&n>0;
 if(!receipt||Object.keys(receipt).sort().join()!==keys.sort().join()||receipt.schemaVersion!==1||receipt.scope!=='native observer component'||receipt.realRunnerQualified!==false||receipt.observerCleanupConfirmed!==true||receipt.exitCode!==exitCode||![0,5,6,10].includes(exitCode)||!['denials','events','traceRecords','identityRecords','workloadExitCode'].every(k=>integer(receipt[k])))throw Error('Invalid native receipt');
 function lines(bytes){const s=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(s&&!s.endsWith('\n'))throw Error('Truncated native records');return s?s.slice(0,-1).split('\n').map(l=>JSON.parse(l)):[];}
 const records=lines(traceBytes),identities=lines(identityBytes),live=new Set(),entries=new Map(),bound=new Map(),bindings=new Map(),finished=new Set();let denials=0,started=false;
 if(records.length!==receipt.traceRecords||identities.length!==receipt.identityRecords)throw Error('Missing native records');
 for(const [index,r] of identities.entries()){
  if(r.seq!==index+1||!positive(r.entry)||!positive(r.tid)||![-1,0,1,4].includes(r.disposition)||(r.disposition===-1&&exitCode!==5)||!positive(r.mount)||!positive(r.inode))throw Error('Invalid target binding');
  const list=bindings.get(r.entry)??[];list.push(r);bindings.set(r.entry,list);
 }
 for(const [index,r] of records.entries()){
  if(r.seq!==index+1||!positive(r.tid))throw Error('Invalid native record identity');
  if(r.event==='start'){if(started||index!==0)throw Error('Invalid trace start');started=true;live.add(r.tid);continue;}
  if(!started||!live.has(r.tid))throw Error('Unaccounted native task');
  if(r.event==='birth'){if(!positive(r.child)||live.has(r.child))throw Error('Invalid birth identity');live.add(r.child);}
  else if(r.event==='exit')live.delete(r.tid);
  else if(r.event==='exec'){if(r.former!==r.tid)throw Error('Unsupported exec remap');}
  else if(r.event==='entry')entries.set(r.seq,r);
  else if(r.event==='bound-start'){
   const e=entries.get(r.entry);
   if(!e||e.tid!==r.tid||bound.has(r.entry)||!['rootMount','rootInode','cwdMount','cwdInode'].every(k=>positive(r[k]))||!Array.isArray(r.stopped)||new Set(r.stopped.map(t=>t.tid)).size!==live.size||r.stopped.length!==live.size||r.stopped.some(t=>!live.has(t.tid)||!positive(t.startTime)))throw Error('Incomplete stopped-task context');
   bound.set(r.entry,r);
  }else if(r.event==='bound-exit'){
   const e=entries.get(r.entry),list=bindings.get(r.entry)??[];
   if(!e||e.tid!==r.tid||e.nr!==r.nr||!bound.has(r.entry)||finished.has(r.entry)||!integer(r.bindings)||list.length!==r.bindings||list.some(b=>b.tid!==r.tid)||![0,1,2,3,4].includes(r.disposition)||r.denied!==(r.disposition===0)||!Number.isSafeInteger(r.result)||!Number.isSafeInteger(r.kernelResult))throw Error('Incomplete syscall binding');
   if(e.nr===56&&e.args?.[2]==='802'&&(![0,1,4].includes(r.disposition)||!list.length))throw Error('Invalid writable probe disposition');
   const probes=list.filter(b=>b.kind==='terminal-probe');
   if(r.disposition===4||probes.length){
    const b=probes[0],context=bound.get(r.entry),task=context.stopped.find(t=>t.tid===r.tid);
    if(list.length!==1||probes.length!==1||e.nr!==56||!Array.isArray(e.args)||e.args[2]!=='802'||b.flags!==2050||b.deviceMajor!==5||b.deviceMinor!==0||!positive(b.startTime)||b.startTime!==task?.startTime||!positive(b.session)||!Number.isSafeInteger(b.controllingTerminal)||r.kernelResult!==-38)throw Error('Invalid terminal probe evidence');
    if(r.disposition===4){if(b.disposition!==4||b.controllingTerminal!==0||r.result!==-6||r.denied)throw Error('Invalid no-terminal emulation');}
    else if(r.disposition!==0||b.disposition!==0||b.controllingTerminal===0)throw Error('Invalid controlling-terminal denial');
   }
   if(e.nr===29&&e.args?.[1]==='540f'&&(list.length!==1||list[0].kind!=='terminal-query'))throw Error('Missing terminal query identity');
   for(const b of list.filter(b=>b.kind==='terminal-query')){
    const mode=b.mode&0xf000,safe=[0x8000,0x1000,0xc000].includes(mode)||(mode===0x2000&&((b.deviceMajor>=136&&b.deviceMajor<=143)||(b.deviceMajor===5&&b.deviceMinor===0)));
    if(!safe||!integer(b.mode)||!integer(b.deviceMajor)||!integer(b.deviceMinor)||!integer(b.fd)||e.nr!==29||e.args?.[1]!=='540f'||parseInt(e.args?.[0],16)!==b.fd||b.request!==21519||r.disposition!==1||r.result!==r.kernelResult)throw Error('Invalid terminal query binding');
   }
   if(r.disposition===1&&(!list.length||list.some(b=>b.disposition!==1)))throw Error('Missing authorized target');
   if(r.disposition===2&&list.length)throw Error('Unexpected nonmutation binding');
   if(r.denied){if(![-1,-2].includes(r.result))throw Error('Invalid injected denial');denials++;}
   finished.add(r.entry);
  }else if(r.event!=='exit-syscall')throw Error('Unknown native event');
 }
 for(const [entry,list] of bindings)if(!bound.has(entry)||list.some(b=>entries.get(entry)?.tid!==b.tid)||(exitCode!==5&&!finished.has(entry)))throw Error('Orphaned target binding');
 if(exitCode!==5)for(const [seq,e] of entries)if((e.nr===56&&e.args?.[2]==='802')||(e.nr===29&&e.args?.[1]==='540f')){if(!bound.has(seq)||!finished.has(seq))throw Error('Missing mandatory terminal syscall binding');}
 if(denials!==receipt.denials)throw Error('Denial count mismatch');
 if(exitCode!==5&&(!started||live.size||bound.size!==finished.size))throw Error('Incomplete task coverage');
 if(exitCode===0&&(denials||receipt.workloadExitCode||!receipt.events))throw Error('False native success');
 if(exitCode===6&&!denials)throw Error('Missing denial');
 if(exitCode===10&&!receipt.workloadExitCode)throw Error('Missing workload failure');
 return {records:records.length,identities:identities.length,denials,coverageClosed:started&&live.size===0&&bound.size===finished.size};
}
