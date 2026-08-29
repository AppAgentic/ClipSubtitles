/**
 * REST end-to-end smoke: fixture project -> generate captions -> edit -> quote
 * -> approve -> render -> download, against an in-process API + worker with
 * an isolated temp data directory. Prints a checklist; exits non-zero on failure.
 */
import type { CaptionProject, Export, RenderQuote, Task } from '@clipsubtitles/contracts';
import { createHarness } from '../test/harness';

function check(ok: boolean, label: string): void {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) throw new Error(`smoke failed: ${label}`);
}

async function main(): Promise<void> {
  const h = await createHarness({ LOG_LEVEL: 'warn' });
  try {
    await h.ensureDemoFixture();
    const token = await h.token();
    const me = await h.api<{ workspace: { id: string }; credits: { available: number } }>('GET', '/v1/me', { token });
    check(me.status === 200, `identity + workspace derived from token (${me.body.workspace.id}, ${me.body.credits.available} credits)`);

    const fixture = await h.api<{ project: CaptionProject }>('POST', '/dev/fixtures/clean-en-product-demo/projects', { token });
    check(fixture.status === 201, `fixture project created (${fixture.body.project.id})`);
    const projectId = fixture.body.project.id;

    const gen = await h.api<{ task: Task }>('POST', `/v1/projects/${projectId}/captions`, { token, body: { preset: 'karaoke' } });
    check(gen.status === 202, `generation task accepted (${gen.body.task.id})`);
    await h.runTasks();
    const genTask = await h.api<{ task: Task }>('GET', `/v1/tasks/${gen.body.task.id}`, { token });
    check(genTask.body.task.status === 'succeeded', `generation succeeded via ${genTask.body.task.result?.kind === 'generate_captions' ? genTask.body.task.result.provider : '?'}`);

    const view = await h.api<CaptionProject>('GET', `/v1/projects/${projectId}?include=pages,words&wordsLimit=3`, { token });
    check(view.body.qa?.fidelity === true && (view.body.pageCount ?? 0) > 0, `${view.body.pageCount} caption pages, fidelity ok, first page: "${view.body.pages?.[0]?.text}"`);

    const word = view.body.transcript!.words![0]!;
    const patched = await h.api<{ project: CaptionProject }>('PATCH', `/v1/projects/${projectId}`, { token, body: { expectedVersion: view.body.version, ops: [{ op: 'replace_word_text', wordId: word.id, text: word.text }, { op: 'set_position', position: 'lower-third' }] } });
    check(patched.status === 200 && patched.body.project.version === view.body.version + 1, `patch applied, version ${patched.body.project.version}`);

    const quote = await h.api<RenderQuote>('POST', `/v1/projects/${projectId}/render-quotes`, { token, body: { settings: { outputs: ['mp4', 'overlay', 'srt', 'vtt'], resolution: '720p', fps: 'source', quality: 'standard' } } });
    check(quote.status === 201, `quote ${quote.body.id}: ${quote.body.creditCost} credits, v${quote.body.projectVersion}, expires ${quote.body.expiresAt}`);

    const render = await h.api<{ task: Task }>('POST', `/v1/projects/${projectId}/renders`, { token, body: { quoteId: quote.body.id, approvedCreditCost: quote.body.creditCost, idempotencyKey: `smoke-${Date.now()}` } });
    check(render.status === 202, `render accepted (${render.body.task.id})`);
    const started = Date.now();
    await h.runTasks();
    const done = await h.api<{ task: Task; exports: Export[] }>('GET', `/v1/tasks/${render.body.task.id}`, { token });
    check(done.body.task.status === 'succeeded', `render succeeded in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    for (const e of done.body.exports) {
      const u = new URL(e.downloadUrl!);
      const res = await h.app.request(`${u.pathname}${u.search}`);
      check(res.status === 200 && Number(res.headers.get('content-length')) === e.bytes, `${e.kind.padEnd(8)} ${e.fileName} ${e.bytes} B sha256 ${e.sha256.slice(0, 12)}…`);
    }
    const after = await h.api<{ credits: { available: number; reserved: number } }>('GET', '/v1/me', { token });
    check(after.body.credits.reserved === 0 && after.body.credits.available === me.body.credits.available - quote.body.creditCost, `credits settled exactly once (${after.body.credits.available} left)`);
    console.log('\nREST e2e smoke passed.');
  } finally {
    await h.cleanup();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
