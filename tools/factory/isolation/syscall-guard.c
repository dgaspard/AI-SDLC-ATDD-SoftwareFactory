// Linux arm64 tracee-side defense in depth. This is not a filesystem policy engine.
#define _GNU_SOURCE
#include <errno.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <sched.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <unistd.h>
#define ACTION(n, a) BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K, (n), 0, 1), BPF_STMT(BPF_RET|BPF_K, (a))
#define DENY(n, e) BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K, (n), 0, 1), BPF_STMT(BPF_RET|BPF_K, SECCOMP_RET_ERRNO|(e))
int main(int argc, char **argv) {
 int container_owned=argc>1&&!strcmp(argv[1],"--container-owned");
 int executable=container_owned?2:1;
 if(argc<=executable){fputs("Expected an executable\n",stderr);return 125;}
 // Inherited writable descriptors could bypass subsequent path restrictions.
 if(syscall(__NR_close_range,3,~0U,0)){perror("Cannot close inherited descriptors");return 125;}
 struct sock_filter code[]={
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,arch)),
  BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,AUDIT_ARCH_AARCH64,1,0),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS),
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,nr)),
  BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,__NR_clone,0,4),
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,args[0])),
  BPF_JUMP(BPF_JMP|BPF_JSET|BPF_K,CLONE_UNTRACED,0,1),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW),
  // clone3 points at a mutable argument structure: force the normal clone fallback.
  DENY(__NR_clone3,ENOSYS),
  DENY(__NR_ptrace,EPERM), DENY(__NR_process_vm_readv,EPERM), DENY(__NR_process_vm_writev,EPERM),
  DENY(__NR_pidfd_getfd,EPERM),
  // Async I/O can perform filesystem operations outside the observed syscall stream.
  DENY(__NR_io_uring_setup,EPERM), DENY(__NR_io_uring_enter,EPERM), DENY(__NR_io_uring_register,EPERM),
  DENY(__NR_io_setup,EPERM), DENY(__NR_io_destroy,EPERM), DENY(__NR_io_submit,EPERM),
  DENY(__NR_io_cancel,EPERM), DENY(__NR_io_getevents,EPERM), DENY(__NR_io_pgetevents,EPERM),
  DENY(__NR_userfaultfd,EPERM), DENY(__NR_unshare,EPERM), DENY(__NR_setns,EPERM),
  // Explicit container-owned mode requires whole-container cleanup before evidence.
  // The default retains host process-group containment.
  ACTION(__NR_setsid,container_owned?SECCOMP_RET_ALLOW:SECCOMP_RET_ERRNO|EPERM),
  ACTION(__NR_setpgid,container_owned?SECCOMP_RET_ALLOW:SECCOMP_RET_ERRNO|EPERM),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW)
 };
 struct sock_fprog program={.len=sizeof(code)/sizeof(code[0]),.filter=code};
 if(prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0)||prctl(PR_SET_SECCOMP,SECCOMP_MODE_FILTER,&program)){
  perror("Cannot install mandatory syscall filter");return 125;
 }
 execvp(argv[executable],argv+executable);perror("Cannot execute guarded workload");return 125;
}
