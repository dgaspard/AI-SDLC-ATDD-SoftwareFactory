// Explicit Linux-arm64 qualification fixture. Never application code.
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <sched.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <sys/wait.h>
#include <unistd.h>
static int escape(void *unused){(void)unused;_exit(90);}
int main(int argc,char **argv){
 if(argc!=3)return 80;
 int container=!strcmp(argv[2],"container");
 if(!strcmp(argv[1],"inherit")){
  int fd=open("/tmp/descriptor",O_CREAT|O_RDWR,0600);if(fd<0||dup2(fd,99)!=99)return 81;
  if(container)execl("/opt/factory/syscall-guard","syscall-guard","--container-owned","/opt/guard-check","check","container",NULL);
  else execl("/opt/factory/syscall-guard","syscall-guard","/opt/guard-check","check","default",NULL);
  return 82;
 }
 if(strcmp(argv[1],"check"))return 83;
 errno=0;if(fcntl(99,F_GETFD)!=-1||errno!=EBADF)return 84;
 long calls[]={__NR_ptrace,__NR_process_vm_readv,__NR_process_vm_writev,__NR_pidfd_getfd,__NR_io_uring_setup,__NR_io_uring_enter,__NR_io_uring_register,__NR_io_setup,__NR_io_destroy,__NR_io_submit,__NR_io_cancel,__NR_io_getevents,__NR_io_pgetevents,__NR_userfaultfd,__NR_unshare,__NR_setns};
 for(size_t i=0;i<sizeof(calls)/sizeof(calls[0]);i++){errno=0;if(syscall(calls[i],0,0,0,0,0,0)!=-1||errno!=EPERM)return 85;}
 errno=0;if(syscall(__NR_clone3,0,0)!=-1||errno!=ENOSYS)return 86;
 char *stack=malloc(1048576);if(!stack)return 87;
 errno=0;if(clone(escape,stack+1048576,CLONE_UNTRACED|SIGCHLD,NULL)!=-1||errno!=EPERM)return 88;free(stack);
 for(int kind=0;kind<2;kind++){
  pid_t child=fork();if(child<0)return 89;
  if(!child){errno=0;long r=kind?setsid():setpgid(0,0);_exit(container?(r<0?91:0):(r==-1&&errno==EPERM?0:92));}
  int status;if(waitpid(child,&status,0)!=child||!WIFEXITED(status)||WEXITSTATUS(status))return 93;
 }
 puts(container?"CONTAINER_GUARD_CHECK_PASS":"DEFAULT_GUARD_CHECK_PASS");return 0;
}
