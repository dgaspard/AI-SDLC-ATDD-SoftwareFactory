#!/usr/bin/env python3
"""Explicit offline component packaging. Does not qualify or enable a launcher."""
import argparse
import base64
import hashlib
import json
import os
import tempfile
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BROKER = ['bedrock-converse.mjs', 'audited-runner.mjs', 'aws-secrets.mjs', 'broker-upstream.mjs', 'model-broker.mjs', 'broker-protocol.mjs', 'credential-store.mjs',
          'model-broker.test.mjs', 'processes.mjs', 'change-support.mjs', 'core.mjs']


def validate_cache(cache, output):
    cache = Path(cache).resolve(strict=True)
    if not cache.is_dir():
        raise ValueError('Offline cache must be a directory')
    destination = output.resolve()
    for protected in [ROOT, destination]:
        if cache == protected or protected in cache.parents or cache in protected.parents:
            raise ValueError('Writable npm cache overlaps protected input or staging output')
    return cache


def stage_aws(output, cache):
    cache = validate_cache(cache, output)
    sdk = ROOT / 'tools/factory/aws'
    target = output / 'broker/aws'
    target.mkdir(parents=True, exist_ok=True)
    for name in ['package.json', 'package-lock.json', 'client.mjs', 'converse.mjs']:
        shutil.copyfile(sdk / name, target / name)
    before = (target / 'package-lock.json').read_bytes()
    # npm ci discards any installed tree, verifies lockfile integrity and runs no scripts.
    # Explicit offline cache: never discover credentials, contact a registry or fall back.
    with tempfile.TemporaryDirectory(prefix='factory-npm-home-') as home:
        user_config, global_config = Path(home) / 'user.npmrc', Path(home) / 'global.npmrc'
        user_config.write_text(''); global_config.write_text('')
        env = {'PATH': os.environ['PATH'], 'HOME': home,
               'NPM_CONFIG_USERCONFIG': str(user_config), 'NPM_CONFIG_GLOBALCONFIG': str(global_config)}
        with (output / 'aws-install.log').open('w') as log:
            subprocess.run(['npm', 'ci', '--offline', '--ignore-scripts', '--no-audit',
                            '--no-fund', '--cache', str(cache)], cwd=target, env=env,
                           stdout=log, stderr=subprocess.STDOUT, check=True, timeout=120)
    if (target / 'package-lock.json').read_bytes() != before:
        raise ValueError('AWS lockfile changed during provisioning')
    for file in target.rglob('*'):
        if file.is_symlink() or not (file.is_file() or file.is_dir()):
            raise ValueError('AWS SDK contains a nonregular input')


