#!/usr/bin/env python3
"""Export bounded, credential-free diagnostics from a mock-only browser CI run.

Never copy raw trace ZIPs: their headers, bodies and snapshots contain cookies/state.
"""
import argparse
import json
import os
from pathlib import Path
import re
import urllib.parse
import zipfile

MAX_TEXT = 1_000_000
MAX_FILE = 20_000_000
MAX_TOTAL = 40_000_000
SENSITIVE = re.compile(r'(secret|token|password|authorization|cookie|api.?key)', re.I)
ENV_SECRETS = [value for name, value in os.environ.items() if SENSITIVE.search(name) and len(value) >= 8]


def clean_url(value):
    try:
        parsed = urllib.parse.urlsplit(value)
        host = parsed.hostname or ''
        if parsed.port:
            host += ':' + str(parsed.port)
        return urllib.parse.urlunsplit((parsed.scheme, host, parsed.path, '', ''))
    except ValueError:
        return '[invalid-url]'


def clean_text(value):
    value = str(value)
    for secret in ENV_SECRETS:
        value = value.replace(secret, '[redacted]')
    value = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', value)
    value = re.sub(r'https?://[^\s\"\'<>]+', lambda m: clean_url(m.group()), value)
    value = re.sub(r'(/[\w./%+-]+)\?[^\s\"\'<>]+', r'\1', value)
    value = re.sub(r'(?i)\b(?:Bearer|Basic)\s+[^\s\"\']+', '[redacted-auth]', value)
    value = re.sub(r'(?i)((?:token|secret|password|authorization|cookie|api[_-]?key|state|signature)[\"\']?\s*[:=]\s*)[^\s,;]+', r'\1[redacted]', value)
    # Covers opaque session/signature values even when an upstream logger omitted field names.
    return re.sub(r'(?<![\w])[A-Za-z0-9_-]{24,}(?![\w])', '[opaque-value]', value)


def clean_json(value):
    if isinstance(value, dict):
        return {key: '[redacted]' if SENSITIVE.search(key) or key in ('state', 'signature') else clean_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean_json(item) for item in value]
    return clean_text(value) if isinstance(value, str) else value


def trace_summary(path):
    records = []
    with zipfile.ZipFile(path) as archive:
        for member in archive.infolist():
            if not member.filename.endswith(('.trace', '.network')) or member.file_size > MAX_FILE:
                continue
            for line in archive.read(member).decode('utf-8', errors='replace').splitlines():
                if len(records) >= 10000:
                    return records
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get('type') == 'resource-snapshot':
                    snap = event.get('snapshot', {})
                    request, response = snap.get('request', {}), snap.get('response', {})
                    records.append({'type': 'network', 'time': snap.get('startedDateTime'), 'method': request.get('method'), 'url': clean_url(request.get('url', '')), 'status': response.get('status'), 'durationMs': snap.get('time')})
                elif event.get('type') in ('before', 'after', 'event', 'log'):
                    record = {key: event[key] for key in ('type', 'callId', 'apiName', 'method', 'startTime', 'endTime') if key in event}
                    if event.get('error'):
                        error = event['error']
                        record['error'] = error.get('message', '') if isinstance(error, dict) else str(error)
                    records.append(record)
    return records


def collect(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    used, written = 0, []
    for item in sorted(source.rglob('*')):
        if not item.is_file() or destination in item.parents or item.is_symlink():
            continue
        relative = item.relative_to(source)
        if item.stat().st_size > MAX_FILE or len(written) >= 80:
            continue
        data, suffix = None, ''
        if item.name == 'trace.zip':
            data = json.dumps(clean_json(trace_summary(item)), indent=2).encode()
            suffix = '.summary.json'
        elif item.suffix in ('.log', '.md', '.txt', '.json'):
            with item.open('rb') as handle:
                # Keep the end of stack logs, where the failure occurred.
                if item.suffix == '.log':
                    handle.seek(max(0, item.stat().st_size - MAX_TEXT))
                data = clean_text(handle.read(MAX_TEXT).decode('utf-8', errors='replace')).encode()
        elif item.suffix == '.png' and item.name.startswith('test-failed-'):
            data = item.read_bytes()
        if data is None or used + len(data) > MAX_TOTAL:
            continue
        output = destination / (str(relative) + suffix)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(data)
        written.append(str(relative) + suffix)
        used += len(data)
    (destination / 'manifest.json').write_text(json.dumps({'bytes': used, 'files': written, 'policy': 'Mock CI only. Raw traces, request headers, request/response bodies, HTML snapshots, and URL query values are excluded.'}, indent=2) + '\n')
    return written


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stack-log-only', action='store_true')
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    if os.environ.get('AUTH_MODE') != 'mock':
        raise SystemExit('Diagnostic collection requires AUTH_MODE=mock.')
    if args.stack_log_only:
        args.destination.parent.mkdir(parents=True, exist_ok=True)
        with args.source.open('rb') as handle:
            handle.seek(max(0, args.source.stat().st_size - MAX_TEXT))
            text = clean_text(handle.read(MAX_TEXT).decode('utf-8', errors='replace'))
        args.destination.write_text(text)
    else:
        collect(args.source.resolve(), args.destination.resolve())


if __name__ == '__main__':
    main()
