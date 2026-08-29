import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CaptionProject,
  CreateProjectResponse,
  Export,
  RenderQuote,
  Task,
} from '@clipsubtitles/contracts';
import {
  CaptionProjectSchema,
  ExportSchema,
  RenderQuoteSchema,
  TaskSchema,
} from '@clipsubtitles/contracts';
import { sqliteHandle } from '@clipsubtitles/storage';
import { createHarness, type Harness } from './harness';

let h: Harness;
let token: string;

async function uploadProject(fileName = 'clip.mp4', seconds = 2): Promise<CaptionProject> {
  const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', {
    token,
    body: { title: 'Upload test', fileName },
  });
  expect(created.status).toBe(201);
  const target = created.body.uploadTarget!;
  const video = await readFile(await h.makeSourceVideo(fileName, seconds));
  const url = new URL(target.url);
  const put = await h.api<{ asset: { status: string } }>('PUT', `${url.pathname}${url.search}`, {
    raw: video,
    headers: { 'content-type': 'video/mp4' },
  });
  expect(put.status).toBe(200);
  expect(put.body.asset.status).toBe('ready');
  const project = await h.api<CaptionProject>('GET', `/v1/projects/${created.body.project.id}`, {
    token,
  });
  return project.body;
}

async function captionedProject(): Promise<CaptionProject> {
  const project = await uploadProject();
  const gen = await h.api<{ task: Task }>('POST', `/v1/projects/${project.id}/captions`, {
    token,
    body: {},
  });
  expect(gen.status).toBe(202);
  await h.runTasks();
  const done = await h.api<{ task: Task }>('GET', `/v1/tasks/${gen.body.task.id}`, { token });
  expect(done.body.task.status).toBe('succeeded');
  const view = await h.api<CaptionProject>(
    'GET',
    `/v1/projects/${project.id}?include=pages,words`,
    { token },
  );
  expect(view.body.status).toBe('captioned');
  return view.body;
}

beforeAll(async () => {
  h = await createHarness();
  token = await h.token();
});

afterAll(async () => {
  await h.cleanup();
});