def stage(archive, output, strace_archive=None, include_aws=False, aws_cache=None):
    if include_aws and (aws_cache is None or not Path(aws_cache).is_absolute() or not Path(aws_cache).is_dir()):
        raise ValueError('Explicit existing offline AWS npm cache required')
    pins = json.loads((HERE / 'inputs.json').read_text())
    archive = Path(archive).resolve(strict=True)
    requested = Path(output)
    if not requested.is_absolute() or requested.exists() or requested.is_symlink():
        raise ValueError('Output must be a new absolute external directory')
    parent = requested.parent.resolve(strict=True)
    output = parent / requested.name
    if output == ROOT or ROOT in output.parents or output in ROOT.parents:
        raise ValueError('Output overlaps factory checkout')
    if include_aws:
        aws_cache = validate_cache(aws_cache, output)
    digest = hashlib.sha512()
    with archive.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1048576), b''):
            digest.update(chunk)
    if 'sha512-' + base64.b64encode(digest.digest()).decode() != pins['codex']['integrity']:
        raise ValueError('Codex archive integrity mismatch')
    if strace_archive is not None:
        strace_archive = Path(strace_archive).resolve(strict=True)
        if hashlib.sha256(strace_archive.read_bytes()).hexdigest() != pins['strace']['sha256']:
            raise ValueError('Strace archive integrity mismatch')
    # Check every member before creating output; never extract links or special files.
    prefix = 'package/vendor/aarch64-unknown-linux-musl/'
    with tarfile.open(archive) as source:
        members = source.getmembers()
        names = set()
        for member in members:
            name = Path(member.name)
            if not member.isfile() or name.is_absolute() or '..' in name.parts or member.name in names:
                raise ValueError('Unsafe archive member')
            names.add(member.name)
        output.mkdir(mode=0o700)
        for member in members:
            if not member.name.startswith(prefix):
                continue
            target = output / 'vendor' / member.name[len(prefix):]
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.extractfile(member) as src, target.open('xb') as dst:
                shutil.copyfileobj(src, dst)
            target.chmod(0o755 if member.mode & 0o111 else 0o644)
    (output / 'broker').mkdir()
    for name in BROKER:
        shutil.copyfile(ROOT / 'tools/factory' / name, output / 'broker' / name)
    for name in ['runner.Dockerfile', 'broker.Dockerfile', 'inputs.json', 'build-local.py']:
        shutil.copyfile(HERE / name, output / name)
    if strace_archive is not None:
        shutil.copyfile(strace_archive, output / 'strace.deb')
        shutil.copyfile(HERE / 'auditor.Dockerfile', output / 'auditor.Dockerfile')
        (output / 'audit').mkdir()
        for name in ['observer.mjs', 'workload.mjs', 'syscall-cases.c']:
            shutil.copyfile(ROOT / 'tools/factory/audit-probe' / name, output / 'audit' / name)
    if strace_archive is not None:
        (output / 'isolation').mkdir()
        shutil.copyfile(ROOT / 'tools/factory/isolation/syscall-guard.c', output / 'isolation/syscall-guard.c')
    inputs = {}
    for file in sorted(output.rglob('*')):
        if file.is_file():
            inputs[str(file.relative_to(output))] = hashlib.sha256(file.read_bytes()).hexdigest()
    if include_aws:
        stage_aws(output, Path(aws_cache).resolve(strict=True))
        for file in sorted((output / 'broker/aws').rglob('*')):
            if file.is_file():
                inputs[str(file.relative_to(output))] = hashlib.sha256(file.read_bytes()).hexdigest()
    (output / 'source-inputs.json').write_text(json.dumps(inputs, indent=2) + '\n')
    return pins, output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--strace-archive', help='Optional exact pinned Debian archive for neutral auditor probe')
    parser.add_argument('--aws', action='store_true', help='Include explicitly preprovisioned locked AWS SDK')
    parser.add_argument('--aws-cache', help='Explicit preprovisioned npm cache; AWS install is offline only')
    args = parser.parse_args()
    pins, output = stage(args.archive, args.output, args.strace_archive, args.aws, args.aws_cache)
    # Require local availability. Never pull images, fetch packages or run lifecycle hooks.
    inspect = subprocess.check_output(['docker', 'image', 'inspect', pins['baseImage']], text=True)
    base = json.loads(inspect)[0]
    if base['Architecture'] != 'arm64' or base['Os'] != 'linux':
        raise ValueError('Cached base platform differs from pinned platform')
    if args.strace_archive:
        compiler = json.loads(subprocess.check_output(['docker', 'image', 'inspect', pins['compilerImage']], text=True))[0]
        if compiler['Architecture'] != 'arm64' or compiler['Os'] != 'linux':
            raise ValueError('Cached compiler platform differs from pinned platform')
    report = {'schemaVersion': 1, 'kind': 'component-packaging', 'realRunnerEnabled': False, 'awsSdkIncluded': args.aws,
              'baseImage': base['Id'], 'compilerImage': compiler['Id'] if args.strace_archive else None, 'pythonVersion': sys.version,
              'dockerVersion': json.loads(subprocess.check_output(
                  ['docker', 'version', '--format', '{{json .}}'], text=True)), 'images': {}, 'inputsSha256': hashlib.sha256(
                  (output / 'source-inputs.json').read_bytes()).hexdigest()}
    for component in ['runner', 'broker'] + (['auditor'] if args.strace_archive else []):
        iid = output / (component + '.iid')
        with (output / (component + '-build.log')).open('w') as log:
            subprocess.run(['docker', 'build', '--network=none', '--pull=false',
                            '--platform=linux/arm64', '--iidfile', str(iid),
                            '-f', str(output / (component + '.Dockerfile')), str(output)],
                           stdout=log, stderr=subprocess.STDOUT, check=True)
        image = iid.read_text().strip()
        if len(image) != 71 or not image.startswith('sha256:'):
            raise ValueError('Missing immutable image ID')
        report['images'][component] = image
    (output / 'packaging.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
