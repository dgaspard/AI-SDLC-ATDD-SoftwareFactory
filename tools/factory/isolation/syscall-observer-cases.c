// Fixed neutral workloads for the frozen SCT cases. No consumer application code.
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <linux/netlink.h>
#include <linux/rtnetlink.h>
#include <net/if.h>
#include <ifaddrs.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
static pthread_barrier_t start,changed,finished;
static void die(void){_exit(70);}
static void rejected(int dir,const char*p,int flags,int expected){errno=0;int fd=openat(dir,p,flags,0600);if(fd>=0||errno!=expected)die();}
static void barrier(pthread_barrier_t*b){int r=pthread_barrier_wait(b);if(r&&r!=PTHREAD_BARRIER_SERIAL_THREAD)die();}
static void *replace(void*unused){(void)unused;barrier(&start);if(rename("/tmp/sct/replacement","/tmp/sct/alias"))die();barrier(&changed);barrier(&finished);return NULL;}
int main(int argc,char**argv){
 if(argc!=2)return 70;
 if(mkdir("/tmp/sct",0700)&&errno!=EEXIST)return 70;
 if(!strcmp(argv[1],"pipe-query")){
  int pipes[2];if(pipe(pipes))return 70;int size=fcntl(pipes[0],F_GETPIPE_SZ);if(size<=0)return 70;
  if(write(pipes[1],"safe",4)!=4||fcntl(pipes[0],F_GETPIPE_SZ)!=size)return 70;
  char bytes[4];if(read(pipes[0],bytes,4)!=4||memcmp(bytes,"safe",4))return 70;
  close(pipes[0]);errno=0;if(fcntl(pipes[0],F_GETPIPE_SZ)!=-1||errno!=EBADF)return 70;close(pipes[1]);
 }else if(!strcmp(argv[1],"pipe-resize")){
  int pipes[2];if(pipe(pipes))return 70;fcntl(pipes[0],F_SETPIPE_SZ,4096);return 70;
 }else if(!strncmp(argv[1],"route-",6)){
  const char*name=argv[1]+6;int fd=socket(AF_NETLINK,SOCK_RAW|SOCK_CLOEXEC|SOCK_NONBLOCK,!strcmp(name,"protocol")?NETLINK_USERSOCK:NETLINK_ROUTE);if(fd<0)return 70;
  struct sockaddr_nl address={.nl_family=AF_NETLINK};socklen_t length=sizeof address;
  if(!strcmp(name,"groups"))address.nl_groups=1;
  else if(!strcmp(name,"port"))address.nl_pid=(unsigned)getpid();
  else if(!strcmp(name,"padding"))address.nl_pad=1;
  else if(!strcmp(name,"length"))length--;
  else if(!strcmp(name,"reuse")){close(fd);int replacement=open("/dev/null",O_RDONLY);if(replacement<0)return 70;if(replacement!=fd){if(dup2(replacement,fd)<0)return 70;close(replacement);}}
  if(bind(fd,(struct sockaddr*)&address,length))return 70;
  if(!strcmp(name,"receive-empty")){
   char bytes[4096];struct iovec io={bytes,sizeof bytes};struct msghdr message={.msg_iov=&io,.msg_iovlen=1};errno=0;if(recvmsg(fd,&message,0)!=-1||errno!=EAGAIN)return 70;
  }else if(!strcmp(name,"mutation")){
   struct {struct nlmsghdr head;struct ifinfomsg info;} request={.head={.nlmsg_len=NLMSG_LENGTH(sizeof(struct ifinfomsg)),.nlmsg_type=RTM_NEWLINK,.nlmsg_flags=NLM_F_REQUEST|NLM_F_ACK,.nlmsg_seq=123},.info={.ifi_family=AF_UNSPEC,.ifi_index=1,.ifi_change=IFF_UP,.ifi_flags=0}};
   if(sendto(fd,&request,request.head.nlmsg_len,0,(struct sockaddr*)&address,sizeof address)!=(ssize_t)request.head.nlmsg_len)return 70;
   char bytes[4096];struct iovec io={bytes,sizeof bytes};struct msghdr message={.msg_iov=&io,.msg_iovlen=1};ssize_t count=-1;
   for(int tries=0;tries<100;tries++){count=recvmsg(fd,&message,0);if(count>=0)break;if(errno!=EAGAIN)return 70;usleep(1000);}
   if(count<(ssize_t)NLMSG_LENGTH(sizeof(struct nlmsgerr)))return 70;
   struct nlmsghdr*head=(struct nlmsghdr*)bytes;
   if(head->nlmsg_type!=NLMSG_ERROR||((struct nlmsgerr*)NLMSG_DATA(head))->error!=-EPERM)return 70;
   struct ifaddrs*interfaces;if(getifaddrs(&interfaces))return 70;int up=0;for(struct ifaddrs*i=interfaces;i;i=i->ifa_next)if(!strcmp(i->ifa_name,"lo")&&(i->ifa_flags&IFF_UP))up=1;freeifaddrs(interfaces);if(!up)return 70;
   puts("ROUTE_MUTATION_DENIED_LOOPBACK_UNCHANGED");
  }else return 70;
  close(fd);
 }else if(!strcmp(argv[1],"terminal-probe")){
  rejected(AT_FDCWD,"/dev/tty",O_RDWR|O_NONBLOCK,ENXIO);
  if(symlink("/dev/tty","/tmp/sct/terminal"))return 70;
  rejected(AT_FDCWD,"/tmp/sct/terminal",O_RDWR|O_NONBLOCK,ENXIO);
  int group;errno=0;if(ioctl(2,TIOCGPGRP,&group)!=-1||errno!=ENOTTY)return 70;
 }else if(!strcmp(argv[1],"terminal-present")){
  int tty=open("/dev/tty",O_RDONLY|O_NOCTTY);int group=0;if(tty<0||ioctl(tty,TIOCGPGRP,&group)||group!=getpgid(0))return 70;close(tty);
  rejected(AT_FDCWD,"/dev/tty",O_RDWR|O_NONBLOCK,EPERM);
 }else if(!strcmp(argv[1],"terminal-flags")){
  rejected(AT_FDCWD,"/dev/tty",O_RDWR,EPERM);
  rejected(AT_FDCWD,"/dev/tty",O_RDWR|O_NONBLOCK|O_TRUNC,EPERM);
 }else if(!strcmp(argv[1],"terminal-targets")){
  rejected(AT_FDCWD,"/inputs/protected.txt",O_RDWR|O_NONBLOCK,EPERM);
  rejected(AT_FDCWD,"/dev/full",O_RDWR|O_NONBLOCK,EPERM);
 }else if(!strcmp(argv[1],"terminal-mutation")){
  int group=1;ioctl(2,TIOCSPGRP,&group);return 70;
 }else if(!strcmp(argv[1],"terminal-unknown")){
  ioctl(2,0x54ff,0);return 70;
 }else if(!strcmp(argv[1],"process-group-query")){
  pid_t group=getpgid(0);if(group<0||getpgid(getpid())!=group)return 70;
  errno=0;if(getpgid(2147483647)!=-1||errno!=ESRCH)return 70;
 }else if(!strcmp(argv[1],"alias")){
  if(symlink("/inputs","/tmp/sct/alias"))return 70;
  rejected(AT_FDCWD,"/tmp/sct/alias/protected.txt",O_WRONLY|O_TRUNC,EPERM);
  rejected(AT_FDCWD,"/tmp/sct/alias/new.txt",O_WRONLY|O_CREAT,EPERM);
 }else if(!strcmp(argv[1],"cwd-dirfd")){
  int old=open("/tmp/sct",O_RDONLY|O_DIRECTORY);if(old<0)return 70;close(old);
  int fd=open("/inputs",O_RDONLY|O_DIRECTORY);if(fd<0)return 70;if(fd!=old&&dup2(fd,old)<0)return 70;
  if(fchdir(old))return 70;
  rejected(AT_FDCWD,"protected.txt",O_WRONLY|O_TRUNC,EPERM);
  if(chdir("/tmp/sct"))return 70;
  rejected(old,"new.txt",O_WRONLY|O_CREAT,EPERM);
 }else if(!strcmp(argv[1],"relative")){
  if(chdir("/tmp/sct"))return 70;
  rejected(AT_FDCWD,"../../inputs/protected.txt",O_WRONLY|O_TRUNC,EPERM);
 }else if(!strcmp(argv[1],"missing")){
  rejected(AT_FDCWD,"/inputs/missing-parent/child",O_WRONLY|O_CREAT,ENOENT);
 }else if((!strcmp(argv[1],"race")||!strcmp(argv[1],"terminal-race"))){
  int fd=open("/tmp/sct/safe",O_CREAT|O_WRONLY,0600);if(fd<0||write(fd,"safe",4)!=4)return 70;close(fd);
  int terminal_race=!strcmp(argv[1],"terminal-race");
  if(symlink(terminal_race?"/dev/tty":"safe","/tmp/sct/alias")||symlink("/inputs/protected.txt","/tmp/sct/replacement"))return 70;
  if(pthread_barrier_init(&start,NULL,2)||pthread_barrier_init(&changed,NULL,2)||pthread_barrier_init(&finished,NULL,2))return 70;
  pthread_t thread;if(pthread_create(&thread,NULL,replace,NULL))return 70;
  barrier(&start);errno=0;fd=open("/tmp/sct/alias",terminal_race?(O_RDWR|O_NONBLOCK):(O_WRONLY|O_TRUNC));
  if(fd>=0){if(terminal_race||write(fd,"allowed",7)!=7)return 70;close(fd);}else if(errno!=EPERM&&!(terminal_race&&errno==ENXIO))return 70;
  barrier(&changed);rejected(AT_FDCWD,"/tmp/sct/alias",terminal_race?(O_RDWR|O_NONBLOCK):(O_WRONLY|O_TRUNC),EPERM);barrier(&finished);
  if(pthread_join(thread,NULL))return 70;
 }else if(!strcmp(argv[1],"interrupt")){
  int go[2];if(pipe(go))return 70;pid_t child=fork();if(child<0)return 70;
  if(!child){close(go[1]);char c;if(read(go[0],&c,1)!=1)return 70;for(;;)if(write(1,"child-writer\n",13)!=13)return 70;}
  close(go[0]);if(write(1,"READY\n",6)!=6||write(go[1],"g",1)!=1)return 70;
  int status;if(waitpid(child,&status,0)<0)return 70;return 70;
 }else return 70;
 puts("SCT_WORKLOAD_ASSERTIONS_PASSED");return 0;
}
