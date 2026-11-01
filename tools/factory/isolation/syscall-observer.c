// Linux arm64 credential-free qualification observer. Not a real-runner activation.
#define _GNU_SOURCE
#include <sys/ptrace.h>
#include <linux/ptrace.h>
#include <linux/audit.h>
#include <linux/openat2.h>
#include <linux/stat.h>
#include <linux/netlink.h>
#include <asm/ptrace.h>
#include <elf.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <grp.h>
#include <limits.h>
#include <sched.h>
#include <signal.h>
#include <stdint.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/fsuid.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <netinet/in.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/uio.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
// Linux UAPI: exact-thread pidfds require Linux 6.9+. Unsupported kernels fail closed.
#ifndef PIDFD_THREAD
#define PIDFD_THREAD O_EXCL
#endif
_Static_assert(PIDFD_THREAD==128,"Expected Linux arm64 thread pidfd flag");
#define MAX_TASKS 128
#define MAX_EVENTS 500000
struct task {pid_t tid;int stopped,status,entry,born,interrupt_sent;unsigned long nr,entry_seq;pid_t vfork_child;unsigned long long started;};
static struct task tasks[MAX_TASKS];static int terminal_probe;static int cursor,used,live,denied,failed,maincode=5,cleanup_ok=1;static pid_t leader;
static FILE *trace,*identity;static int outfd,errfd;static struct statx output_stat[2];static unsigned long events,records;static int denial_errno=EPERM;static uint64_t scratch_mount;static int rootfd;static unsigned long identity_records,binding_entry;
#define MAX_GRANTS 64
static struct {struct statx identity;char path[PATH_MAX];} grants[MAX_GRANTS];static int grant_count;
static void tracef(const char *format,...){
 records++;
#ifdef SCT_FAULT_SKIP_RECORD
 if(records==3)return;
#endif
 fprintf(trace,"{\"seq\":%lu,",records);va_list ap;va_start(ap,format);vfprintf(trace,format+1,ap);va_end(ap);
}
static void hex_string(FILE*f,const char*s){fputc('"',f);for(const unsigned char*p=(const unsigned char*)s;*p;p++)fprintf(f,"%02x",*p);fputc('"',f);}
static void deadline(int sig){(void)sig;const char m[]="Observer deadline or interruption\n";write(2,m,sizeof m-1);_exit(5);}
static void fail(const char *why){if(!failed)fprintf(stderr,"TOOLING_UNAVAILABLE: %s errno=%d\n",why,errno);failed=1;}
static unsigned long forbidden_clone=CLONE_UNTRACED|CLONE_NEWNS|CLONE_NEWUSER|CLONE_NEWPID|CLONE_NEWNET|CLONE_NEWIPC|CLONE_NEWUTS|CLONE_NEWCGROUP;
static void release_vfork(pid_t child){for(int i=0;i<used;i++)if(tasks[i].tid&&tasks[i].vfork_child==child)tasks[i].vfork_child=0;}
static long millis(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec*1000+t.tv_nsec/1000000;}
static struct task *find(pid_t pid){for(int i=0;i<used;i++)if(tasks[i].tid==pid)return &tasks[i];return NULL;}
static struct task *add(pid_t pid){struct task*t=find(pid);if(t)return t;for(int i=0;i<used;i++)if(!tasks[i].tid){tasks[i]=(struct task){.tid=pid};live++;return &tasks[i];}if(used==MAX_TASKS){fail("task limit");return NULL;}t=&tasks[used++];*t=(struct task){.tid=pid};live++;return t;}
static struct {pid_t tid;unsigned long long started;} dead_tasks[8192];static int dead_count;
static unsigned long long start_time(pid_t tid){char p[80],line[4096];snprintf(p,sizeof p,"/proc/%d/stat",tid);FILE*f=fopen(p,"r");if(!f)return 0;if(!fgets(line,sizeof line,f)){fclose(f);return 0;}fclose(f);char*r=strrchr(line,')');if(!r)return 0;r+=2;char*save;char*word=strtok_r(r," ",&save);for(int field=3;word;field++,word=strtok_r(NULL," ",&save))if(field==22)return strtoull(word,NULL,10);return 0;}
static int known_dead(pid_t tid){unsigned long long s=start_time(tid);if(!s)return 0;for(int i=0;i<dead_count;i++)if(dead_tasks[i].tid==tid&&dead_tasks[i].started==s)return 1;return 0;}
static int event(pid_t pid,int status){
 struct task*t=find(pid);if(!t){t=add(pid);if(!t)return -1;}
 if(WIFEXITED(status)||WIFSIGNALED(status)){if(!t->born)fail("exit without birth coverage");if(!t->started||dead_count==8192){fail("terminal task identity");return -1;}dead_tasks[dead_count].tid=pid;dead_tasks[dead_count++].started=t->started;release_vfork(pid);if(pid==leader)maincode=WIFEXITED(status)?WEXITSTATUS(status):128+WTERMSIG(status);tracef("{\"event\":\"exit\",\"tid\":%d,\"status\":%d}\n",pid,status);t->tid=0;live--;return 0;}
 if(!WIFSTOPPED(status)){fail("unknown wait state");return -1;}
 if(!t->started)t->started=start_time(pid);
 if(!t->started){fail("task start identity");return -1;}
 t->stopped=1;t->status=status;unsigned ev=(unsigned)status>>16;
 if(ev==PTRACE_EVENT_FORK||ev==PTRACE_EVENT_CLONE||ev==PTRACE_EVENT_VFORK){unsigned long child;if(ptrace(PTRACE_GETEVENTMSG,pid,0,&child)||!add((pid_t)child)){fail("birth event");return -1;}
#ifndef SCT_FAULT_SKIP_BIRTH
 find((pid_t)child)->born=1;
#endif
 if(ev==PTRACE_EVENT_VFORK)t->vfork_child=(pid_t)child;
 tracef("{\"event\":\"birth\",\"tid\":%d,\"child\":%lu}\n",pid,child);}
 if(ev==PTRACE_EVENT_EXEC){release_vfork(pid);unsigned long old;if(ptrace(PTRACE_GETEVENTMSG,pid,0,&old)){fail("exec identity");return -1;}if(old!=(unsigned long)pid){fail("nonleader exec requires additional binding");return -1;}tracef("{\"event\":\"exec\",\"tid\":%d,\"former\":%lu}\n",pid,old);}
 return 0;
}
static int resume(struct task*t,int signal){t->interrupt_sent=0;if(ptrace(PTRACE_SYSCALL,t->tid,0,(void*)(long)signal)){
 if(errno==ESRCH){char p[80],line[256],state=0;snprintf(p,sizeof p,"/proc/%d/status",t->tid);FILE*f=fopen(p,"r");if(!f&&errno==ENOENT){t->stopped=0;return 0;}if(f){while(fgets(line,sizeof line,f))if(sscanf(line,"State: %c",&state)==1)break;fclose(f);if(state=='Z'||state=='X'){t->stopped=0;return 0;}}}
 fail("resume");return -1;}t->stopped=0;return 0;}
