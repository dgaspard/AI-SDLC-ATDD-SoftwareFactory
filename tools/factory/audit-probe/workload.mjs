// Deliberately hides all errors. Only the independent observer can report attempts.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const silent=fn=>{try{fn();}catch{}};
for(const file of ['/inputs/protected.txt','/inputs/symlink.txt','/inputs/hardlink.txt'])silent(()=>fs.writeFileSync(file,'forbidden'));
silent(()=>fs.writeFileSync('/inputs/new.txt','forbidden'));
silent(()=>fs.unlinkSync('/inputs/protected.txt'));
silent(()=>fs.writeFileSync('/audit/syscalls.log','forged clean log'));
silent(()=>fs.readFileSync('/audit/syscalls.log'));
silent(()=>process.kill(process.ppid,'SIGTERM'));
spawnSync(process.execPath,['-e',"try{require('fs').writeFileSync('/inputs/descendant.txt','forbidden')}catch{}"],{stdio:'ignore'});
const inherited=spawnSync('/opt/factory/syscall-cases',['--inherit'],{encoding:'utf8'});
if(inherited.status!==0||inherited.stdout.trim()!=='INHERITED_DESCRIPTOR_CLOSED')process.exit(91);
fs.writeFileSync('/tmp/inherited-result',inherited.stdout);
const native=spawnSync('/opt/factory/syscall-cases',[],{encoding:'utf8'});
if(native.status!==0)process.exit(90);
fs.writeFileSync('/tmp/native-results',native.stdout);
fs.writeFileSync('/tmp/allowed.txt','private scratch');
console.log('RUNNER_REPORT_FINISHED');
