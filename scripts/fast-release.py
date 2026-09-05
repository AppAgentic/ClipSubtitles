#!/usr/bin/env python3
"""Package an immutable, CI-tested tree without repeating its release gate."""
import argparse
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import zipfile

from ci_release_proof import validate_proof

REPOSITORY = 'AppAgentic/ClipSubtitles'
ROOT = Path(__file__).resolve().parent.parent


def command(args, *, cwd=ROOT, binary=False):
    result = subprocess.check_output(args, cwd=cwd, text=not binary)
    return result if binary else result.strip()


def github(endpoint, *, binary=False):
    result = command(['gh', 'api', endpoint], binary=binary)
    return result if binary else json.loads(result)


def build_config(project, environment, services, asset_version):
    registry = f'europe-west2-docker.pkg.dev/{project}/clipsubtitles'
    steps, images = [], []
    for service in services:
        cache = f'{registry}/{service}:cache-{environment}'
        image = f'{registry}/{service}:$COMMIT_SHA'
        steps.append({
            'id': f'cache-{service}', 'name': 'gcr.io/cloud-builders/docker',
            'entrypoint': 'bash', 'waitFor': ['-'],
            'args': ['-c', f'docker pull {cache} || echo "No usable {service} cache; building cold."'],
        })
        args = ['build', '--platform=linux/amd64', f'--target={service}',
                '--cache-from', cache, '--build-arg', 'BUILDKIT_INLINE_CACHE=1',
                '-t', image, '-t', cache]
        step = {'id': f'build-{service}', 'name': 'gcr.io/cloud-builders/docker',
                'env': ['DOCKER_BUILDKIT=1'], 'args': args,
                'waitFor': [f'cache-{service}']}
        if service == 'worker' and 'api' in services:
            step['waitFor'].append('build-api')
        if service == 'web':
            step['secretEnv'] = ['NEXT_PUBLIC_GLEAP_SDK_TOKEN']
            args.extend(['--secret', 'id=gleap_sdk_token,env=NEXT_PUBLIC_GLEAP_SDK_TOKEN',
                         '--build-arg', 'API_INTERNAL_URL=https://api.clipsubtitles.com',
                         '--build-arg', f'WEB_ASSET_VERSION={asset_version}'])
        args.append('.')
        steps.append(step)
        images.extend([image, cache])
    config = {
        'steps': steps, 'images': images,
        'serviceAccount': f'projects/{project}/serviceAccounts/clipsubtitles-build-'
                          f'{"prod" if environment == "production" else "staging"}@{project}.iam.gserviceaccount.com',
        'options': {'machineType': 'E2_HIGHCPU_8', 'logging': 'CLOUD_LOGGING_ONLY'},
        'timeout': '1200s',
    }
    if 'web' in services:
        config['availableSecrets'] = {'secretManager': [{
            'versionName': f'projects/{project}/secrets/clipsubtitles-{environment}-gleap-sdk-token/versions/{asset_version}',
            'env': 'NEXT_PUBLIC_GLEAP_SDK_TOKEN',
        }]}
    return config


