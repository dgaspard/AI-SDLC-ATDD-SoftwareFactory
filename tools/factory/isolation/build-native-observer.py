#!/usr/bin/env python3
"""Offline component image only. Uses an existing immutable qualified-tool input image."""
import argparse, hashlib, json, re, shutil, subprocess, tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--docker',required=True);p.add_argument('--base',required=True);p.add_argument('--omit-record',action='store_true');args=p.parse_args()
if not Path(args.docker).is_absolute() or not re.fullmatch(r'sha256:[a-f0-9]{64}',args.base):p.error('Absolute Docker binary and immutable local base image required')
here=Path(__file__).resolve().parent
context=Path(tempfile.mkdtemp(prefix='factory-native-build-')).resolve()
def command(argv):return subprocess.check_output([args.docker,*argv],text=True).strip()
inspected=json.loads(command(['image','inspect',args.base]))[0]
if inspected['Os']!='linux' or inspected['Architecture']!='arm64':raise ValueError('Linux arm64 base required')
# Local reference is only a Docker build input; verify it immediately, record it,
# and use the resulting immutable image ID for every qualification invocation.
tag='factory-native-base-'+args.base[7:]+':local'
command(['tag',args.base,tag])
if json.loads(command(['image','inspect',tag]))[0]['Id']!=inspected['Id']:raise ValueError('Local base changed')
sources=[here/'syscall-observer.c',here/'syscall-guard.c',here/'syscall-observer-cases.c',here.parent/'native-audited-runner.mjs',here.parent/'broker-codex-probe.mjs',*[here.parent/name for name in ['bedrock-converse.mjs','model-broker.mjs','broker-upstream.mjs','broker-protocol.mjs','change-support.mjs','core.mjs','processes.mjs','model-channel.mjs','coding-client.mjs']]]
for source in sources:shutil.copyfile(source,context/source.name)
shutil.copyfile(here/'native-observer.Dockerfile',context/'Dockerfile')
argv=['build','--network=none','--pull=false','--iidfile',str(context/'image.id'),'--build-arg','QUALIFICATION_BASE='+tag]
if args.omit_record:argv+=['--build-arg','FAULT_FLAGS=-DSCT_FAULT_SKIP_RECORD']
with (context/'build.log').open('w') as log:subprocess.run([args.docker,*argv,str(context)],stdout=log,stderr=subprocess.STDOUT,check=True)
result={'scope':'native component only','image':(context/'image.id').read_text().strip(),'base':args.base,'baseConfigId':inspected['Id'],'fault':'omit-record' if args.omit_record else None,'context':str(context),'sourceHashes':{s.name:hashlib.sha256(s.read_bytes()).hexdigest() for s in sources+[here/'native-observer.Dockerfile']}}
(context/'provenance.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
