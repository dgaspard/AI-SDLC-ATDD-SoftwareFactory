import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSyscallTrace} from './syscall-audit.mjs';
const analyze=s=>analyzeSyscallTrace(Buffer.from(s));
test('audit detects arbitrary denied operations without a path allowlist',()=>{
 const r=analyze('12 openat(AT_FDCWD, "/unseen/alias", O_WRONLY) = -1 EROFS (Read-only file system)\n13 unlinkat(7, "relative", 0) = -1 EACCES (Permission denied)\n14 ioctl(5, SOME_OPERATION, 0) = -1 EPERM (Operation not permitted)\n');
 assert.equal(r.outcome,'DENIAL_OBSERVED');assert.deepEqual(r.denials.map(x=>x.syscall),['openat','unlinkat','ioctl']);assert.equal(r.realRunnerQualified,false);
});
test('audit reconstructs interleaved unfinished syscalls by PID',()=>{
 const r=analyze('12 openat(AT_FDCWD, "x", O_WRONLY <unfinished ...>\n13 unlink("y") = -1 EPERM (Operation not permitted)\n12 <... openat resumed>) = -1 EACCES (Permission denied)\n');
 assert.equal(r.denials.length,2);assert.equal(r.denials[1].pid,12);assert.equal(r.denials[1].line,1);
});
test('argument text cannot impersonate a denied return value',()=>{
 const r=analyze('12 openat(AT_FDCWD, "fake ) = -1 EPERM", O_RDONLY) = 3\n');
 assert.equal(r.outcome,'NO_DENIAL_OBSERVED');assert.equal(r.realRunnerQualified,false);
});
for(const [name,trace] of Object.entries({
 empty:'',truncated:'12 unlink("x") = -1 EPERM',unresolved:'12 openat("x" <unfinished ...>\n',
 unmatched:'12 <... openat resumed>) = 3\n',mismatch:'12 openat("x" <unfinished ...>\n12 <... unlink resumed>) = 0\n',
 overlap:'12 openat("x" <unfinished ...>\n12 unlink("y") = 0\n',
 loss:'strace: Process detached\n',garbage:'12 unknown text\n',
 terminal:'12 openat("x" <unfinished ...>\n12 +++ exited with 0 +++\n',
 badReturn:'12 unlink("x") = nonsense\n',
}))test(`audit fails closed for ${name}`,()=>assert.throws(()=>analyze(trace)));
test('audit rejects invalid UTF-8 instead of replacing observer bytes',()=>assert.throws(()=>analyzeSyscallTrace(Buffer.from([0xff,10]))));
test('audit tolerates signal records while retaining denied calls',()=>{
 const r=analyze('12 --- SIGCHLD {si_signo=SIGCHLD} ---\n12 unlink("x") = -1 EPERM (Operation not permitted)\n12 +++ exited with 0 +++\n');assert.equal(r.denials.length,1);
});

test('audit accepts descriptor annotations without confusing them for return errors',()=>{
 const r=analyze('12 openat(AT_FDCWD, "x", O_RDONLY) = 3</tmp/x>\n');assert.equal(r.outcome,'NO_DENIAL_OBSERVED');
});

test('returned descriptor annotation cannot spoof a denied result',()=>{
 const r=analyze('12 openat(AT_FDCWD, "x", O_RDONLY) = 3</tmp/x) = -1 EPERM (spoof)>\n');assert.equal(r.outcome,'NO_DENIAL_OBSERVED');
});

test('failed mutations with missing parents are retained even without permission errno',()=>{
 const r=analyze('12 openat(AT_FDCWD, "/unmounted/original/new", O_WRONLY|O_CREAT, 0600) = -1 ENOENT (No such file or directory)\n13 unlink("/missing/protected") = -1 ENOENT (No such file or directory)\n');assert.equal(r.mutationFailures.length,2);assert.equal(r.outcome,'UNRESOLVED_MUTATION_FAILURE');
});
test('read-only missing paths and quoted fake flags are not mutation failures',()=>{
 const r=analyze('12 openat(AT_FDCWD, "O_WRONLY", O_RDONLY) = -1 ENOENT (No such file or directory)\n');assert.equal(r.denials.length,0);
});

test('xattr and unknown failed operations remain blocking',()=>{
 for(const call of ['setxattr','lsetxattr','fsetxattr','removexattr','fremovexattr','lremovexattr','setxattrat','future_mutation']){
 const r=analyze(`12 ${call}("/workspace/spec/missing", "user.x", "x", 1, 0) = -1 ENOENT (No such file or directory)\n`);
 assert.equal(r.outcome,'UNRESOLVED_MUTATION_FAILURE');assert.equal(r.mutationFailures.length+r.unsupportedFailures.length,1);
 }
});

test('descriptor query exceptions do not hide unknown ioctl mutations',()=>{
 const query=analyze('12 ioctl(1, TCGETS, 0x123) = -1 ENOTTY (Inappropriate ioctl for device)\n');assert.equal(query.outcome,'NO_DENIAL_OBSERVED');
 const mutation=analyze('12 ioctl(3, FICLONE, 4) = -1 ENOENT (No such file or directory)\n');assert.equal(mutation.outcome,'UNRESOLVED_MUTATION_FAILURE');
});

test('close-on-exec descriptor metadata failure is not a filesystem mutation',()=>{
 const r=analyze('12 fcntl(3, F_SETFD, FD_CLOEXEC) = -1 EBADF (Bad file descriptor)\n');assert.equal(r.outcome,'NO_DENIAL_OBSERVED');
});
