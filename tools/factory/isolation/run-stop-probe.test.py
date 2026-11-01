"""Offline driver regressions; synthetic Docker is not platform qualification."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
receipt={'scope':'fixed native prerequisites only','realRunnerQualified':False,'threadsStopped':2,'queuedWriterHeld':True,'traceeMemoryReadable':True,'privatePathMatchesDescriptor':True,'mountIdentityBound':True,'fsuidRestored':True}
class Driver(unittest.TestCase):
 def run_case(self,kind):
  with tempfile.TemporaryDirectory(prefix='sct-driver-test-') as d:
   p=Path(d);(p/'receipt').write_text(json.dumps(receipt));fake=p/'docker'
   fake.write_text('#!'+sys.executable+'\n'+'''import json,os,sys
from pathlib import Path
kind=os.environ['SCT_TEST_KIND'];cmd=sys.argv[1]
if cmd=='create': print('f'*64)
elif cmd=='start': sys.exit(1 if kind=='start-failed' else 0)
elif cmd=='inspect': print(json.dumps([{'State':{'Running':False,'Pid':0,'ExitCode':5 if kind=='nonzero' else 0,'Status':'created' if kind=='created' else 'exited','OOMKilled':kind=='oom','Error':'runtime failure' if kind=='runtime-error' else ''}}]))
elif cmd=='logs':
 r=json.loads(Path(__file__).with_name('receipt').read_text())
 if kind=='false-receipt': r['queuedWriterHeld']=False
 if kind=='unknown-field': r['extra']=True
 if kind=='numeric-boolean': r['queuedWriterHeld']=1
 if kind=='stderr': print('unexpected native error',file=sys.stderr)
 print('not-json' if kind=='malformed' else '' if kind=='empty' else json.dumps(r))
else: sys.exit(2)
''');fake.chmod(0o700)
   env={**os.environ,'PATH':d+os.pathsep+os.environ['PATH'],'SCT_TEST_KIND':kind}
   r=subprocess.run([sys.executable,str(Path(__file__).with_name('run-stop-probe.py')),'--image','sha256:'+'a'*64],env=env,text=True,capture_output=True,timeout=10)
   self.assertEqual(r.returncode,0 if kind=='pass' else 5,r.stderr)
   self.assertEqual(json.loads(r.stdout)['prerequisitesPassed'],kind=='pass')
 def test_valid_receipt(self):self.run_case('pass')
 def test_failures(self):
  for kind in ['start-failed','created','oom','runtime-error','nonzero','false-receipt','unknown-field','numeric-boolean','stderr','malformed','empty']:
   with self.subTest(kind=kind):self.run_case(kind)
if __name__=='__main__':unittest.main()
