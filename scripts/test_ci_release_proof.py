#!/usr/bin/env python3
"""Offline, fail-closed checks for CI release receipts."""
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from ci_release_proof import REPOSITORY, WORKFLOW_PATH, validate_proof, write_proof


class ReleaseProofTests(unittest.TestCase):
    def setUp(self):
        self.tree = 'a' * 40
        self.head = 'b' * 40
        self.commit = 'c' * 40
        self.run = {'id': 123, 'run_attempt': 2, 'path': WORKFLOW_PATH,
                    'repository': {'full_name': REPOSITORY},
                    'head_repository': {'full_name': REPOSITORY},
                    'status': 'completed', 'conclusion': 'success',
                    'head_sha': self.head}
        self.proof = {'schemaVersion': 1, 'repository': REPOSITORY,
                      'run_id': 123, 'run_attempt': 2, 'workflow_path': WORKFLOW_PATH,
                      'head_sha': self.head, 'commit': self.commit, 'tree': self.tree}

    def test_accepts_identical_tree_from_different_merge_commit(self):
        validate_proof(self.run, self.proof, self.tree)

    def test_accepts_workflow_reference_suffix(self):
        self.run['path'] += '@refs/heads/main'
        validate_proof(self.run, self.proof, self.tree)

    def test_rejects_untrusted_or_missing_repository(self):
        for field in ('repository', 'head_repository'):
            for value in ({'full_name': 'attacker/ClipSubtitles'}, None, {}):
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    validate_proof(dict(self.run, **{field: value}), self.proof, self.tree)

    def test_rejects_unsuccessful_and_incomplete_runs(self):
        for status, conclusion in [('in_progress', None), ('queued', None),
                                   ('completed', 'failure'), ('completed', 'cancelled'),
                                   ('completed', 'skipped'), ('in_progress', 'success')]:
            with self.subTest(status=status, conclusion=conclusion), self.assertRaises(ValueError):
                validate_proof(dict(self.run, status=status, conclusion=conclusion),
                               self.proof, self.tree)

    def test_rejects_receipt_mismatches(self):
        values = {'schemaVersion': [None, True, 2], 'repository': ['attacker/repo'],
                  'run_id': [124, '123', True, None], 'run_attempt': [1, '2', False],
                  'workflow_path': ['.github/workflows/other.yml'],
                  'head_sha': ['d' * 40, None], 'commit': ['', 'not-a-commit'],
                  'tree': ['d' * 40, None]}
        for field, cases in values.items():
            for value in cases:
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    validate_proof(self.run, dict(self.proof, **{field: value}), self.tree)

    def test_rejects_workflow_confusion(self):
        for path in ['other.yml', WORKFLOW_PATH + '.other', WORKFLOW_PATH + '@junk', None]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                validate_proof(dict(self.run, path=path), self.proof, self.tree)

    def test_rejects_missing_fields(self):
        for source in ('proof', 'run'):
            for field in getattr(self, source):
                with self.subTest(source=source, field=field), self.assertRaises(ValueError):
                    run, proof = copy.deepcopy(self.run), copy.deepcopy(self.proof)
                    del (run if source == 'run' else proof)[field]
                    validate_proof(run, proof, self.tree)

    def test_rejects_invalid_expected_tree_and_non_objects(self):
        for run, proof, tree in [(None, self.proof, self.tree), (self.run, [], self.tree),
                                 (self.run, self.proof, 'HEAD')]:
            with self.assertRaises(ValueError):
                validate_proof(run, proof, tree)

    def test_writes_checkout_tree_and_separate_pr_head(self):
        with tempfile.TemporaryDirectory() as directory:
            event_path = Path(directory) / 'event.json'
            output = Path(directory) / 'proof.json'
            event_path.write_text(json.dumps({'pull_request': {'head': {'sha': self.head}}}))
            env = {'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': REPOSITORY,
                   'GITHUB_WORKFLOW_REF': REPOSITORY + '/' + WORKFLOW_PATH + '@refs/pull/4/merge',
                   'GITHUB_EVENT_PATH': str(event_path), 'GITHUB_EVENT_NAME': 'pull_request',
                   'GITHUB_SHA': self.commit, 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '2',
                   'UNRELATED_SECRET': 'must-never-appear'}
            with patch.dict(os.environ, env, clear=True), patch(
                    'ci_release_proof.subprocess.check_output', side_effect=[self.commit, self.tree]):
                write_proof(output)
            self.assertEqual(json.loads(output.read_text()), self.proof)
            self.assertNotIn('must-never-appear', output.read_text())
            validate_proof(self.run, json.loads(output.read_text()), self.tree)

    def test_refuses_local_receipt_creation(self):
        with patch.dict(os.environ, {}, clear=True), self.assertRaises(ValueError):
            write_proof(Path('/unused'))


if __name__ == '__main__':
    unittest.main()
