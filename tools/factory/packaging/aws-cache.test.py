"""Explicit offline SDK provisioning checks; requires FACTORY_NPM_CACHE."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
spec = importlib.util.spec_from_file_location('packaging_build', Path(__file__).with_name('build-local.py'))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
cache = Path(os.environ['FACTORY_NPM_CACHE']).resolve(strict=True)

class OfflineAwsProvisioning(unittest.TestCase):
    def test_stale_extra_and_tampered_installed_files_are_not_packaged(self):
        with tempfile.TemporaryDirectory(prefix='factory-aws-integrity-') as directory:
            output = Path(directory)
            modules = output / 'broker/aws/node_modules'
            package = modules / '@aws-sdk/client-secrets-manager'
            package.mkdir(parents=True)
            (package / 'package.json').write_text('{"version":"0.0.0"}')
            (package / 'dist-cjs').mkdir()
            (package / 'dist-cjs/index.js').write_text('tampered fixture')
            extra = modules / 'unlocked-extra'
            extra.mkdir(); (extra / 'index.js').write_text('extra fixture')
            build.stage_aws(output, cache)
            version = json.loads((package / 'package.json').read_text())['version']
            self.assertEqual(version, '3.1158.0')
            self.assertNotEqual((package / 'dist-cjs/index.js').read_text(), 'tampered fixture')
            self.assertFalse(extra.exists())

    def test_empty_cache_fails_without_registry_fallback(self):
        with tempfile.TemporaryDirectory(prefix='factory-aws-missing-') as directory:
            base = Path(directory); output = base / 'output'; output.mkdir(); empty = base / 'empty-cache'; empty.mkdir()
            with self.assertRaises(subprocess.CalledProcessError):
                build.stage_aws(output, empty)
            self.assertIn('ENOTCACHED', (output / 'aws-install.log').read_text())

if __name__ == '__main__':
    unittest.main()
