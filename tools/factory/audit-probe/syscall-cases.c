// Fixed neutral probes; never accepts a target path or runs outside the test image.
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/sched.h>
#include <sched.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <sys/wait.h>
#include <unistd.h>
static int escape(void *unused){
 (void)unused;
 int fd=open("/tmp/untraced-child-ran",O_WRONLY|O_CREAT|O_EXCL,0600);if(fd>=0)close(fd);
 fd=open("/inputs/untraced-attempt.txt",O_WRONLY|O_CREAT,0600);if(fd>=0)close(fd);
 return 0;
}
int main(int argc,char **argv){
 if(argc==2 && !strcmp(argv[1],"--check-inherited")) {
  errno=0;
  if(fcntl(99,F_GETFD)!=-1 || errno!=EBADF) return 110;
  puts("INHERITED_DESCRIPTOR_CLOSED"); return 0;
 }
 if(argc==2 && !strcmp(argv[1],"--inherit")) {
  int fd=open("/tmp/inherited-descriptor-fixture",O_RDWR|O_CREAT|O_EXCL,0600);
  if(fd<0 || dup2(fd,99)!=99) return 111;
  if(fd!=99)close(fd);
  execl("/opt/factory/syscall-guard","syscall-guard","/opt/factory/syscall-cases","--check-inherited",NULL);
  return 112;
 }
 if(argc!=1)return 113;
 void *stack=malloc(1024*1024);if(!stack)return 100;
 int pid=clone(escape,(char*)stack+1024*1024,CLONE_UNTRACED|SIGCHLD,NULL);
 if(pid<0){if(errno!=EPERM)return 101;}else if(waitpid(pid,NULL,0)<0)return 102;
 free(stack);
 // Normal fork must still work, with descendant tracing intact.
 pid=fork();if(pid<0)return 103;
 if(pid==0){int fd=open("/inputs/ordinary-child-attempt.txt",O_WRONLY|O_CREAT,0600);if(fd>=0)close(fd);_exit(0);}
 if(waitpid(pid,NULL,0)<0)return 104;
 // Guarded calls must fail before dereferencing invalid/null probe arguments.
 struct {long nr; int expected;} calls[]={
  {__NR_clone3,ENOSYS},{__NR_ptrace,EPERM},{__NR_process_vm_readv,EPERM},
  {__NR_process_vm_writev,EPERM},{__NR_pidfd_getfd,EPERM},{__NR_io_uring_setup,EPERM},
  {__NR_io_uring_enter,EPERM},{__NR_io_uring_register,EPERM},{__NR_userfaultfd,EPERM},
  {__NR_io_setup,EPERM},{__NR_io_destroy,EPERM},{__NR_io_submit,EPERM},
  {__NR_io_cancel,EPERM},{__NR_io_getevents,EPERM},{__NR_io_pgetevents,EPERM},
  {__NR_unshare,EPERM},{__NR_setns,EPERM},{__NR_setsid,EPERM},{__NR_setpgid,EPERM}
 };
 for(size_t i=0;i<sizeof(calls)/sizeof(calls[0]);i++){
  errno=0;long r=syscall(calls[i].nr,0,0,0,0,0,0);
  // The unfiltered control intentionally does not require these calls to fail.
  printf("%ld:%ld:%d\n",calls[i].nr,r,errno);
 }
 return 0;
}