def verified_proof(run_id, tree):
    run = github(f'repos/{REPOSITORY}/actions/runs/{run_id}')
    attempt = run.get('run_attempt')
    artifacts = github(f'repos/{REPOSITORY}/actions/runs/{run_id}/artifacts?per_page=100')
    name = f'release-proof-{run_id}-{attempt}'
    matches = [a for a in artifacts.get('artifacts', []) if a['name'] == name and a.get('expired') is False]
    if len(matches) != 1:
        raise ValueError('Exactly one unexpired release proof from this CI attempt is required. Run the current CI workflow first.')
    archive = github(f'repos/{REPOSITORY}/actions/artifacts/{matches[0]["id"]}/zip', binary=True)
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if z.namelist() != ['release-proof.json'] or z.getinfo('release-proof.json').file_size > 16384:
            raise ValueError('Unexpected release-proof artifact contents.')
        proof = json.loads(z.read('release-proof.json'))
    validate_proof(run, proof, tree, REPOSITORY)
    return proof


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ci-run', required=True, type=int)
    parser.add_argument('--services', default='api,worker,web', help='Comma-separated api,worker,web; explicit selection, default all.')
    parser.add_argument('--dry-run', action='store_true', help='Verify source/CI and print build plan without submitting.')
    parser.add_argument('--receipt', type=Path, help='Write the non-secret CI/build/source receipt here, outside the repo.')
    args = parser.parse_args()
    if args.ci_run <= 0:
        parser.error('--ci-run must be a positive run ID')
    # This fast lane is deliberately scoped to the verified production context.
    environment = 'production'
    services = args.services.split(',')
    if not services or len(set(services)) != len(services) or set(services) - {'api', 'worker', 'web'}:
        parser.error('--services must be a unique subset of api,worker,web')
    # Normalize dependencies so worker can reuse the API build when both are selected.
    services = [s for s in ['api', 'worker', 'web'] if s in services]
    if command(['git', 'status', '--porcelain']):
        raise ValueError('Release packaging requires a clean tracked and untracked worktree.')
    commit = command(['git', 'rev-parse', 'HEAD'])
    tree = command(['git', 'rev-parse', 'HEAD^{tree}'])
    proof = verified_proof(args.ci_run, tree)
    # Never derive a label from operator text: archive and image identity use this exact commit.
    project = f'clipsubtitles-{environment}'
    context = ['--configuration=app-agentic', f'--project={project}', f'--billing-project={project}']
    account = command(['gcloud', 'config', 'get-value', 'account', '--configuration=app-agentic'])
    if account != 'mission-control@app-agentic.iam.gserviceaccount.com':
        raise ValueError('Wrong AppAgentic gcloud account; refusing build submission.')
    asset_version = None
    if 'web' in services:
        version = command(['gcloud', 'secrets', 'versions', 'describe', 'latest',
                           f'--secret=clipsubtitles-{environment}-gleap-sdk-token',
                           '--format=value(name)', *context])
        asset_version = version.rsplit('/', 1)[-1]
        if not asset_version.isdigit():
            raise ValueError('Could not resolve the immutable public web asset secret version.')
    receipt = {'commit': commit, 'tree': tree, 'ciRun': args.ci_run,
               'ciAttempt': proof['run_attempt'], 'environment': environment, 'services': services,
               'webAssetVersion': asset_version}
    config = build_config(project, environment, services, asset_version)
    if args.receipt and args.receipt.resolve().is_relative_to(ROOT):
        raise ValueError('Write the release receipt outside the Git worktree.')
    if args.dry_run:
        print(json.dumps({'verified': receipt, 'buildPlan': config}, indent=2))
        return
    with tempfile.TemporaryDirectory(prefix='clipsubtitles-release-') as temp:
        source = Path(temp) / 'source'
        source.mkdir()
        archived = command(['git', 'archive', '--format=tar', commit], binary=True)
        with tarfile.open(fileobj=io.BytesIO(archived)) as archive:
            archive.extractall(source, filter='data')
        config_path = Path(temp) / 'build.json'
        config_path.write_text(json.dumps(config))
        result = command(['gcloud', 'builds', 'submit', str(source), f'--config={config_path}',
                          f'--ignore-file={source / ".dockerignore"}',
                          f'--substitutions=COMMIT_SHA={commit}',
                          f'--gcs-source-staging-dir=gs://{project}-clipsubtitles-build-source/source',
                          '--async', '--quiet', '--format=json', *context])
        build = json.loads(result)
        receipt['buildId'] = build['id']
    if args.receipt:
        args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt, indent=2))
    print('Packaging submitted. Deploy only after SUCCESS, using the resulting commit-tagged image digests; cache tags are never release targets.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.CalledProcessError, KeyError, zipfile.BadZipFile) as error:
        print(f'Release refused: {error}', file=sys.stderr)
        sys.exit(1)
