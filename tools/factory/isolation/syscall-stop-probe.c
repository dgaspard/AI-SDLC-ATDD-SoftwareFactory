// Fixed credential-free Linux feasibility probe, NOT an arbitrary runner/observer.
// Proves stop acknowledgement and private-target access using the existing caps.
#define _GNU_SOURCE
#include <errno.h>
#include <dirent.h>
#include <fcntl.h>
#include <grp.h>
#include <linux/stat.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/fsuid.h>
#include <sys/ptrace.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/uio.h>
#include <sys/wait.h>
#include <unistd.h>
static void deadline(int sig){(void)sig;const char msg[]="TOOLING_UNAVAILABLE: probe deadline\n";write(2,msg,sizeof msg-1);_exit(5);}
static int release_fd;
static volatile unsigned long marker=123;
static void *worker(void *unused){(void)unused;char c;if(read(release_fd,&c,1)==1)marker=456;return NULL;}
static int tasks(pid_t pid,pid_t *ids){char name[80];snprintf(name,sizeof name,"/proc/%d/task",pid);DIR*d=opendir(name);if(!d)return -1;int n=0;struct dirent*e;while((e=readdir(d))){char*end;long id=strtol(e->d_name,&end,10);if(!*end&&id>0){if(n==8){closedir(d);return -1;}ids[n++]=(pid_t)id;}}closedir(d);return n;}
static int stopped(pid_t pid){char name[80],line[256];snprintf(name,sizeof name,"/proc/%d/status",pid);FILE*f=fopen(name,"r");if(!f)return 0;int trace=0,stop=0;while(fgets(line,sizeof line,f)){int n;if(sscanf(line,"TracerPid: %d",&n)==1)trace=n==getpid();char state;if(sscanf(line,"State: %c",&state)==1)stop=state=='t';}fclose(f);return trace&&stop;}
int main(void){
 if(getuid()!=0||access("/.dockerenv",F_OK)){fputs("Container observer required\n",stderr);return 5;}
 signal(SIGALRM,deadline);alarm(10);int ready[2],go[2];if(pipe2(ready,O_CLOEXEC)||pipe2(go,O_CLOEXEC))return 5;
 pid_t child=fork();if(child<0)return 5;
 if(!child){
  close(ready[0]);close(go[1]);release_fd=go[0];
  if(setgroups(0,NULL)||setgid(65534)||setuid(65534))_exit(5);
  // This fixed child is trusted setup; no arbitrary command is accepted.
  char dir[]="/tmp/sct-private-XXXXXX";if(!mkdtemp(dir))_exit(5);
  char target[128];snprintf(target,sizeof target,"%s/value",dir);
  int fd=open(target,O_CREAT|O_EXCL|O_RDWR,0600);if(fd<0||write(fd,"neutral",7)!=7)_exit(5);
  pthread_t thread;if(pthread_create(&thread,NULL,worker,NULL))_exit(5);
  dprintf(ready[1],"%s %d\n",target,fd);close(ready[1]);
  char c;if(read(go[0],&c,1)<0)_exit(5);pthread_join(thread,NULL);_exit(0);
 }
 close(ready[1]);close(go[0]);int failure_errno=0;int stage=0;int result=5;pid_t ids[8];int n=0;char line[256]={0},target[128];int remote_fd;
 FILE *in=fdopen(ready[0],"r");if(!in)goto cleanup;
 if(!fgets(line,sizeof line,in)){fclose(in);goto cleanup;}fclose(in);
 if(sscanf(line,"%127s %d",target,&remote_fd)!=2)goto cleanup;
 stage=1;n=tasks(child,ids);if(n!=2)goto cleanup;
 stage=2;for(int i=0;i<n;i++)if(ptrace(PTRACE_SEIZE,ids[i],0,(void*)(PTRACE_O_EXITKILL|PTRACE_O_TRACESYSGOOD)))goto cleanup;
 stage=3;for(int i=0;i<n;i++)if(ptrace(PTRACE_INTERRUPT,ids[i],0,0))goto cleanup;
 stage=4;for(int i=0;i<n;i++){int status;if(waitpid(ids[i],&status,__WALL)!=ids[i]||!WIFSTOPPED(status))goto cleanup;}
 stage=5;pid_t again[8];if(tasks(child,again)!=n)goto cleanup;
 for(int i=0;i<n;i++)if(!stopped(ids[i]))goto cleanup;
 stage=6;unsigned long observed=0;struct iovec local={&observed,sizeof observed},remote={(void*)&marker,sizeof marker};
 if(process_vm_readv(child,&local,1,&remote,1,0)!=sizeof observed||observed!=123)goto cleanup;
 // A queued byte must not let the stopped sibling mutate its shared memory.
 stage=7;if(write(go[1],"go",2)!=2)goto cleanup;
 if(process_vm_readv(child,&local,1,&remote,1,0)!=sizeof observed||observed!=123)goto cleanup;
 stage=8;char root[80],fdpath[80],full[256];snprintf(root,sizeof root,"/proc/%d/root",child);snprintf(fdpath,sizeof fdpath,"/proc/%d/fd/%d",child,remote_fd);snprintf(full,sizeof full,"%s%s",root,target);
 struct statx pathstat,fdstat,rootstat,selfroot;
 if(syscall(SYS_statx,AT_FDCWD,root,0,STATX_INO|STATX_MNT_ID,&rootstat)||syscall(SYS_statx,AT_FDCWD,"/",0,STATX_INO|STATX_MNT_ID,&selfroot)||rootstat.stx_ino!=selfroot.stx_ino||rootstat.stx_mnt_id!=selfroot.stx_mnt_id)goto cleanup;
 // Use the already-approved SETUID capability, not DAC_OVERRIDE or extra privilege.
 int heldRoot=open(root,O_PATH|O_CLOEXEC),heldTarget=open(fdpath,O_PATH|O_CLOEXEC);
 if(heldRoot<0||heldTarget<0)goto cleanup;
 stage=9;setfsuid(65534);int changed=(uid_t)setfsuid((uid_t)-1)==65534;
 int a=syscall(SYS_statx,heldRoot,target+1,0,STATX_BASIC_STATS|STATX_MNT_ID,&pathstat);
 int ae=errno;
 int b=syscall(SYS_statx,heldTarget,"",AT_EMPTY_PATH,STATX_BASIC_STATS|STATX_MNT_ID,&fdstat);
 int be=errno;
 setfsuid(0);int restored=(uid_t)setfsuid((uid_t)-1)==0;
 close(heldRoot);close(heldTarget);
 if(a||b)fprintf(stderr,"private resolver path=%d errno=%d descriptor=%d errno=%d fsuid_changed=%d restored=%d\n",a,ae,b,be,changed,restored);
 if(!changed||!restored||a||b||!(pathstat.stx_mask&STATX_MNT_ID)||!(fdstat.stx_mask&STATX_MNT_ID)||pathstat.stx_ino!=fdstat.stx_ino||pathstat.stx_mnt_id!=fdstat.stx_mnt_id||pathstat.stx_uid!=65534)goto cleanup;
 for(int i=0;i<n;i++)if(!stopped(ids[i]))goto cleanup;
 result=0;
cleanup:
 failure_errno=errno;
 // CAP_KILL is deliberately absent; signal using the approved tracee identity.
 if(seteuid(65534))result=5;
 if(kill(child,SIGKILL)&&errno!=ESRCH)result=5;
 if(seteuid(0))result=5;
 close(go[1]);
 for(;;){int status;pid_t p=waitpid(-1,&status,__WALL);if(p<0){if(errno==EINTR)continue;if(errno!=ECHILD){result=5;failure_errno=errno;}break;}if(WIFSTOPPED(status))ptrace(PTRACE_CONT,p,0,(void*)(long)SIGKILL);}
 if(!result){ printf("{\"scope\":\"fixed native prerequisites only\",\"realRunnerQualified\":false,\"threadsStopped\":2,\"queuedWriterHeld\":true,\"traceeMemoryReadable\":true,\"privatePathMatchesDescriptor\":true,\"mountIdentityBound\":true,\"fsuidRestored\":true}\n");}
 if(result)fprintf(stderr,"TOOLING_UNAVAILABLE: native prerequisites stage=%d errno=%d\n",stage,failure_errno);
 return result;
}
