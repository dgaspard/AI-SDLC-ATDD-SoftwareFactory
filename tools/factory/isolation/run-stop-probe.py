#!/usr/bin/env python3
"""Fixed native prerequisite probe only; never qualifies an arbitrary launcher."""
import argparse
import json
import re
import subprocess
import uuid
p=argparse.ArgumentParser();p.add_argument('--image',required=True);p.add_argument('--without-ptrace',action='store_true',help='Negative prerequisite check only');a=p.parse_args()
if not re.fullmatch(r'sha256:[a-f0-9]{64}',a.image):p.error('Immutable local image required')
name='factory-sct-prereq-'+str(uuid.uuid4())
cid=subprocess.check_output(['docker','create','--pull=never','--name',name,'--network=none','--read-only','--cap-drop=ALL','--cap-add=SETUID','--cap-add=SETGID',*([] if a.without_ptrace else ['--cap-add=SYS_PTRACE']),'--security-opt=no-new-privileges','--pids-limit=32','--memory=128m','--cpus=1','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16m','--user','0:0','--entrypoint','/opt/factory/syscall-stop-probe',a.image],text=True,timeout=30).strip()
def inspect():return json.loads(subprocess.check_output(['docker','inspect',cid],text=True,timeout=30))[0]['State']
error=None;started=None
try:
 started=subprocess.run(['docker','start','-a',cid],capture_output=True,text=True,timeout=15)
except subprocess.TimeoutExpired:
 error='host deadline'
finally:
 if inspect()['Running']:subprocess.run(['docker','kill',cid],check=True,capture_output=True,timeout=30)
state=inspect()
logs=subprocess.run(['docker','logs',cid],text=True,capture_output=True,check=True,timeout=30)
clean=not state['Running'] and state['Pid']==0
expected={'scope':'fixed native prerequisites only','realRunnerQualified':False,'threadsStopped':2,'queuedWriterHeld':True,'traceeMemoryReadable':True,'privatePathMatchesDescriptor':True,'mountIdentityBound':True,'fsuidRestored':True}
try:receipt=json.loads(logs.stdout)
except (ValueError,TypeError):receipt=None
receipt_valid=(isinstance(receipt,dict) and receipt.keys()==expected.keys() and all(type(receipt[k]) is type(v) and receipt[k]==v for k,v in expected.items()))
passed=(clean and not error and started is not None and started.returncode==0 and state.get('Status')=='exited' and state.get('OOMKilled') is False and state.get('Error')=='' and state['ExitCode']==0 and not logs.stderr and receipt_valid)
print(json.dumps({'scope':'native prerequisites only','realRunnerQualified':False,'prerequisitesPassed':passed,'image':a.image,'container':cid,'exitCode':state['ExitCode'],'cleanupConfirmed':clean,'stdout':logs.stdout,'stderr':logs.stderr,'error':error},indent=2))
raise SystemExit(0 if passed else 5)
