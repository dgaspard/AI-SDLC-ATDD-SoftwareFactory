import base64
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('packaging_build', Path(__file__).with_name('build-local.py'))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class PackagingSafety(unittest.TestCase):
    def test_bad_integrity_has_no_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'bad.tgz'
            archive.write_bytes(b'not the pinned archive')
            with self.assertRaisesRegex(ValueError, 'integrity'):
                build.stage(archive, root / 'out')
            self.assertFalse((root / 'out').exists())

    def test_shortcut_into_factory_rejected_before_archive_read(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'shortcut').symlink_to(build.ROOT / 'spec', target_is_directory=True)
            archive = root / 'archive'
            archive.write_bytes(b'not read')
            with self.assertRaisesRegex(ValueError, 'overlaps'):
                build.stage(archive, root / 'shortcut' / 'must-not-exist')
            self.assertFalse((build.ROOT / 'spec/must-not-exist').exists())

    def test_cache_shortcut_into_protected_input_rejected_before_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'cache-shortcut').symlink_to(build.ROOT / 'spec', target_is_directory=True)
            with patch.object(build.subprocess, 'run', side_effect=AssertionError('command reached')):
                with self.assertRaisesRegex(ValueError, 'overlaps'):
                    build.stage_aws(root, root / 'cache-shortcut')
            self.assertFalse((root / 'broker').exists())

    def test_existing_output_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'archive'
            archive.write_bytes(b'unchanged')
            with self.assertRaisesRegex(ValueError, 'new absolute'):
                build.stage(archive, root)
            self.assertEqual(archive.read_bytes(), b'unchanged')

    def test_unsafe_archive_members_rejected_before_output_creation(self):
        for name, link in [('package/../escape', False), ('/escape', False), ('package/link', True)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                archive = root / 'archive.tgz'
                with tarfile.open(archive, 'w:gz') as stream:
                    member = tarfile.TarInfo(name)
                    if link:
                        member.type = tarfile.SYMTYPE
                        member.linkname = '/etc/passwd'
                    stream.addfile(member, io.BytesIO())
                integrity = 'sha512-' + base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
                (root / 'inputs.json').write_text(json.dumps({'codex': {'integrity': integrity}}))
                with patch.object(build, 'HERE', root), self.assertRaisesRegex(ValueError, 'Unsafe'):
                    build.stage(archive, root / 'out')
                self.assertFalse((root / 'out').exists())

    def test_bad_optional_observer_archive_has_no_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'codex.tgz'
            with tarfile.open(archive, 'w:gz'):
                pass
            integrity = 'sha512-' + base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
            (root / 'inputs.json').write_text(json.dumps({'codex': {'integrity': integrity}, 'strace': {'sha256': '0' * 64}}))
            observer = root / 'strace.deb'
            observer.write_bytes(b'changed package')
            with patch.object(build, 'HERE', root), self.assertRaisesRegex(ValueError, 'Strace archive integrity'):
                build.stage(archive, root / 'out', observer)
            self.assertFalse((root / 'out').exists())


if __name__ == '__main__':
    unittest.main()
