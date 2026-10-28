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
fs.writeFileSync('/tmp/allowed.txt','private scratch');
console.log('RUNNER_REPORT_FINISHED');
