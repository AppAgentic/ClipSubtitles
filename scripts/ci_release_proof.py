#!/usr/bin/env python3
"""Receipt for reusing a successful gate against an identical Git tree.

The caller fetches the run and its non-expired artifact from GitHub's authenticated
API. A receipt by itself is not evidence; validate_proof requires that API readback.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

WORKFLOW_PATH = '.github/workflows/paid-traffic-gate.yml'
REPOSITORY = 'AppAgentic/ClipSubtitles'


def _sha(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{40}', value) is not None


def _positive_int(value):
    return type(value) is int and value > 0


def _workflow_path(value):
    if not isinstance(value, str):
        return None
    parts = value.split('@', 1)
    if len(parts) == 2 and not (parts[1].startswith('refs/') or _sha(parts[1])):
        return None
    return parts[0]


def validate_proof(run: dict, proof: dict, expected_tree: str,
                   repository: str = REPOSITORY) -> None:
    """Raise ValueError unless trusted run metadata and the receipt match exactly."""
    def require(condition, message):
        if not condition:
            raise ValueError(message)

    require(isinstance(run, dict) and isinstance(proof, dict), 'Invalid proof or run object')
    require(_sha(expected_tree), 'Invalid expected Git tree')
    require(type(proof.get('schemaVersion')) is int and proof['schemaVersion'] == 1,
            'Unsupported proof schema')
    require(isinstance(run.get('repository'), dict)
            and run['repository'].get('full_name') == repository,
            'Run repository mismatch')
    require(isinstance(run.get('head_repository'), dict)
            and run['head_repository'].get('full_name') == repository,
            'Fork or missing head repository is not trusted')
    require(proof.get('repository') == repository, 'Proof repository mismatch')
    require(_workflow_path(run.get('path')) == WORKFLOW_PATH
            and proof.get('workflow_path') == WORKFLOW_PATH, 'Untrusted workflow')
    require(run.get('status') == 'completed' and run.get('conclusion') == 'success',
            'Release gate has not completed successfully')
    for field, api_field in (('run_id', 'id'), ('run_attempt', 'run_attempt')):
        require(_positive_int(proof.get(field)) and _positive_int(run.get(api_field))
                and proof[field] == run[api_field], f'Proof {field} mismatch')
    require(_sha(run.get('head_sha')) and proof.get('head_sha') == run['head_sha'],
            'Run source commit mismatch')
    require(_sha(proof.get('commit')), 'Invalid tested commit')
    require(_sha(proof.get('tree')) and proof['tree'] == expected_tree,
            'Working tree was not tested by this release gate')


def write_proof(output: Path) -> None:
    """Write only non-secret CI identity and the actual checked-out Git tree."""
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise ValueError('Proof creation requires GitHub Actions')
    repository = os.environ['GITHUB_REPOSITORY']
    if repository != REPOSITORY:
        raise ValueError('Untrusted repository')
    workflow_ref = os.environ['GITHUB_WORKFLOW_REF']
    if not workflow_ref.startswith(repository + '/') or _workflow_path(
            workflow_ref[len(repository) + 1:]) != WORKFLOW_PATH:
        raise ValueError('Untrusted workflow')
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    # pull_request runs test a synthetic merge SHA; the API run's head_sha is
    # the PR head SHA. Preserve both identities instead of conflating them.
    head_sha = (event['pull_request']['head']['sha']
                if os.environ.get('GITHUB_EVENT_NAME') == 'pull_request'
                else os.environ['GITHUB_SHA'])
    git = lambda rev: subprocess.check_output(['git', 'rev-parse', rev], text=True).strip()
    proof = {'schemaVersion': 1, 'repository': repository,
             'run_id': int(os.environ['GITHUB_RUN_ID']),
             'run_attempt': int(os.environ['GITHUB_RUN_ATTEMPT']),
             'workflow_path': WORKFLOW_PATH, 'head_sha': head_sha,
             'commit': git('HEAD'), 'tree': git('HEAD^{tree}')}
    if proof['commit'] != os.environ['GITHUB_SHA']:
        raise ValueError('Checkout does not match this workflow source')
    if not all(_sha(proof[k]) for k in ('head_sha', 'commit', 'tree')):
        raise ValueError('Invalid source identity')
    output.write_text(json.dumps(proof, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('release-proof.json'))
    args = parser.parse_args()
    try:
        write_proof(args.output)
    except (ValueError, KeyError) as exc:
        parser.exit(1, f'Release proof rejected: {exc}\n')
