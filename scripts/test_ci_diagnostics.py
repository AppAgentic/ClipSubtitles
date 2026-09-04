import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('diagnostics', Path(__file__).with_name('collect-ci-diagnostics.py'))
diag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)


class DiagnosticsTest(unittest.TestCase):
    def test_trace_keeps_action_and_response_evidence_without_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            trace = source / 'trace.zip'
            with zipfile.ZipFile(trace, 'w') as archive:
                archive.writestr('trace.network', json.dumps({'type': 'resource-snapshot', 'snapshot': {'startedDateTime': '2026-09-04T22:00:00Z', 'request': {'method': 'GET', 'url': 'http://localhost:3100/auth/callback?code=private_code&state=private_state', 'headers': [{'name': 'Cookie', 'value': 'private_cookie'}], 'postData': {'text': 'private_body'}}, 'response': {'status': 302, 'headers': [{'name': 'Set-Cookie', 'value': 'private_session'}]}, 'time': 25}}))
                archive.writestr('trace.trace', json.dumps({'type': 'after', 'callId': 'call@1', 'apiName': 'expect.toBeVisible', 'error': {'message': 'Heading was not found'}}))
                archive.writestr('resources/private.json', '{"access_token":"private_token"}')
            (source / 'error-context.md').write_text('Login failed at http://localhost:3100/auth/callback?state=private_state\nAuthorization: Bearer private_bearer\n')
            (source / 'stack.log').write_text('GET /auth/callback?code=private_code&state=private_state 302\n')
            output = source / 'safe'
            diag.collect(source, output)
            all_text = '\n'.join(path.read_text() for path in output.rglob('*') if path.is_file())
            for secret in ('private_code', 'private_state', 'private_cookie', 'private_body', 'private_session', 'private_token', 'private_bearer'):
                self.assertNotIn(secret, all_text)
            data = json.loads((output / 'trace.zip.summary.json').read_text())
            self.assertEqual(data[0]['status'], 302)
            self.assertEqual(data[0]['url'], 'http://localhost:3100/auth/callback')
            self.assertEqual(data[1]['error'], 'Heading was not found')
            self.assertFalse((output / 'trace.zip').exists())

    def test_text_size_is_bounded_and_symlinks_are_skipped(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            (source / 'stack.log').write_text('x' * (diag.MAX_TEXT + 100))
            (source / 'linked.log').symlink_to(source / 'stack.log')
            output = source / 'safe'
            diag.collect(source, output)
            self.assertLessEqual((output / 'stack.log').stat().st_size, diag.MAX_TEXT)
            self.assertFalse((output / 'linked.log').exists())


if __name__ == '__main__':
    unittest.main()
