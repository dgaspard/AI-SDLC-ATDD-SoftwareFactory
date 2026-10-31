// Analyze retained strace text, never runner stdout. This is not an isolation attestation.
import crypto from 'node:crypto';
const LIMIT=32*1024*1024;
export function analyzeSyscallTrace(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>LIMIT)throw new Error('Missing or oversized audit trace');
 const trace=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 if(!trace.endsWith('\n')||trace.includes('\0'))throw new Error('Truncated or invalid audit trace');
 const pending=new Map(),denials=[],mutationFailures=[],unsupportedFailures=[];let calls=0;
 function complete(pid,body,line){
  const match=/^([a-zA-Z_][a-zA-Z_0-9]*)\(/.exec(body);
  if(!match)throw new Error(`Unrecognized syscall record at line ${line}`);
  let depth=1,quoted=false,escaped=false,annotation=false,end=-1;
  for(let i=match[0].length;i<body.length;i++){
   const c=body[i];
   if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
   if(annotation){if(c==='>')annotation=false;continue;}
   if(c==='"'){quoted=true;continue;}
   if(c==='<'){annotation=true;continue;}
   if(c==='(')depth++;
   if(c===')'&&--depth===0){end=i;break;}
  }
  const resultMatch=end<0?null:/^\s+= (.+)$/.exec(body.slice(end+1));
  if(!resultMatch)throw new Error(`Unrecognized syscall result delimiter at line ${line}`);
  const syscall=match[1],result=resultMatch[1];
  if(!/^(?:-?\d+|0x[0-9a-f]+|\?)(?:[<\s]|$)/.test(result))throw new Error(`Invalid syscall result at line ${line}`);
  calls++;
  const failure=/^-1 (E[A-Z0-9]+)(?:\s|$)/.exec(result);
  // Missing parents can mask an out-of-scope write as ENOENT rather than EACCES.
  // Do not allow quoted filenames to impersonate open flags.
  const argumentsOnly=body.slice(match[0].length,end).replace(/"(?:\\.|[^"\\])*"/g,'""');
  const mutating=/^(?:(?:l|f)?(?:setxattr|removexattr)(?:at)?|creat|unlink(?:at)?|rename(?:at2?)?|link(?:at)?|symlink(?:at)?|mkdir(?:at)?|rmdir|mknod(?:at)?|(?:f)?chmod(?:at2?)?|(?:f|l)?chown(?:at)?|(?:f)?truncate|utime(?:s)?|utimensat|futimesat|write(?:v)?|pwrite(?:64|v2?)?|fallocate|copy_file_range|sendfile|splice|tee|vmsplice)$/.test(syscall)
   || (/^open(?:at2?)?$/.test(syscall)&&/\b(?:O_WRONLY|O_RDWR|O_CREAT|O_TRUNC|O_TMPFILE)\b/.test(argumentsOnly));
  const readOrProcess=(syscall==='ioctl'&&/^\s*\d+,\s*(?:TCGETS|TIOCGWINSZ|FIONREAD)(?:,|$)/.test(argumentsOnly))
   || (syscall==='fcntl'&&/^\s*\d+,\s*(?:F_GETFD|F_GETFL|F_SETFD)(?:,|$)/.test(argumentsOnly))
   || /^(?:access|faccessat2?|stat|lstat|fstat|newfstatat|statx|read|readv|pread64|preadv2?|readlink|readlinkat|getdents|getdents64|statfs|fstatfs|getxattr|lgetxattr|fgetxattr|listxattr|llistxattr|flistxattr|futex|futex_waitv|clone3?|fork|vfork|wait4|waitid|execve|execveat|rt_sigaction|rt_sigprocmask|rt_sigreturn|rt_sigtimedwait|sched_getaffinity|sched_yield|getrandom|rseq|madvise|munmap|mprotect|brk|socket|connect|recvfrom|recvmsg|sendto|sendmsg|getsockopt|setsockopt|shutdown|poll|ppoll|epoll_ctl|epoll_wait|epoll_pwait2?|close|close_range|pipe2?|dup2?|dup3|prctl|set_robust_list|set_tid_address|kill|tgkill|tkill|setpgid|setsid)$/.test(syscall)
   || (/^open(?:at2?)?$/.test(syscall)&&/\bO_RDONLY\b/.test(argumentsOnly)&&!mutating);
  if(failure&&!mutating&&!readOrProcess)unsupportedFailures.push({pid,syscall,errno:failure[1],line,record:body});
  if(failure&&mutating)mutationFailures.push({pid,syscall,errno:failure[1],line,record:body});
  const denied=failure&&['EACCES','EPERM','EROFS'].includes(failure[1])?failure:null;
  // Deliberately conservative: even denied reads/process operations are retained.
  // Arguments are raw observer text, not canonical paths or launcher violation objects.
  if(denied)denials.push({pid,syscall,errno:denied[1],line,record:body});
 }
 const lines=trace.slice(0,-1).split('\n');
 for(let i=0;i<lines.length;i++){
  const match=/^(\d+)\s+(.+)$/.exec(lines[i]);
  if(!match)throw new Error(`Unrecognized audit framing at line ${i+1}`);
  const pid=Number(match[1]),body=match[2];
  if(!Number.isSafeInteger(pid)||pid<=0)throw new Error('Invalid audit PID');
  if(/^--- SIG[A-Z0-9]+ .* ---$/.test(body))continue;
  if(/^\+\+\+ (?:exited with \d+|killed by SIG[A-Z0-9]+(?: \(core dumped\))?) \+\+\+$/.test(body)){
   if(pending.has(pid))throw new Error('Process ended with unresolved syscall');continue;
  }
  const resume=/^<\.\.\. ([a-zA-Z_][a-zA-Z_0-9]*) resumed>(.*)$/.exec(body);
  if(resume){
   const previous=pending.get(pid);
   if(!previous||previous.syscall!==resume[1])throw new Error('Unmatched resumed syscall');
   pending.delete(pid);complete(pid,previous.body+resume[2],previous.line);continue;
  }
  if(pending.has(pid))throw new Error('Overlapping unfinished syscalls');
  const unfinished=/^([a-zA-Z_][a-zA-Z_0-9]*)\(.*<unfinished \.\.\.>$/.exec(body);
  if(unfinished){pending.set(pid,{syscall:unfinished[1],body:body.slice(0,-'<unfinished ...>'.length),line:i+1});continue;}
  complete(pid,body,i+1);
 }
 if(pending.size||!calls)throw new Error('Incomplete audit trace');
 return {schemaVersion:1,scope:'retained syscall trace analysis only',realRunnerQualified:false,
  outcome:denials.length?'DENIAL_OBSERVED':(mutationFailures.length||unsupportedFailures.length)?'UNRESOLVED_MUTATION_FAILURE':'NO_DENIAL_OBSERVED',calls,denials,mutationFailures,unsupportedFailures,
  traceSha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
