#!/usr/bin/env python3
"""Fail-closed packaging and build-secret regression checks."""
import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('fast_release', Path(__file__).with_name('fast-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class FastReleaseTests(unittest.TestCase):
    def test_modified_source_is_rejected_before_any_external_call(self):
        with patch.object(sys, 'argv', ['fast-release.py', '--ci-run', '123']), \
             patch.object(release, 'command', return_value=' M Dockerfile') as run, \
             patch.object(release, 'github') as github:
            with self.assertRaisesRegex(ValueError, 'clean'):
                release.main()
            github.assert_not_called()
            self.assertEqual(run.call_count, 1)

    def test_invalid_proof_never_reaches_gcloud(self):
        with patch.object(sys, 'argv', ['fast-release.py', '--ci-run', '123']), \
             patch.object(release, 'command', side_effect=['', 'a' * 40, 'b' * 40]) as run, \
             patch.object(release, 'verified_proof', side_effect=ValueError('tree mismatch')):
            with self.assertRaisesRegex(ValueError, 'tree mismatch'):
                release.main()
            self.assertTrue(all(c.args[0][0] == 'git' for c in run.call_args_list))

    def test_expired_artifact_is_not_downloaded(self):
        with patch.object(release, 'github', side_effect=[
            {'run_attempt': 2},
            {'artifacts': [{'name': 'release-proof-123-2', 'id': 1, 'expired': True}]},
        ]) as github:
            with self.assertRaisesRegex(ValueError, 'unexpired'):
                release.verified_proof(123, 'b' * 40)
            self.assertEqual(github.call_count, 2)

    def test_dry_run_does_not_submit_and_pins_web_secret_version(self):
        with patch.object(sys, 'argv', ['fast-release.py', '--ci-run', '123', '--services', 'api,web', '--dry-run']), \
             patch.object(release, 'command', side_effect=[
                 '', 'a' * 40, 'b' * 40,
                 'mission-control@app-agentic.iam.gserviceaccount.com',
                 'projects/example/secrets/public-sdk/versions/7',
             ]) as run, \
             patch.object(release, 'verified_proof', return_value={'run_attempt': 2}), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            release.main()
            self.assertNotIn('builds', str(run.call_args_list))
            self.assertIn('WEB_ASSET_VERSION=7', output.getvalue())
            self.assertNotIn('build-worker', output.getvalue())

    def test_web_value_remains_buildkit_secret_and_cache_is_not_release_identity(self):
        config = release.build_config('clipsubtitles-production', 'production', ['api', 'web'], '7')
        web = next(s for s in config['steps'] if s['id'] == 'build-web')
        self.assertIn('id=gleap_sdk_token,env=NEXT_PUBLIC_GLEAP_SDK_TOKEN', web['args'])
        self.assertNotIn('NEXT_PUBLIC_GLEAP_SDK_TOKEN=', ' '.join(web['args']))
        self.assertTrue(config['availableSecrets']['secretManager'][0]['versionName'].endswith('/versions/7'))
        self.assertEqual(len([i for i in config['images'] if i.endswith(':$COMMIT_SHA')]), 2)
        self.assertNotIn('build-api', web['waitFor'])

    def test_worker_reuses_api_build_when_both_selected(self):
        config = release.build_config('clipsubtitles-production', 'production', ['api', 'worker'], None)
        worker = next(s for s in config['steps'] if s['id'] == 'build-worker')
        self.assertIn('build-api', worker['waitFor'])
        self.assertNotIn('availableSecrets', config)


if __name__ == '__main__':
    unittest.main()
