// Fixed neutral workloads for the frozen SCT cases. No consumer application code.
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <sys/stat.h>
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
 if(!strcmp(argv[1],"alias")){
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
 }else if(!strcmp(argv[1],"race")){
  int fd=open("/tmp/sct/safe",O_CREAT|O_WRONLY,0600);if(fd<0||write(fd,"safe",4)!=4)return 70;close(fd);
  if(symlink("safe","/tmp/sct/alias")||symlink("/inputs/protected.txt","/tmp/sct/replacement"))return 70;
  if(pthread_barrier_init(&start,NULL,2)||pthread_barrier_init(&changed,NULL,2)||pthread_barrier_init(&finished,NULL,2))return 70;
  pthread_t thread;if(pthread_create(&thread,NULL,replace,NULL))return 70;
  barrier(&start);errno=0;fd=open("/tmp/sct/alias",O_WRONLY|O_TRUNC);
  if(fd>=0){if(write(fd,"allowed",7)!=7)return 70;close(fd);}else if(errno!=EPERM)return 70;
  barrier(&changed);rejected(AT_FDCWD,"/tmp/sct/alias",O_WRONLY|O_TRUNC,EPERM);barrier(&finished);
  if(pthread_join(thread,NULL))return 70;
 }else if(!strcmp(argv[1],"interrupt")){
  int go[2];if(pipe(go))return 70;pid_t child=fork();if(child<0)return 70;
  if(!child){close(go[1]);char c;if(read(go[0],&c,1)!=1)return 70;for(;;)if(write(1,"child-writer\n",13)!=13)return 70;}
  close(go[0]);if(write(1,"READY\n",6)!=6||write(go[1],"g",1)!=1)return 70;
  int status;if(waitpid(child,&status,0)<0)return 70;return 70;
 }else return 70;
 puts("SCT_WORKLOAD_ASSERTIONS_PASSED");return 0;
}