static int collect(int block){int status;pid_t p=waitpid(-1,&status,__WALL|(block?0:WNOHANG));if(p>0)return event(p,status);if(!p)return 1;if(errno==EINTR)return 1;fail("wait coverage");return -1;}
static int quiesce(void){
 long end=millis()+2000;
 for(;;){
  int running=0;for(int i=0;i<used;i++)if(tasks[i].tid&&!tasks[i].stopped){running=1;if(!tasks[i].interrupt_sent){if(ptrace(PTRACE_INTERRUPT,tasks[i].tid,0,0)&&errno!=ESRCH){fail("interrupt writer");return -1;}tasks[i].interrupt_sent=1;}}
  if(!running)break;
  if(millis()>end){fail("writer did not stop");return -1;}
  int c=collect(0);if(c<0)return -1;if(c==1){struct timespec ts={0,1000000};nanosleep(&ts,NULL);}
 }
 // Independent namespace inventory catches a missing descendant/task record.
 DIR*d=opendir("/proc");if(!d){fail("process inventory");return -1;}struct dirent*e;
 while((e=readdir(d))){char*end;long pid=strtol(e->d_name,&end,10);if(*end||pid<=0)continue;char p[128],line[256];snprintf(p,sizeof p,"/proc/%ld/status",pid);FILE*f=fopen(p,"r");if(!f){closedir(d);fail("inventory race");return -1;}unsigned uid=0;char state=0;while(fgets(line,sizeof line,f)){char v;if(sscanf(line,"State: %c",&v)==1)state=v;if(sscanf(line,"Uid: %u",&uid)==1)break;}fclose(f);if(uid!=65534)continue;if((state=='Z'||state=='X')&&known_dead((pid_t)pid))continue;
  snprintf(p,sizeof p,"/proc/%ld/task",pid);DIR*td=opendir(p);if(!td){closedir(d);fail("thread inventory");return -1;}struct dirent*te;
  while((te=readdir(td))){long tid=strtol(te->d_name,&end,10);if(*end||tid<=0)continue;struct task*t=find((pid_t)tid);if(!t||!t->stopped||!t->born){closedir(td);closedir(d);fail("unaccounted writer");return -1;}}
  closedir(td);
 }
 closedir(d);return 0;
}
static int remote_string(pid_t pid,unsigned long address,char*out){
 for(size_t n=0;n<PATH_MAX;n++){struct iovec a={out+n,1},b={(void*)(address+n),1};if(process_vm_readv(pid,&a,1,&b,1,0)!=1)return -1;if(!out[n])return 0;}return -1;
}
static int fd_identity(int fd,struct statx*s){return syscall(SYS_statx,fd,"",AT_EMPTY_PATH,STATX_BASIC_STATS|STATX_MNT_ID,s)||!(s->stx_mask&STATX_MNT_ID)?-1:0;}
static int fd_path(int fd,char*out){char p[80];snprintf(p,sizeof p,"/proc/self/fd/%d",fd);ssize_t n=readlink(p,out,PATH_MAX-1);if(n<0)return -1;out[n]=0;return strstr(out," (deleted)")?-1:0;}
static int granted_fd(int fd){
 struct statx s;if(fd_identity(fd,&s)||!S_ISREG(s.stx_mode)||s.stx_nlink!=1)return 0;
 for(int k=0;k<grant_count;k++)if(s.stx_mnt_id==grants[k].identity.stx_mnt_id&&s.stx_ino==grants[k].identity.stx_ino)return 1;
 return 0;
}
static int bind_grant(const char *p){
 if(grant_count==MAX_GRANTS||strncmp(p,"/workspace/",11)||strlen(p)>=PATH_MAX)return -1;
 struct open_how how={.flags=O_PATH|O_CLOEXEC,.resolve=RESOLVE_IN_ROOT|RESOLVE_NO_SYMLINKS};
 int fd=syscall(SYS_openat2,rootfd,p+1,&how,sizeof how);if(fd<0)return -1;
 struct statx s;int invalid=fd_identity(fd,&s)||!S_ISREG(s.stx_mode)||s.stx_nlink!=1;
 for(int k=0;k<grant_count;k++)if(!strcmp(p,grants[k].path))invalid=1;
 if(!invalid){grants[grant_count].identity=s;strcpy(grants[grant_count++].path,p);}close(fd);return invalid?-1:0;
}
static int authorized_fd(int fd){
 struct statx s;if(fd_identity(fd,&s))return -1;
 if(S_ISFIFO(s.stx_mode)||S_ISSOCK(s.stx_mode))return 1;
 if(S_ISCHR(s.stx_mode))return s.stx_rdev_major==1&&s.stx_rdev_minor==3?1:0; // /dev/null only
 char p[PATH_MAX];if(fd_path(fd,p))return -1;
 if(!strcmp(p,"anon_inode:[eventfd]"))return 1;
 return s.stx_mnt_id==scratch_mount&&(!strcmp(p,"/tmp")||!strncmp(p,"/tmp/",5));
}
static int authorized_metadata(int fd){
 struct statx s;char p[PATH_MAX];if(fd_identity(fd,&s)||fd_path(fd,p))return -1;
 return s.stx_mnt_id==scratch_mount&&(!strcmp(p,"/tmp")||!strncmp(p,"/tmp/",5));
}
static int hold_proc(const char *p){
 int fd=open(p,O_PATH|O_CLOEXEC);if(fd>=0||errno!=EACCES)return fd;
 setfsuid(65534);if((uid_t)setfsuid((uid_t)-1)!=65534){fail("proc fsuid switch");return -1;}
 fd=open(p,O_PATH|O_CLOEXEC);int saved=errno;setfsuid(0);
 if((uid_t)setfsuid((uid_t)-1)!=0){fail("proc fsuid restore");if(fd>=0)close(fd);return -1;}errno=saved;return fd;
}
static void identity_prefix(pid_t tid){fprintf(identity,"{\"seq\":%lu,\"entry\":%lu,\"tid\":%d,",++identity_records,binding_entry,tid);}
static int descriptor(pid_t pid,int fd,int update){char p[80];snprintf(p,sizeof p,"/proc/%d/fd/%d",pid,fd);int held=hold_proc(p);if(held<0)return -1;int r=update?authorized_fd(held):authorized_metadata(held);int grant=granted_fd(held);if(grant)r=update?1:0;struct statx check;if(update&&!fd_identity(held,&check))for(int x=0;x<2;x++)if(check.stx_ino==output_stat[x].stx_ino&&check.stx_mnt_id==output_stat[x].stx_mnt_id)r=1;struct statx s;if(!fd_identity(held,&s)){identity_prefix(pid);fprintf(identity,"\"fd\":%d,\"mount\":%llu,\"inode\":%llu,\"disposition\":%d,\"grant\":%s}\n",fd,(unsigned long long)s.stx_mnt_id,(unsigned long long)s.stx_ino,r,grant?"true":"false");}close(held);return r;}
// Called only under the all-writers-stopped invariant. No device is opened.
static int route_socket(pid_t tid,int fd,const char*operation){
 int pidfd=syscall(SYS_pidfd_open,tid,PIDFD_THREAD);if(pidfd<0){fprintf(stderr,"route pidfd unavailable errno=%d\n",errno);return -1;}
 int held=syscall(SYS_pidfd_getfd,pidfd,fd,0);int saved=errno;close(pidfd);if(held<0){fprintf(stderr,"route descriptor unavailable errno=%d\n",saved);return -1;}
 struct statx sock;int domain=-1,protocol=-1,type=-1;socklen_t size=sizeof(int);
 int bad=fd_identity(held,&sock)||!S_ISSOCK(sock.stx_mode)||getsockopt(held,SOL_SOCKET,SO_DOMAIN,&domain,&size)||size!=sizeof(int);
 size=sizeof(int);bad=bad||getsockopt(held,SOL_SOCKET,SO_PROTOCOL,&protocol,&size)||size!=sizeof(int);
 size=sizeof(int);bad=bad||getsockopt(held,SOL_SOCKET,SO_TYPE,&type,&size)||size!=sizeof(int);
 struct sockaddr_nl address={0};size=sizeof address;bad=bad||getsockname(held,(struct sockaddr*)&address,&size)||size!=sizeof address;
 unsigned long long cookie=0,owner_cookie=0;size=sizeof cookie;
 bad=bad||getsockopt(held,SOL_SOCKET,SO_NETNS_COOKIE,&cookie,&size)||size!=sizeof cookie;
 int owner=socket(AF_NETLINK,SOCK_RAW|SOCK_CLOEXEC,NETLINK_ROUTE);if(owner<0){close(held);return -1;}
 size=sizeof owner_cookie;bad=bad||getsockopt(owner,SOL_SOCKET,SO_NETNS_COOKIE,&owner_cookie,&size)||size!=sizeof owner_cookie;close(owner);close(held);
 if(bad||domain!=AF_NETLINK||protocol!=NETLINK_ROUTE||type!=SOCK_RAW||address.nl_family!=AF_NETLINK||address.nl_groups||!cookie||cookie!=owner_cookie)return -1;
 identity_prefix(tid);fprintf(identity,"\"mount\":%llu,\"inode\":%llu,\"disposition\":1,\"kind\":\"route-socket\",\"operation\":\"%s\",\"pidfdTid\":%d,\"pidfdFlags\":%d,\"fd\":%d,\"domain\":%d,\"type\":%d,\"protocol\":%d,\"localPort\":%u,\"groups\":%u,\"netCookie\":%llu,\"ownerNetCookie\":%llu}\n",(unsigned long long)sock.stx_mnt_id,(unsigned long long)sock.stx_ino,operation,tid,PIDFD_THREAD,fd,domain,type,protocol,address.nl_pid,address.nl_groups,cookie,owner_cookie);return 1;
}
static int terminal_identity(pid_t tid,struct statx *target){
 char file[80],line[4096],state;int parent,group,session,tty;
 snprintf(file,sizeof file,"/proc/%d/stat",tid);FILE*f=fopen(file,"r");
 if(!f)return -1;
 if(!fgets(line,sizeof line,f)){fclose(f);return -1;}fclose(f);
 char*end=strrchr(line,')');struct task*t=find(tid);
 if(!end||sscanf(end+2,"%c %d %d %d %d",&state,&parent,&group,&session,&tty)!=5||session<=0||!t||!t->started||start_time(tid)!=t->started)return -1;
 int disposition=tty?0:4;
 identity_prefix(tid);
 fprintf(identity,"\"mount\":%llu,\"inode\":%llu,\"disposition\":%d,\"kind\":\"terminal-probe\",\"flags\":2050,\"deviceMajor\":5,\"deviceMinor\":0,\"startTime\":%llu,\"session\":%d,\"controllingTerminal\":%d}\n",(unsigned long long)target->stx_mnt_id,(unsigned long long)target->stx_ino,disposition,t->started,session,tty);
 return disposition;
}
static int terminal_query(pid_t tid,int fd){
 char file[80];snprintf(file,sizeof file,"/proc/%d/fd/%d",tid,fd);int held=hold_proc(file);struct statx s;
 if(held<0)return -1;
 if(fd_identity(held,&s)){close(held);return -1;}close(held);
 // Only ordinary files, pipes, sockets and Linux tty devices with known ioctl semantics.
 int safe=S_ISREG(s.stx_mode)||S_ISFIFO(s.stx_mode)||S_ISSOCK(s.stx_mode)||(S_ISCHR(s.stx_mode)&&((s.stx_rdev_major>=136&&s.stx_rdev_major<=143)||(s.stx_rdev_major==5&&s.stx_rdev_minor==0)));
 if(!safe)return -1;
 identity_prefix(tid);fprintf(identity,"\"mount\":%llu,\"inode\":%llu,\"disposition\":1,\"kind\":\"terminal-query\",\"fd\":%d,\"request\":21519,\"mode\":%u,\"deviceMajor\":%u,\"deviceMinor\":%u}\n",(unsigned long long)s.stx_mnt_id,(unsigned long long)s.stx_ino,fd,s.stx_mode,s.stx_rdev_major,s.stx_rdev_minor);return 1;
}
static int target_impl(pid_t pid,int dirfd,unsigned long address,int parent_only,int update,int nofollow){
 struct statx base_identity={0};char input[PATH_MAX],absolute[PATH_MAX];if(remote_string(pid,address,input)||!input[0])return -1;
 if(input[0]=='/'){if(strlen(input)>=sizeof absolute)return -1;strcpy(absolute,input);}
 else {char proc[80],base[PATH_MAX];snprintf(proc,sizeof proc,dirfd==AT_FDCWD?"/proc/%d/cwd":"/proc/%d/fd/%d",pid,dirfd);int held=hold_proc(proc);if(held<0)return -1;struct statx s;int valid=!fd_identity(held,&s)&&S_ISDIR(s.stx_mode)&&!fd_path(held,base);base_identity=s;close(held);if(!valid||snprintf(absolute,sizeof absolute,"%s/%s",base,input)>=(int)sizeof absolute)return -1;}
 if(parent_only){char*slash=strrchr(absolute,'/');if(!slash)return -1;if(slash==absolute)slash[1]=0;else *slash=0;}
 // The namespace/root is fixed by the container; reject changes instead of emulating them.
 char rp[80];snprintf(rp,sizeof rp,"/proc/%d/root",pid);int rr=hold_proc(rp);struct statx a,b;int same=rr>=0&&!fd_identity(rr,&a)&&!fd_identity(rootfd,&b)&&a.stx_ino==b.stx_ino&&a.stx_mnt_id==b.stx_mnt_id;if(rr>=0)close(rr);if(!same)return -1;
 int fd=-1,result=-1,missing=0;setfsuid(65534);if((uid_t)setfsuid((uid_t)-1)!=65534)goto restore;
 for(int depth=0;depth<PATH_MAX;depth++){
  struct open_how how={.flags=O_PATH|O_CLOEXEC|(nofollow&&!parent_only?O_NOFOLLOW:0),.resolve=RESOLVE_IN_ROOT|RESOLVE_NO_MAGICLINKS};fd=syscall(SYS_openat2,rootfd,absolute[1]?absolute+1:".",&how,sizeof how);
  if(fd<0&&errno==EACCES){
   setfsuid(0);if((uid_t)setfsuid((uid_t)-1)!=0){fail("protected target fsuid");goto restore;}
   fd=syscall(SYS_openat2,rootfd,absolute[1]?absolute+1:".",&how,sizeof how);int saved=errno;
   setfsuid(65534);if((uid_t)setfsuid((uid_t)-1)!=65534){fail("tracee target fsuid");goto restore;}errno=saved;
  }

  if(fd>=0)break;
  if(errno!=ENOENT)goto restore;
  missing++;
  // Do not erase unresolved dangling aliases or parent traversal when finding an ancestor.
  struct stat st;if(!fstatat(rootfd,absolute+1,&st,AT_SYMLINK_NOFOLLOW)&&S_ISLNK(st.st_mode))goto restore;
  if(strstr(absolute,"/../")||strstr(absolute,"/./"))goto restore;
  char*slash=strrchr(absolute,'/');if(!slash)goto restore;if(slash==absolute)slash[1]=0;else *slash=0;
 }
restore:
 setfsuid(0);if((uid_t)setfsuid((uid_t)-1)!=0){fail("restore observer fsuid");if(fd>=0)close(fd);return -1;}
 if(fd>=0){struct statx terminal;
  if(terminal_probe&&!missing&&!parent_only&&!fd_identity(fd,&terminal)&&S_ISCHR(terminal.stx_mode)&&terminal.stx_rdev_major==5&&terminal.stx_rdev_minor==0){result=terminal_identity(pid,&terminal);close(fd);return result;}
  result=update?authorized_fd(fd):authorized_metadata(fd);int grant=granted_fd(fd);if(grant)result=update&&!missing&&!parent_only?1:0;if(!result&&missing>=(parent_only?1:2))denial_errno=ENOENT;struct statx s;if(!fd_identity(fd,&s)){identity_prefix(pid);fprintf(identity,"\"mount\":%llu,\"inode\":%llu,\"disposition\":%d,\"missingComponents\":%d,\"dirfd\":%d,\"requestedHex\":",(unsigned long long)s.stx_mnt_id,(unsigned long long)s.stx_ino,result,missing,dirfd);hex_string(identity,input);fprintf(identity,",\"baseMount\":%llu,\"baseInode\":%llu,\"grant\":%s}\n",(unsigned long long)base_identity.stx_mnt_id,(unsigned long long)base_identity.stx_ino,grant?"true":"false");}close(fd);}return result;
}
static int target(pid_t pid,int dirfd,unsigned long address,int parent_only,int update){return target_impl(pid,dirfd,address,parent_only,update,0);}
// A return of 2 means no persistent mutation; -1 is unsupported, never success.
static int group_signal(pid_t group){
 if(group<=1)return 0;
 DIR*d=opendir("/proc");if(!d)return -1;struct dirent*e;int result=2;
 while((e=readdir(d))){char*end;long pid=strtol(e->d_name,&end,10);if(*end||pid<=0)continue;
  pid_t pg=getpgid((pid_t)pid);if(pg<0){result=-1;break;}
  if(pg==group&&!find((pid_t)pid)&&!known_dead((pid_t)pid)){result=0;break;}
 }
 closedir(d);return result;
}
static int policy(pid_t tid,struct ptrace_syscall_info*i){__u64*n=i->entry.args;unsigned long nr=i->entry.nr;
 switch(nr){
 case SYS_openat:terminal_probe=n[2]==(O_RDWR|O_NONBLOCK);if(!(n[2]&(O_WRONLY|O_RDWR|O_CREAT|O_TRUNC))&&(n[2]&O_TMPFILE)!=O_TMPFILE)return 2;return target(tid,(int)n[0],n[1],0,1);
 case SYS_mkdirat:case SYS_unlinkat:return target(tid,(int)n[0],n[1],1,0);
 case SYS_fchmodat:return target(tid,(int)n[0],n[1],0,0);
 case SYS_fchownat:if(n[4]&~AT_SYMLINK_NOFOLLOW)return -1;return target_impl(tid,(int)n[0],n[1],0,0,(n[4]&AT_SYMLINK_NOFOLLOW)!=0);
 case SYS_utimensat:if(n[3]&~AT_SYMLINK_NOFOLLOW)return -1;return target_impl(tid,(int)n[0],n[1],0,0,(n[3]&AT_SYMLINK_NOFOLLOW)!=0);
 case SYS_renameat:case SYS_renameat2:{int a=target(tid,(int)n[0],n[1],1,0),b=target(tid,(int)n[2],n[3],1,0);return a<0||b<0?-1:a&&b;}
 case SYS_linkat:{
  if(n[4])return -1; // Empty-path and source-following forms remain unqualified.
  int a=target_impl(tid,(int)n[0],n[1],0,0,1),b=target(tid,(int)n[2],n[3],1,0);
  return a<0||b<0?-1:a&&b;
 }
 case SYS_bind:{struct sockaddr_storage addr;size_t len=n[2];if(len<sizeof(sa_family_t)||len>sizeof addr)return -1;struct iovec l={&addr,len},r={(void*)n[1],len};if(process_vm_readv(tid,&l,1,&r,1,0)!=(ssize_t)len)return -1;if(addr.ss_family==AF_NETLINK){struct sockaddr_nl*nl=(struct sockaddr_nl*)&addr;if(len!=sizeof *nl||nl->nl_pad||nl->nl_pid||nl->nl_groups)return -1;return route_socket(tid,(int)n[0],"bind");}if(addr.ss_family==AF_UNIX){struct sockaddr_un*u=(struct sockaddr_un*)&addr;if(len<=2)return -1;if(!u->sun_path[0])return 2;if(!memchr(u->sun_path,0,len-2))return -1;return target(tid,AT_FDCWD,n[1]+2,1,0);}return addr.ss_family==AF_INET||addr.ss_family==AF_INET6?2:-1;}
 case SYS_symlinkat:return target(tid,(int)n[1],n[2],1,0);
 case SYS_recvmsg:if(n[2])return -1;return route_socket(tid,(int)n[0],"receive");
 case SYS_copy_file_range:return descriptor(tid,(int)n[2],1);
 case SYS_sendfile:return descriptor(tid,(int)n[0],1);
 case SYS_write:case SYS_writev:case SYS_pwrite64:case SYS_pwritev:case SYS_ftruncate:case SYS_fsync:case SYS_fdatasync:return descriptor(tid,(int)n[0],1);
 case SYS_fchmod:case SYS_fchown:case SYS_fallocate:return descriptor(tid,(int)n[0],0);
 case SYS_mmap:if((n[3]&MAP_SHARED)&&(n[2]&PROT_WRITE)&&!(n[3]&MAP_ANONYMOUS))return descriptor(tid,(int)n[4],0);return 2;
 // Shared-map permission upgrades need separate VMA binding; not guessed here.
 case SYS_mprotect:if(n[0]+n[1]<n[0]||(n[2]&~(PROT_READ|PROT_WRITE|PROT_EXEC)))return -1;if(n[2]&PROT_WRITE){char p[80],line[PATH_MAX+128];snprintf(p,sizeof p,"/proc/%d/maps",tid);FILE*f=fopen(p,"r");if(!f)return -1;while(fgets(line,sizeof line,f)){unsigned long lo,hi;char perms[5];if(sscanf(line,"%lx-%lx %4s",&lo,&hi,perms)!=3){fclose(f);return -1;}if(n[0]<hi&&n[0]+n[1]>lo&&perms[3]=='s'){fclose(f);return -1;}}fclose(f);}return 2;
 case SYS_madvise:return n[2]==MADV_DONTNEED||n[2]==MADV_DONTFORK||n[2]==MADV_FREE?2:-1;
 case SYS_ioctl:if(n[1]==0x540f)return terminal_query(tid,(int)n[0]);return n[1]==0x5401||n[1]==0x5413||n[1]==0x5421?2:-1;
 case SYS_fcntl:return n[1]==F_GETPIPE_SZ||n[1]==F_GETFL||n[1]==F_SETFL||n[1]==F_GETFD||n[1]==F_SETFD||n[1]==F_DUPFD||n[1]==F_DUPFD_CLOEXEC||n[1]==F_SETLK||n[1]==F_SETLKW||n[1]==F_GETLK?2:-1;
 case SYS_clone:if(n[0]&forbidden_clone)return 0;return 2;
 case SYS_clone3:return 3; // Preserve the mandatory guard's ENOSYS fallback; never execute clone3.
 case SYS_kill:if(!n[1])return 2;if((int)n[0]<-1)return group_signal(-(int)n[0]);return (int)n[0]>0&&find((pid_t)n[0])?2:0;
 case SYS_tkill:return (int)n[0]>0&&find((pid_t)n[0])?2:0;
 case SYS_tgkill:return find((pid_t)n[0])&&find((pid_t)n[1])?2:0;
 case SYS_ptrace:case SYS_process_vm_readv:case SYS_process_vm_writev:case SYS_pidfd_getfd:case SYS_io_uring_setup:case SYS_io_uring_enter:case SYS_io_uring_register:case SYS_io_setup:case SYS_io_destroy:case SYS_io_cancel:case SYS_io_getevents:case SYS_io_pgetevents:case SYS_io_submit:case SYS_userfaultfd:case SYS_unshare:case SYS_setns:return 0;
 case SYS_accept4:case SYS_brk:case SYS_capget:case SYS_fchdir:case SYS_chdir:case SYS_clock_nanosleep:case SYS_close:case SYS_close_range:case SYS_connect:case SYS_dup:case SYS_dup3:case SYS_epoll_create1:case SYS_epoll_ctl:case SYS_epoll_pwait:case SYS_eventfd2:case SYS_execve:case SYS_exit:case SYS_exit_group:case SYS_fadvise64:case SYS_faccessat:case SYS_faccessat2:case SYS_flock:case SYS_fstat:case SYS_futex:case SYS_getcwd:case SYS_getdents64:case SYS_getegid:case SYS_geteuid:case SYS_getgid:case SYS_getgroups:case SYS_getpeername:case SYS_getpgid:case SYS_getpid:case SYS_getppid:case SYS_getrandom:case SYS_getsockname:case SYS_getsockopt:case SYS_gettid:case SYS_getuid:case SYS_inotify_add_watch:case SYS_inotify_init1:case SYS_inotify_rm_watch:case SYS_listen:case SYS_lseek:case SYS_munmap:case SYS_newfstatat:case SYS_pidfd_open:case SYS_pipe2:case SYS_ppoll:case SYS_prctl:case SYS_pread64:case SYS_prlimit64:case SYS_pselect6:case SYS_read:case SYS_readlinkat:case SYS_recvfrom:case SYS_restart_syscall:case SYS_rseq:case SYS_rt_sigaction:case SYS_rt_sigprocmask:case SYS_rt_sigreturn:case SYS_sched_getaffinity:case SYS_sched_yield:case SYS_sendto:case SYS_set_robust_list:case SYS_set_tid_address:case SYS_setpgid:case SYS_setsid:case SYS_setsockopt:case SYS_shutdown:case SYS_sigaltstack:case SYS_socket:case SYS_socketpair:case SYS_statfs:case SYS_fstatfs:case SYS_statx:case SYS_sysinfo:case SYS_uname:case SYS_wait4:return 2;
 default:return -1;
 }
}
static int scalar_only(struct ptrace_syscall_info*i){__u64*n=i->entry.args;switch(i->entry.nr){
 case SYS_kill:if(!n[1])return 1;return 0;
 case SYS_ioctl:return n[1]==0x5401||n[1]==0x5413||n[1]==0x5421;
 case SYS_fcntl:return n[1]==F_GETPIPE_SZ||n[1]==F_GETFL||n[1]==F_SETFL||n[1]==F_GETFD||n[1]==F_SETFD||n[1]==F_DUPFD||n[1]==F_DUPFD_CLOEXEC||n[1]==F_SETLK||n[1]==F_SETLKW||n[1]==F_GETLK;
 case SYS_madvise:return n[2]==MADV_DONTNEED||n[2]==MADV_DONTFORK||n[2]==MADV_FREE;
 case SYS_mprotect:return !(n[2]&~(PROT_READ|PROT_WRITE|PROT_EXEC))&&!(n[2]&PROT_WRITE)&&n[0]+n[1]>=n[0];
 case SYS_clone:return !(n[0]&forbidden_clone);
 case SYS_openat:return !(n[2]&(O_WRONLY|O_RDWR|O_CREAT|O_TRUNC))&&(n[2]&O_TMPFILE)!=O_TMPFILE;
 case SYS_mmap:return !((n[3]&MAP_SHARED)&&(n[2]&PROT_WRITE)&&!(n[3]&MAP_ANONYMOUS));
 case SYS_accept4:case SYS_brk:case SYS_capget:case SYS_fchdir:case SYS_chdir:case SYS_clock_nanosleep:case SYS_close:case SYS_close_range:case SYS_connect:case SYS_dup:case SYS_dup3:case SYS_epoll_create1:case SYS_epoll_ctl:case SYS_epoll_pwait:case SYS_eventfd2:case SYS_execve:case SYS_exit:case SYS_exit_group:case SYS_fadvise64:case SYS_faccessat:case SYS_faccessat2:case SYS_flock:case SYS_fstat:case SYS_futex:case SYS_getcwd:case SYS_getdents64:case SYS_getegid:case SYS_geteuid:case SYS_getgid:case SYS_getgroups:case SYS_getpeername:case SYS_getpgid:case SYS_getpid:case SYS_getppid:case SYS_getrandom:case SYS_getsockname:case SYS_getsockopt:case SYS_gettid:case SYS_getuid:case SYS_inotify_add_watch:case SYS_inotify_init1:case SYS_inotify_rm_watch:case SYS_listen:case SYS_lseek:case SYS_munmap:case SYS_newfstatat:case SYS_pidfd_open:case SYS_pipe2:case SYS_ppoll:case SYS_prctl:case SYS_pread64:case SYS_prlimit64:case SYS_pselect6:case SYS_read:case SYS_readlinkat:case SYS_recvfrom:case SYS_restart_syscall:case SYS_rseq:case SYS_rt_sigaction:case SYS_rt_sigprocmask:case SYS_rt_sigreturn:case SYS_sched_getaffinity:case SYS_sched_yield:case SYS_sendto:case SYS_set_robust_list:case SYS_set_tid_address:case SYS_setpgid:case SYS_setsid:case SYS_setsockopt:case SYS_shutdown:case SYS_sigaltstack:case SYS_socket:case SYS_socketpair:case SYS_statfs:case SYS_fstatfs:case SYS_statx:case SYS_sysinfo:case SYS_uname:case SYS_wait4:return 1;
 default:return 0;
 }}
