#!/usr/bin/env python3
"""Explicit fixed neutral audit experiment. Does not qualify or enable a real runner."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import uuid


def write(path, value):
    temporary = path.with_name(path.name + '.' + str(uuid.uuid4()) + '.tmp')
    with temporary.open('x') as file:
        os.chmod(temporary, 0o600)
        json.dump(value, file, indent=2)
        file.write('\n')
        file.flush()
        os.fsync(file.fileno())
    temporary.rename(path)
    descriptor = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--docker', required=True)
    parser.add_argument('--image', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if not Path(args.docker).is_absolute() or not re.fullmatch(r'sha256:[a-f0-9]{64}', args.image):
        raise ValueError('Absolute Docker executable and immutable image ID required')
    requested = Path(args.output)
    if not requested.is_absolute() or requested.exists() or requested.is_symlink():
        raise ValueError('New external absolute output required')
    output = requested.parent.resolve(strict=True) / requested.name
    factory = Path(__file__).resolve().parents[3]
    if output == factory or factory in output.parents or output in factory.parents:
        raise ValueError('Output overlaps factory')
    output.mkdir(mode=0o700)

    def command(arguments, **kwargs):
        return subprocess.run([args.docker, *arguments], check=True, capture_output=True,
                              text=True, timeout=35, **kwargs)

    reports = []
    for name, capabilities in [('observed-denials', ['--cap-add=SYS_PTRACE']),
                               ('missing-observer-capability', [])]:
        identity = 'factory-audit-' + str(uuid.uuid4())
        journal = output / (name + '.json')
        record = {'containerName': identity, 'image': args.image, 'phase': 'PREPARED'}
        write(journal, record)
        create = ['create', '--pull=never', '--name', identity, '--network=none', '--read-only',
                  '--cap-drop=ALL', '--cap-add=SETUID', '--cap-add=SETGID', '--cap-add=KILL',
                  *capabilities, '--security-opt=no-new-privileges', '--pids-limit=128',
                  '--memory=256m', '--memory-swap=256m', '--cpus=2', '--restart=no',
                  '--no-healthcheck', '--log-driver=json-file', '--log-opt=max-size=10m',
                  '--log-opt=max-file=1', '--tmpfs=/tmp:rw,nosuid,nodev,size=16m,mode=1777',
                  '--tmpfs=/audit:rw,nosuid,nodev,size=16m,mode=0700', args.image]
        cid = command(create).stdout.strip()
        if not re.fullmatch(r'[a-f0-9]{64}', cid):
            raise ValueError('Missing container identity')
        record.update(containerId=cid, argv=[args.docker, *create], phase='CREATED')
        write(journal, record)
        try:
            command(['start', cid])
            command(['wait', cid])
        finally:
            command(['stop', '--timeout', '2', cid])
            state = json.loads(command(['inspect', cid]).stdout)[0]['State']
            if state['Running'] or state['Pid'] != 0:
                raise ValueError('Outer cleanup not confirmed')
        logs = command(['logs', cid])
        (output / (name + '.stdout')).write_text(logs.stdout)
        (output / (name + '.stderr')).write_text(logs.stderr)
        record.update(phase='STOPPED', exitCode=state['ExitCode'], cleanupConfirmed=True,
                      stdoutSha256=hashlib.sha256(logs.stdout.encode()).hexdigest())
        write(journal, record)
        if name == 'observed-denials':
            result = json.loads(logs.stdout)
            if state['ExitCode'] != 0 or result['status'] != 'PROBE_PASSED' or result['realRunnerQualified']:
                raise ValueError('Fixed audit probe did not pass')
            trace = result.pop('trace')
            if hashlib.sha256(trace.encode()).hexdigest() != result['traceSha256']:
                raise ValueError('Audit trace identity mismatch')
            (output / 'syscalls.log').write_text(trace)
            write(output / 'observations.json', result)
        elif state['ExitCode'] == 0 or 'PROBE_PASSED' in logs.stdout:
            raise ValueError('Missing observer capability incorrectly succeeded')
        reports.append(record)
        command(['rm', cid])  # Only stopped, validated containers created by this test.
    write(output / 'result.json', {'scope': 'fixed neutral audit experiment',
                                  'realRunnerQualified': False, 'cases': reports})
    print(str(output / 'result.json'))


if __name__ == '__main__':
    main()