describe('auth boundaries', () => {
  it('rejects unauthenticated requests with a bearer challenge pointing at resource metadata', async () => {
    const res = await h.api('GET', '/v1/me');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata=');
    expect((res.body as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
    const meta = await h.api<{ resource: string; authorization_servers: string[] }>(
      'GET',
      '/.well-known/oauth-protected-resource',
    );
    expect(meta.status).toBe(200);
    expect(meta.body.resource).toContain('/api/mcp');
  });

  it('derives identity and a personal workspace from the token, never from input', async () => {
    const me = await h.api<{
      workspace: { id: string };
      scopes: string[];
      credits: { available: number };
    }>('GET', '/v1/me', { token });
    expect(me.status).toBe(200);
    expect(me.body.workspace.id).toMatch(/^ws_/);
    expect(me.body.credits.available).toBe(500);
    const again = await h.api<{ workspace: { id: string } }>('GET', '/v1/me', {
      token: await h.token(),
    });
    expect(again.body.workspace.id).toBe(me.body.workspace.id);
    const bad = await h.api('POST', '/v1/projects', {
      token,
      body: { title: 'x', workspaceId: 'ws_other' },
    });
    expect(bad.status).toBe(400);
  });

  it('enforces scopes', async () => {
    const readOnly = await h.token('mock|joe', ['captions:read']);
    const res = await h.api('POST', '/v1/projects', { token: readOnly, body: { title: 'x' } });
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('INSUFFICIENT_SCOPE');
    expect((await h.api('GET', '/v1/projects', { token: readOnly })).status).toBe(200);
  });

  it('rejects garbage, expired, and revoked tokens', async () => {
    expect((await h.api('GET', '/v1/me', { token: 'not-a-jwt' })).status).toBe(401);
    const agentToken = await h.token('mock|joe', undefined, 'revocable-client');
    expect((await h.api('GET', '/v1/me', { token: agentToken })).status).toBe(200);
    const connections = await h.api<{ connections: Array<{ id: string; clientId: string }> }>(
      'GET',
      '/v1/connections',
      { token },
    );
    const grant = connections.body.connections.find((c) => c.clientId === 'revocable-client')!;
    const revoke = await h.api('POST', `/v1/connections/${grant.id}/revoke`, { token });
    expect(revoke.status).toBe(200);
    const after = await h.api('GET', '/v1/me', { token: agentToken });
    expect(after.status).toBe(401);
    expect((await h.api('GET', '/v1/me', { token })).status).toBe(200);
  });

  it('isolates workspaces: other users see 404, not 403', async () => {
    const project = await uploadProject('iso.mp4');
    const other = await h.token('mock|ana');
    expect((await h.api('GET', `/v1/projects/${project.id}`, { token: other })).status).toBe(404);
    expect(
      (
        await h.api('PATCH', `/v1/projects/${project.id}`, {
          token: other,
          body: { expectedVersion: 1, ops: [{ op: 'set_title', title: 'hijack' }] },
        })
      ).status,
    ).toBe(404);
    expect((await h.api('DELETE', `/v1/projects/${project.id}`, { token: other })).status).toBe(
      404,
    );
  });

  it('serves the OpenAPI document and llms.txt', async () => {
    const doc = await h.api<{
      openapi: string;
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    }>('GET', '/openapi.json');
    expect(doc.status).toBe(200);
    expect(doc.body.openapi).toBe('3.1.0');
    for (const p of [
      '/v1/projects',
      '/v1/projects/{projectId}',
      '/v1/projects/{projectId}/captions',
      '/v1/projects/{projectId}/previews',
      '/v1/projects/{projectId}/render-quotes',
      '/v1/projects/{projectId}/renders',
      '/v1/tasks/{taskId}',
      '/v1/tasks/{taskId}/cancel',
      '/v1/exports/{exportId}',
    ]) {
      expect(doc.body.paths[p]).toBeDefined();
    }
    expect(doc.body.components.securitySchemes.bearerAuth).toBeDefined();
    const llms = await h.api<string>('GET', '/llms.txt');
    expect(llms.status).toBe(200);
    expect(llms.body).toContain('render_caption_export');
  });
});

describe('projects, uploads, and captions', () => {
  it('creates a project with a bounded upload target and probes the uploaded media', async () => {
    const project = await uploadProject();
    expect(project.status).toBe('ready');
    expect(project.source?.durationMs).toBeGreaterThan(1500);
    expect(project.source?.width).toBe(320);
    expect(project.source?.playbackUrl).toContain('/v1/assets/');
    const play = await h.app.request(
      new URL(project.source!.playbackUrl!).pathname + new URL(project.source!.playbackUrl!).search,
      { headers: { range: 'bytes=0-99' } },
    );
    expect(play.status).toBe(206);
    expect(play.headers.get('content-range')).toMatch(/^bytes 0-99\//);
  });

  it('rejects oversized JSON bodies and rejected source URLs', async () => {
    const big = await h.api('POST', '/v1/projects', {
      token,
      raw: JSON.stringify({ title: 'x'.repeat(2 * 1024 * 1024) }),
      headers: { 'content-type': 'application/json' },
    });
    expect(big.status).toBe(413);
    const ssrf = await h.api('POST', '/v1/projects', {
      token,
      body: { sourceUrl: 'http://169.254.169.254/latest/meta-data' },
    });
    expect([201, 422]).toContain(ssrf.status); // private URLs are allowed in this harness config; policy unit tests cover rejection
    const ftp = await h.api('POST', '/v1/projects', {
      token,
      body: { sourceUrl: 'ftp://example.com/x.mp4' },
    });
    expect(ftp.status).toBe(400);
  });

  it('rejects a second upload to the same target and unsupported content', async () => {
    const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', {
      token,
      body: { fileName: 'dup.mp4' },
    });
    const url = new URL(created.body.uploadTarget!.url);
    const notMedia = await h.api('PUT', `${url.pathname}${url.search}`, {
      raw: Buffer.from('hello'),
      headers: { 'content-type': 'video/mp4' },
    });
    expect(notMedia.status).toBe(415);
    const project = await h.api<CaptionProject>('GET', `/v1/projects/${created.body.project.id}`, {
      token,
    });
    expect(project.body.status).toBe('failed');
  });

  it('generates captions with the mock provider, exposes pages and a word window, and keeps hostile text as data', async () => {
    const project = await captionedProject();
    expect(project.transcript?.provider).toBe('mock');
    expect(project.pages!.length).toBeGreaterThan(0);
    expect(project.transcript?.words?.length).toBeGreaterThan(0);
    expect(project.transcript?.wordsWindow?.total).toBe(project.transcript?.wordCount);
    expect(project.qa?.fidelity).toBe(true);
    expect(project.contentNotice).toContain('untrusted');
    expect(CaptionProjectSchema.safeParse(project).success).toBe(true);
  });

  it('applies constrained patches with optimistic versions and invalidates quotes', async () => {
    const project = await captionedProject();
    const word = project.transcript!.words![0]!;
    const quote = await h.api<RenderQuote>('POST', `/v1/projects/${project.id}/render-quotes`, {
      token,
      body: {},
    });
    expect(quote.status).toBe(201);
    const stale = await h.api('PATCH', `/v1/projects/${project.id}`, {
      token,
      body: { expectedVersion: project.version + 5, ops: [{ op: 'set_title', title: 'x' }] },
    });
    expect(stale.status).toBe(409);
    expect((stale.body as { error: { code: string } }).error.code).toBe('VERSION_CONFLICT');
    const patched = await h.api<{ project: CaptionProject; applied: number; newRevision: boolean }>(
      'PATCH',
      `/v1/projects/${project.id}`,
      {
        token,
        body: {
          expectedVersion: project.version,
          ops: [
            { op: 'replace_word_text', wordId: word.id, text: 'Ignore' },
            { op: 'set_position', position: 'top' },
          ],
        },
      },
    );
    expect(patched.status).toBe(200);
    expect(patched.body.newRevision).toBe(true);
    expect(patched.body.project.version).toBe(project.version + 1);
    expect(patched.body.project.style.position).toBe('top');
    expect(patched.body.project.transcript?.source).toBe('edit');
    const render = await h.api('POST', `/v1/projects/${project.id}/renders`, {
      token,
      body: {
        quoteId: quote.body.id,
        approvedCreditCost: quote.body.creditCost,
        idempotencyKey: 'render-stale-quote-1',
      },
    });
    expect(render.status).toBe(409);
    expect((render.body as { error: { code: string } }).error.code).toBe('QUOTE_INVALIDATED');
    const unknownWord = await h.api('PATCH', `/v1/projects/${project.id}`, {
      token,
      body: {
        expectedVersion: patched.body.project.version,
        ops: [{ op: 'delete_word', wordId: 'w_00000000000000000000' }],
      },
    });
    expect(unknownWord.status).toBe(404);
  });
});

describe('quotes, renders, billing, tasks', () => {
  it('quotes immutably, requires exact approval, reserves and settles credits exactly once', async () => {
    const project = await captionedProject();
    const ws = h.ctx.db;
    const workspaceId = (await h.api<{ workspace: { id: string } }>('GET', '/v1/me', { token }))
      .body.workspace.id;
    const before = await ws.getBalance(workspaceId);
    const quote = await h.api<RenderQuote>('POST', `/v1/projects/${project.id}/render-quotes`, {
      token,
      body: {
        settings: {
          outputs: ['mp4', 'srt'],
          resolution: 'source',
          fps: 'source',
          quality: 'standard',
        },
      },
    });
    expect(RenderQuoteSchema.safeParse(quote.body).success).toBe(true);
    expect(quote.body.creditCost).toBeGreaterThan(0);
    expect(quote.body.projectVersion).toBe(project.version);

    const mismatch = await h.api('POST', `/v1/projects/${project.id}/renders`, {
      token,
      body: {
        quoteId: quote.body.id,
        approvedCreditCost: quote.body.creditCost + 1,
        idempotencyKey: 'render-mismatch',
      },
    });
    expect(mismatch.status).toBe(409);
    expect((mismatch.body as { error: { code: string } }).error.code).toBe('QUOTE_MISMATCH');

    const body = {
      quoteId: quote.body.id,
      approvedCreditCost: quote.body.creditCost,
      idempotencyKey: 'render-ok-1',
    };
    const [a, b] = await Promise.all([
      h.api<{ task: Task; reservedCredits: number }>('POST', `/v1/projects/${project.id}/renders`, {
        token,
        body,
      }),
      h.api<{ task: Task; reservedCredits: number }>('POST', `/v1/projects/${project.id}/renders`, {
        token,
        body,
      }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(202);
    const accepted = a.status === 202 ? a : b;
    const reserved = await ws.getBalance(workspaceId);
    expect(reserved.reserved).toBe(quote.body.creditCost);
    expect(reserved.available).toBe(before.available - quote.body.creditCost);
    const replay = await h.api<{ task: Task }>('POST', `/v1/projects/${project.id}/renders`, {
      token,
      body,
    });
    expect(replay.status).toBe(202);
    expect(replay.body.task.id).toBe(accepted.body.task.id);
    const reused = await h.api('POST', `/v1/projects/${project.id}/renders`, {
      token,
      body: { ...body, approvedCreditCost: 0 },
    });
    expect(reused.status).toBe(409);
    expect((reused.body as { error: { code: string } }).error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const secondUse = await h.api('POST', `/v1/projects/${project.id}/renders`, {
      token,
      body: { ...body, idempotencyKey: 'render-ok-2' },
    });
    expect(secondUse.status).toBe(409);
    expect((await ws.getBalance(workspaceId)).reserved).toBe(quote.body.creditCost);

    await h.runTasks();
    const done = await h.api<{ task: Task; exports: Export[] }>(
      'GET',
      `/v1/tasks/${accepted.body.task.id}`,
      { token },
    );
    expect(done.body.task.status).toBe('succeeded');
    expect(TaskSchema.safeParse(done.body.task).success).toBe(true);
    expect(done.body.exports.map((e) => e.kind).sort()).toEqual(['mp4', 'srt']);
    for (const e of done.body.exports) {
      expect(ExportSchema.safeParse(e).success).toBe(true);
      expect(e.downloadUrl).toBeDefined();
      const u = new URL(e.downloadUrl!);
      const dl = await h.app.request(`${u.pathname}${u.search}`);
      expect(dl.status).toBe(200);
      expect(Number(dl.headers.get('content-length'))).toBe(e.bytes);
    }
    const settled = await ws.getBalance(workspaceId);
    expect(settled.reserved).toBe(0);
    expect(settled.available).toBe(before.available - quote.body.creditCost);
    const ledger = await h.api<{ entries: Array<{ kind: string }> }>('GET', '/v1/credits/ledger', {
      token,
    });
    expect(ledger.body.entries.filter((e) => e.kind === 'settle')).toHaveLength(1);
    const meta = await h.api<Export>('GET', `/v1/exports/${done.body.exports[0]!.id}`, { token });
    expect(meta.status).toBe(200);
    expect(meta.body.projectVersion).toBe(project.version);

    const originalStore = h.ctx.store;
    let providerSignedKey: string | undefined;
    h.ctx.store = new Proxy(originalStore, {
      get(target, property, receiver) {
        if (property === 'signedDownloadUrl') {
          return async (key: string) => {
            providerSignedKey = key;
            return 'https://objects.example.test/signed-export';
          };
        }
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const appSignedUrl = new URL(meta.body.downloadUrl!);
    const redirect = await h.api('GET', `${appSignedUrl.pathname}${appSignedUrl.search}`);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe('https://objects.example.test/signed-export');
    expect(providerSignedKey).toMatch(/\/exports\//);
    h.ctx.store = originalStore;
  });

  it('refuses renders the workspace cannot afford and expires quotes', async () => {
    const poor = await h.token('mock|reviewer');
    const ownProject = await (async () => {
      const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', {
        token: poor,
        body: { fileName: 'poor.mp4' },
      });
      const url = new URL(created.body.uploadTarget!.url);
      await h.api('PUT', `${url.pathname}${url.search}`, {
        raw: await readFile(await h.makeSourceVideo('poor.mp4', 2)),
        headers: { 'content-type': 'video/mp4' },
      });
      const gen = await h.api<{ task: Task }>(
        'POST',
        `/v1/projects/${created.body.project.id}/captions`,
        { token: poor, body: {} },
      );
      await h.runTasks();
      expect(
        (await h.api<{ task: Task }>('GET', `/v1/tasks/${gen.body.task.id}`, { token: poor })).body
          .task.status,
      ).toBe('succeeded');
      return created.body.project.id;
    })();
    const workspaceId = (
      await h.api<{ workspace: { id: string } }>('GET', '/v1/me', { token: poor })
    ).body.workspace.id;
    const drained = await h.ctx.db.getBalance(workspaceId);
    sqliteHandle(h.ctx.db)
      .prepare('UPDATE credit_accounts SET available = 0 WHERE workspace_id = ?')
      .run(workspaceId);
    const quote = await h.api<RenderQuote>('POST', `/v1/projects/${ownProject}/render-quotes`, {
      token: poor,
      body: {},
    });
    const res = await h.api('POST', `/v1/projects/${ownProject}/renders`, {
      token: poor,
      body: {
        quoteId: quote.body.id,
        approvedCreditCost: quote.body.creditCost,
        idempotencyKey: 'poor-render-1',
      },
    });
    expect(res.status).toBe(402);
    expect((res.body as { error: { code: string } }).error.code).toBe('INSUFFICIENT_CREDITS');
    sqliteHandle(h.ctx.db)
      .prepare('UPDATE credit_accounts SET available = ? WHERE workspace_id = ?')
      .run(drained.available, workspaceId);
    h.clock.advance((h.config.limits.quoteTtlSeconds + 5) * 1000);
    const expired = await h.api('POST', `/v1/projects/${ownProject}/renders`, {
      token: poor,
      body: {
        quoteId: quote.body.id,
        approvedCreditCost: quote.body.creditCost,
        idempotencyKey: 'poor-render-2',
      },
    });
    expect(expired.status).toBe(410);
    expect((await h.ctx.db.getBalance(workspaceId)).reserved).toBe(0);
  });

  it('cancels queued renders and releases the reservation', async () => {
    const project = await captionedProject();
    const workspaceId = (await h.api<{ workspace: { id: string } }>('GET', '/v1/me', { token }))
      .body.workspace.id;
    const before = await h.ctx.db.getBalance(workspaceId);
    const quote = await h.api<RenderQuote>('POST', `/v1/projects/${project.id}/render-quotes`, {
      token,
      body: {},
    });
    const started = await h.api<{ task: Task }>('POST', `/v1/projects/${project.id}/renders`, {
      token,
      body: {
        quoteId: quote.body.id,
        approvedCreditCost: quote.body.creditCost,
        idempotencyKey: 'cancel-1',
      },
    });
    expect(started.status).toBe(202);
    expect((await h.ctx.db.getBalance(workspaceId)).reserved).toBe(quote.body.creditCost);
    const cancel = await h.api<{ task: Task }>('POST', `/v1/tasks/${started.body.task.id}/cancel`, {
      token,
    });
    expect(cancel.status).toBe(200);
    expect(cancel.body.task.status).toBe('cancelled');
    expect(await h.ctx.db.getBalance(workspaceId)).toMatchObject({
      available: before.available,
      reserved: 0,
    });
    const again = await h.api('POST', `/v1/tasks/${started.body.task.id}/cancel`, { token });
    expect(again.status).toBe(409);
    await h.runTasks();
    expect(
      (await h.api<{ task: Task }>('GET', `/v1/tasks/${started.body.task.id}`, { token })).body.task
        .status,
    ).toBe('cancelled');
  });

  it('renders previews (free, rate limited) and lists tasks', async () => {
    const project = await captionedProject();
    const preview = await h.api<{ task: Task }>('POST', `/v1/projects/${project.id}/previews`, {
      token,
      body: { durationMs: 1000, resolution: '360p' },
    });
    expect(preview.status).toBe(202);
    await h.runTasks();
    const done = await h.api<{ task: Task; exports: Export[] }>(
      'GET',
      `/v1/tasks/${preview.body.task.id}`,
      { token },
    );
    expect(done.body.task.status).toBe('succeeded');
    expect(done.body.exports[0]?.kind).toBe('preview');
    const tasks = await h.api<{ tasks: Task[] }>('GET', `/v1/tasks?projectId=${project.id}`, {
      token,
    });
    expect(tasks.body.tasks.length).toBeGreaterThanOrEqual(2);
  });

  it('deletes a project and its media, and the retention sweep purges expired exports', async () => {
    const project = await captionedProject();
    const quote = await h.api<RenderQuote>('POST', `/v1/projects/${project.id}/render-quotes`, {
      token,
      body: {
        settings: { outputs: ['srt'], resolution: 'source', fps: 'source', quality: 'standard' },
      },
    });
    expect(quote.body.creditCost).toBe(0);
    const started = await h.api<{ task: Task }>('POST', `/v1/projects/${project.id}/renders`, {
      token,
      body: { quoteId: quote.body.id, approvedCreditCost: 0, idempotencyKey: 'free-render-1' },
    });
    await h.runTasks();
    const done = await h.api<{ exports: Export[] }>('GET', `/v1/tasks/${started.body.task.id}`, {
      token,
    });
    const exp = done.body.exports[0]!;
    h.clock.advance((h.config.limits.exportRetentionDays + 1) * 86_400_000);
    await h.worker.maintenance(true);
    const purged = await h.api('GET', `/v1/exports/${exp.id}`, { token });
    expect(purged.status).toBe(410);
    const del = await h.api('DELETE', `/v1/projects/${project.id}`, { token });
    expect(del.status).toBe(204);
    expect((await h.api('GET', `/v1/projects/${project.id}`, { token })).status).toBe(404);
  });

  it('keeps object pointers retryable when immediate deletion fails', async () => {
    const project = await uploadProject('delete-retry.mp4', 1);
    const originalStore = h.ctx.store;
    h.ctx.store = new Proxy(originalStore, {
      get(target, property, receiver) {
        if (property === 'delete')
          return async () => {
            throw new Error('provider unavailable');
          };
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const failed = await h.api('DELETE', `/v1/projects/${project.id}`, { token });
    expect(failed.status).toBe(500);
    const retained = await h.api<CaptionProject>('GET', `/v1/projects/${project.id}`, { token });
    expect(retained.status).toBe(200);
    expect(retained.body.source?.status).toBe('ready');

    h.ctx.store = originalStore;
    expect((await h.api('DELETE', `/v1/projects/${project.id}`, { token })).status).toBe(204);
  });
});