static int syscall_info(pid_t tid,struct ptrace_syscall_info*i){memset(i,0,sizeof *i);if(ptrace(PTRACE_GET_SYSCALL_INFO,tid,sizeof *i,i)<0||i->arch!=AUDIT_ARCH_AARCH64){fail("syscall identity");return -1;}return 0;}
static int skip_call(pid_t tid){int nr=-1;struct iovec v={&nr,sizeof nr};if(ptrace(PTRACE_SETREGSET,tid,(void*)NT_ARM_SYSTEM_CALL,&v)){fail("cannot deny syscall");return -1;}return 0;}
static int denied_result(pid_t tid){struct user_pt_regs r;struct iovec v={&r,sizeof r};if(ptrace(PTRACE_GETREGSET,tid,(void*)NT_PRSTATUS,&v))return -1;r.regs[0]=(unsigned long)-denial_errno;return ptrace(PTRACE_SETREGSET,tid,(void*)NT_PRSTATUS,&v);}
static int mutation(struct task*t,struct ptrace_syscall_info*i){
 if(scalar_only(i))return 0;
 if(quiesce())return -1;
 binding_entry=t->entry_seq;unsigned long before=identity_records;
 char rootpath[80],cwdpath[80];snprintf(rootpath,sizeof rootpath,"/proc/%d/root",t->tid);snprintf(cwdpath,sizeof cwdpath,"/proc/%d/cwd",t->tid);
 int rh=hold_proc(rootpath),ch=hold_proc(cwdpath);struct statx rs,cs;
 if(rh<0||ch<0||fd_identity(rh,&rs)||fd_identity(ch,&cs)){if(rh>=0)close(rh);if(ch>=0)close(ch);fail("context identity");return -1;}close(rh);close(ch);
 int bind_family=-1;unsigned bind_port=0,bind_groups=0,bind_padding=0;
 if(i->entry.nr==SYS_bind&&i->entry.args[2]>=sizeof(sa_family_t)&&i->entry.args[2]<=sizeof(struct sockaddr_storage)){
  struct sockaddr_storage address={0};size_t length=i->entry.args[2];struct iovec local={&address,length},remote={(void*)i->entry.args[1],length};
  if(process_vm_readv(t->tid,&local,1,&remote,1,0)!=(ssize_t)length){fail("bind address identity");return -1;}
  bind_family=address.ss_family;
  if(bind_family==AF_NETLINK&&length==sizeof(struct sockaddr_nl)){struct sockaddr_nl*nl=(struct sockaddr_nl*)&address;bind_port=nl->nl_pid;bind_groups=nl->nl_groups;bind_padding=nl->nl_pad;}
 }
 tracef("{\"event\":\"bound-start\",\"tid\":%d,\"entry\":%lu,\"rootMount\":%llu,\"rootInode\":%llu,\"cwdMount\":%llu,\"cwdInode\":%llu,\"addressFamily\":%d,\"netlinkPort\":%u,\"netlinkGroups\":%u,\"netlinkPadding\":%u,\"stopped\":[",t->tid,binding_entry,(unsigned long long)rs.stx_mnt_id,(unsigned long long)rs.stx_ino,(unsigned long long)cs.stx_mnt_id,(unsigned long long)cs.stx_ino,bind_family,bind_port,bind_groups,bind_padding);
 int comma=0;for(int k=0;k<used;k++)if(tasks[k].tid){fprintf(trace,"%s{\"tid\":%d,\"startTime\":%llu}",comma?",":"",tasks[k].tid,tasks[k].started);comma=1;}fputs("]}\n",trace);
 terminal_probe=0;denial_errno=EPERM;int disposition=policy(t->tid,i);if(disposition<0){fprintf(stderr,"Unsupported syscall/target nr=%llu tid=%d\n",(unsigned long long)i->entry.nr,t->tid);fail("unresolved target");return -1;}
 if(disposition==4)denial_errno=ENXIO;
 if(!disposition||disposition==3||disposition==4){if(!disposition)denied++;if(skip_call(t->tid))return -1;}
 pid_t selected=t->tid;if(resume(t,0))return -1;long end=millis()+2000;
 while(!t->stopped&&!failed){if(millis()>end){fail("selected syscall deadline");break;}int c=collect(0);if(c<0)break;if(c==1){struct timespec ts={0,1000000};nanosleep(&ts,NULL);}}
 if(failed||t->tid!=selected||!t->stopped){fail("selected syscall lost");return -1;}
 struct ptrace_syscall_info out;if(syscall_info(selected,&out)||out.op!=PTRACE_SYSCALL_INFO_EXIT){fail("intervening syscall state");return -1;}
 if((!disposition||disposition==4)&&denied_result(selected)){fail("denial result");return -1;}
 tracef("{\"event\":\"bound-exit\",\"tid\":%d,\"entry\":%lu,\"nr\":%llu,\"kernelResult\":%lld,\"result\":%lld,\"denied\":%s,\"disposition\":%d,\"bindings\":%lu}\n",selected,binding_entry,(unsigned long long)i->entry.nr,(long long)out.exit.rval,(disposition&&disposition!=4)?(long long)out.exit.rval:(long long)-denial_errno,disposition?"false":"true",disposition,identity_records-before);
 t->entry=0;if(resume(t,0))return -1;return 1;
}
int main(int argc,char**argv){
 int command_start=1;
 if(argc<2||getuid()!=0||access("/.dockerenv",F_OK))return 5;
 unsigned seconds=60;
 if(argc>1&&!strcmp(argv[1],"--timeout-seconds")){
  if(argc<4||!argv[2][0])return 5;
  for(const char*p=argv[2];*p;p++)if(*p<'0'||*p>'9')return 5;
  char*end;unsigned long value=strtoul(argv[2],&end,10);
  if(*end||value<1||value>1800)return 5;
  seconds=(unsigned)value;command_start=3;
 }
 signal(SIGALRM,deadline);signal(SIGTERM,deadline);signal(SIGINT,deadline);alarm(seconds);umask(077);
 struct stat st;if(stat("/audit",&st)||st.st_uid!=0||chmod("/audit",0700))return 5;
 trace=fopen("/audit/native-trace.jsonl","wxe");identity=fopen("/audit/native-identities.jsonl","wxe");if(!trace||!identity)return 5;
 outfd=open("/audit/stdout",O_CREAT|O_EXCL|O_RDWR|O_APPEND|O_CLOEXEC,0600);errfd=open("/audit/stderr",O_CREAT|O_EXCL|O_RDWR|O_APPEND|O_CLOEXEC,0600);
 if(outfd<0||errfd<0||fd_identity(outfd,&output_stat[0])||fd_identity(errfd,&output_stat[1]))return 5;
 setvbuf(trace,NULL,_IOLBF,0);setvbuf(identity,NULL,_IOLBF,0);
 rootfd=open("/",O_PATH|O_CLOEXEC);int tmp=open("/tmp",O_PATH|O_CLOEXEC);struct statx sx;if(rootfd<0||tmp<0||fd_identity(tmp,&sx))return 5;scratch_mount=sx.stx_mnt_id;close(tmp);
 while(command_start<argc&&!strcmp(argv[command_start],"--grant-update")){
  if(command_start+1>=argc||bind_grant(argv[command_start+1]))return 5;
  command_start+=2;
 }
 if(command_start<argc&&!strcmp(argv[command_start],"--"))command_start++;
 if(command_start>=argc)return 5;


#ifdef SCT_FIXTURE_TERMINAL
 // Credential-free platform fixture only: a real private PTY, no extra capability/mount.
 int master=posix_openpt(O_RDWR|O_NOCTTY|O_CLOEXEC);if(master<0||grantpt(master)||unlockpt(master)||setsid()<0)return 5;
 char*slave_name=ptsname(master);if(!slave_name)return 5;int slave=open(slave_name,O_RDWR|O_CLOEXEC);if(slave<0)return 5;
#endif
 int ready[2],go[2];if(pipe2(ready,O_CLOEXEC)||pipe2(go,O_CLOEXEC))return 5;
 leader=fork();if(leader<0)return 5;
 if(!leader){if(dup2(outfd,1)<0||dup2(errfd,2)<0)_exit(5);close(ready[0]);close(go[1]);if(setgroups(0,NULL)||setgid(65534)||setuid(65534))_exit(5);char c='r';if(write(ready[1],&c,1)!=1||read(go[0],&c,1)!=1)_exit(5);close(ready[1]);close(go[0]);char**command=calloc((size_t)argc+3,sizeof *command);if(!command)_exit(5);command[0]="/opt/factory/syscall-guard";command[1]="--container-owned";for(int i=command_start;i<argc;i++)command[i-command_start+2]=argv[i];execv(command[0],command);_exit(5);}
 close(ready[1]);close(go[0]);char c;if(read(ready[0],&c,1)!=1){fail("trusted launch handshake");goto cleanup;}close(ready[0]);
 unsigned long opts=PTRACE_O_EXITKILL|PTRACE_O_TRACESYSGOOD|PTRACE_O_TRACEFORK|PTRACE_O_TRACECLONE|PTRACE_O_TRACEVFORK|PTRACE_O_TRACEEXEC;
 if(ptrace(PTRACE_SEIZE,leader,0,(void*)opts)||ptrace(PTRACE_INTERRUPT,leader,0,0)||!add(leader)||collect(1)){fail("initial trace stop");goto cleanup;}
 find(leader)->born=1;tracef("{\"event\":\"start\",\"tid\":%d}\n",leader);
 if(write(go[1],"g",1)!=1){fail("launch release");goto cleanup;}close(go[1]);
 while(live&&!failed){
  struct stat so,se;if(fstat(outfd,&so)||fstat(errfd,&se)||so.st_size>16777216||se.st_size>16777216||ftell(trace)>67108864||ftell(identity)>16777216){fail("artifact limit");break;}
  int queued=0;
  int round_start=cursor;for(int step=0;step<used&&!failed;step++){int k=(round_start+step)%used;struct task*t=&tasks[k];if(!t->tid||!t->stopped||t->vfork_child||!t->born)continue;queued=1;cursor=(k+1)%used;if(++events>MAX_EVENTS){fail("event limit");break;}
   int sig=WSTOPSIG(t->status);unsigned ev=(unsigned)t->status>>16;
   if(ev){if(resume(t,0))break;continue;}
   if(sig==(SIGTRAP|0x80)){
    struct ptrace_syscall_info info;if(syscall_info(t->tid,&info))break;
    if(info.op==PTRACE_SYSCALL_INFO_ENTRY){t->nr=info.entry.nr;t->entry=1;tracef("{\"event\":\"entry\",\"tid\":%d,\"nr\":%lu,\"args\":[\"%llx\",\"%llx\",\"%llx\",\"%llx\",\"%llx\",\"%llx\"]}\n",t->tid,t->nr,info.entry.args[0],info.entry.args[1],info.entry.args[2],info.entry.args[3],info.entry.args[4],info.entry.args[5]);
     t->entry_seq=records;int handled=mutation(t,&info);if(handled<0)break;if(handled)continue;
    }else if(info.op==PTRACE_SYSCALL_INFO_EXIT){tracef("{\"event\":\"exit-syscall\",\"tid\":%d,\"nr\":%lu,\"result\":%lld}\n",t->tid,t->nr,(long long)info.exit.rval);t->entry=0;}else{fail("unknown syscall stop");break;}
    if(resume(t,0))break;
   }else if(resume(t,sig))break;
  }
  if(!queued&&live)if(collect(1)<0)break;
 }
cleanup:
 if(seteuid(65534))failed=1,cleanup_ok=0;
 for(int k=0;k<used;k++)if(tasks[k].tid)if(kill(tasks[k].tid,SIGKILL)&&errno!=ESRCH)failed=1,cleanup_ok=0;
 if(kill(leader,SIGKILL)&&errno!=ESRCH)failed=1,cleanup_ok=0;
 if(seteuid(0))failed=1,cleanup_ok=0;
 for(;;){int status;pid_t p=waitpid(-1,&status,__WALL);if(p<0){if(errno==EINTR)continue;if(errno!=ECHILD)failed=1,cleanup_ok=0;break;}if(WIFSTOPPED(status)&&ptrace(PTRACE_CONT,p,0,(void*)(long)SIGKILL)&&errno!=ESRCH)failed=1,cleanup_ok=0;}
 if(ferror(trace)||ferror(identity))failed=1;
 if(fclose(trace))failed=1;
 if(fclose(identity))failed=1;
 close(outfd);close(errfd);
 int code=failed?5:denied?6:maincode?10:0;FILE*f=fopen("/audit/native-receipt.json","wx");if(!f)return 5;
 fprintf(f,"{\"schemaVersion\":1,\"scope\":\"native observer component\",\"realRunnerQualified\":false,\"exitCode\":%d,\"workloadExitCode\":%d,\"denials\":%d,\"events\":%lu,\"traceRecords\":%lu,\"identityRecords\":%lu,\"observerCleanupConfirmed\":%s}\n",code,maincode,denied,events,records,identity_records,cleanup_ok?"true":"false");if(fclose(f))return 5;return code;
}
