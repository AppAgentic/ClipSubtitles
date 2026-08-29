import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CaptionProject,
  CreateProjectResponse,
  RenderQuote,
  Task,
} from '@clipsubtitles/contracts';
import { sqliteHandle } from '@clipsubtitles/storage';
import { mintLocalToken } from '../auth/tokens';
import type { TaskFailure } from '../worker/errors';
import {
  createGuardedLookup,
  fetchRemoteSource,
  PrivateAddressError,
} from '../worker/handlers/import-source';
import { renderExportHandler } from '../worker/handlers/render';
import { DEFAULT_HANDLERS, TaskWorker } from '../worker/worker';
import { createHarness, type Harness } from './harness';

let h: Harness;
let token: string;

async function uploadedProject(name: string): Promise<CaptionProject> {
  const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', {
    token,
    body: { title: name, fileName: `${name}.mp4` },
  });
  const url = new URL(created.body.uploadTarget!.url);
  const video = await readFile(await h.makeSourceVideo(`${name}.mp4`, 2));
  const put = await h.api('PUT', `${url.pathname}${url.search}`, {
    raw: video,
    headers: { 'content-type': 'video/mp4' },
  });
  expect(put.status).toBe(200);
  return (await h.api<CaptionProject>('GET', `/v1/projects/${created.body.project.id}`, { token }))
    .body;
}

async function captioned(name: string): Promise<CaptionProject> {
  const project = await uploadedProject(name);
  await h.api('POST', `/v1/projects/${project.id}/captions`, { token, body: {} });
  await h.runTasks();
  return (
    await h.api<CaptionProject>('GET', `/v1/projects/${project.id}?include=pages,words`, { token })
  ).body;
}

async function startedRender(
  project: CaptionProject,
  key: string,
): Promise<{ task: Task; quote: RenderQuote }> {
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
  const started = await h.api<{ task: Task }>('POST', `/v1/projects/${project.id}/renders`, {
    token,
    body: {
      quoteId: quote.body.id,
      approvedCreditCost: quote.body.creditCost,
      idempotencyKey: key,
    },
  });
  expect(started.status).toBe(202);
  return { task: started.body.task, quote: quote.body };
}

beforeAll(async () => {
  h = await createHarness();
  token = await h.token();
});

afterAll(async () => {
  await h.cleanup();
});

describe('audit: auth scopes fail closed', () => {
  it('rejects tokens with no recognised scopes instead of granting everything', async () => {
    const mint = (scope: string) =>
      mintLocalToken({
        secret: h.config.auth.localSecret,
        issuer: h.config.apiPublicUrl,
        audience: `${h.config.apiPublicUrl}/api/mcp`,
        subject: 'mock|joe',
        clientId: 'scopeless',
        scopes: [scope as never],
        ttlSeconds: 600,
      });
    const empty = await mintLocalToken({
      secret: h.config.auth.localSecret,
      issuer: h.config.apiPublicUrl,
      audience: `${h.config.apiPublicUrl}/api/mcp`,
      subject: 'mock|joe',
      clientId: 'scopeless',
      scopes: [],
      ttlSeconds: 600,
    });
    const none = await h.api('GET', '/v1/me', { token: empty.token });
    expect(none.status).toBe(403);
    expect((none.body as { error: { code: string } }).error.code).toBe('INSUFFICIENT_SCOPE');
    const unknown = await h.api('GET', '/v1/me', { token: (await mint('admin:everything')).token });
    expect(unknown.status).toBe(403);
    const readOnly = await h.api('GET', '/v1/me', {
      token: await h.token('mock|joe', ['captions:read']),
    });
    expect(readOnly.status).toBe(200);
  });
});

describe('audit: uploads', () => {
  it('returns the persisted upload id in the target', async () => {
    const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', {
      token,
      body: { fileName: 'id.mp4' },
    });
    const me = await h.api<{ workspace: { id: string } }>('GET', '/v1/me', { token });
    expect(
      await h.ctx.db.getUpload(me.body.workspace.id, created.body.uploadTarget!.uploadId),
    ).not.toBeNull();
  });

  it('allows retrying after a failed upload with a fresh target', async () => {
    const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', {
      token,
      body: { fileName: 'retry.mp4' },
    });
    const first = new URL(created.body.uploadTarget!.url);
    const bad = await h.api('PUT', `${first.pathname}${first.search}`, {
      raw: Buffer.from('not a video'),
      headers: { 'content-type': 'video/mp4' },
    });
    expect(bad.status).toBe(415);
    expect(
      (await h.api<CaptionProject>('GET', `/v1/projects/${created.body.project.id}`, { token }))
        .body.status,
    ).toBe('failed');
    const reuse = await h.api('PUT', `${first.pathname}${first.search}`, {
      raw: Buffer.from('again'),
      headers: { 'content-type': 'video/mp4' },
    });
    expect(reuse.status).toBe(409);
    const target = await h.api<{ url: string }>(
      'POST',
      `/v1/projects/${created.body.project.id}/upload-targets`,
      { token },
    );
    expect(target.status).toBe(201);
    const second = new URL(target.body.url);
    const ok = await h.api('PUT', `${second.pathname}${second.search}`, {
      raw: await readFile(await h.makeSourceVideo('retry.mp4', 2)),
      headers: { 'content-type': 'video/mp4' },
    });
    expect(ok.status).toBe(200);
    expect(
      (await h.api<CaptionProject>('GET', `/v1/projects/${created.body.project.id}`, { token }))
        .body.status,
    ).toBe('ready');
  });

  it('claims the upload token before streaming so concurrent PUTs cannot clobber each other', async () => {
    const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', {
      token,
      body: { fileName: 'race.mp4' },
    });
    const url = new URL(created.body.uploadTarget!.url);
    const video = await readFile(await h.makeSourceVideo('race.mp4', 2));
    const [a, b] = await Promise.all([
      h.api('PUT', `${url.pathname}${url.search}`, {
        raw: video,
        headers: { 'content-type': 'video/mp4' },
      }),
      h.api('PUT', `${url.pathname}${url.search}`, {
        raw: video,
        headers: { 'content-type': 'video/mp4' },
      }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const project = await h.api<CaptionProject>('GET', `/v1/projects/${created.body.project.id}`, {
      token,
    });
    expect(project.body.status).toBe('ready');
    expect(project.body.source?.bytes).toBe(video.length);
    const play = new URL(project.body.source!.playbackUrl!);
    const bytes = await h.app.request(`${play.pathname}${play.search}`);
    expect(bytes.status).toBe(200);
    expect(Number(bytes.headers.get('content-length'))).toBe(video.length);
  });

  it('uses the workspace retention setting for source expiry', async () => {
    await h.api('PATCH', '/v1/workspace', { token, body: { retention: { sourceDays: 2 } } });
    const project = await uploadedProject('retention');
    const expires = Date.parse(project.source!.expiresAt!);
    expect(Math.abs(expires - (h.clock.now() + 2 * 86_400_000))).toBeLessThan(60_000);
    await h.api('PATCH', '/v1/workspace', { token, body: { retention: { sourceDays: 30 } } });
  });
});

describe('audit: worker billing and retries', () => {
  it('does not settle credits when the worker no longer owns the task at completion', async () => {
    const project = await captioned('settle');
    const { task } = await startedRender(project, 'audit-settle-1');
    const stealing = new TaskWorker(
      h.ctx,
      {
        workerId: 'worker_settle',
        heartbeatMs: 60_000,
        leaseMs: 60_000,
        pollMs: 5,
        maintenanceEveryMs: 3_600_000,
      },
      {
        ...DEFAULT_HANDLERS,
        render_export: async (ctx, t) => {
          // Another worker takes over mid-flight (e.g. after a lease expiry).
          sqliteHandle(ctx.db)
            .prepare("UPDATE tasks SET lease_owner = 'worker_other' WHERE id = ?")
            .run(t.id);
          return {
            kind: 'render_export',
            projectId: project.id,
            exportIds: [],
            projectVersion: project.version,
            contentHash: project.contentHash,
            creditsCharged: 0,
            reservationId: 'rsv_x',
          };
        },
      },
    );
    expect(await stealing.runOnce()).toBe(true);
    expect((await h.ctx.db.getReservationForTask(task.id))?.status).toBe('reserved');
    expect(
      (
        await h.ctx.db.getTask(
          (await h.api<{ workspace: { id: string } }>('GET', '/v1/me', { token })).body.workspace
            .id,
          task.id,
        )
      )?.status,
    ).toBe('running');
    await stealing.stop();
    // Clean up: cancel via the owning path so later tests are unaffected.
    sqliteHandle(h.ctx.db)
      .prepare(
        "UPDATE tasks SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL WHERE id = ?",
      )
      .run(task.id);
    sqliteHandle(h.ctx.db)
      .prepare("UPDATE credit_reservations SET status = 'released' WHERE task_id = ?")
      .run(task.id);
    const me = await h.api<{ workspace: { id: string } }>('GET', '/v1/me', { token });
    sqliteHandle(h.ctx.db)
      .prepare(
        'UPDATE credit_accounts SET available = available + reserved, reserved = 0 WHERE workspace_id = ?',
      )
      .run(me.body.workspace.id);
  });

  it('releases reservations for cancelled tasks whose lease expired', async () => {
    const project = await captioned('reclaim');
    const me = await h.api<{ workspace: { id: string } }>('GET', '/v1/me', { token });
    const before = await h.ctx.db.getBalance(me.body.workspace.id);
    const { task, quote } = await startedRender(project, 'audit-reclaim-1');
    expect((await h.ctx.db.getBalance(me.body.workspace.id)).reserved).toBe(
      before.reserved + quote.creditCost,
    );
    const claimed = await h.ctx.db.claimNextTask({
      workerId: 'worker_ghost',
      now: h.clock.iso(),
      leaseMs: 1000,
    });
    expect(claimed?.id).toBe(task.id);
    expect(
      (await h.ctx.db.requestCancel(me.body.workspace.id, task.id, h.clock.iso())).outcome,
    ).toBe('cancel_requested');
    h.clock.advance(5_000);
    await h.worker.maintenance(true);
    expect((await h.ctx.db.getTask(me.body.workspace.id, task.id))?.status).toBe('cancelled');
    expect((await h.ctx.db.getReservationForTask(task.id))?.status).toBe('released');
    expect(await h.ctx.db.getBalance(me.body.workspace.id)).toMatchObject({
      available: before.available,
      reserved: before.reserved,
    });
  });

  it('a retried render replaces partial outputs instead of duplicating export rows', async () => {
    const project = await captioned('dedupe');
    const me = await h.api<{ workspace: { id: string } }>('GET', '/v1/me', { token });
    const { task } = await startedRender(project, 'audit-dedupe-1');
    const record = await h.ctx.db.claimNextTask({
      workerId: 'worker_manual',
      now: h.clock.iso(),
      leaseMs: 60_000,
    });
    expect(record?.id).toBe(task.id);
    const tools = {
      signal: new AbortController().signal,
      progress: () => undefined,
      workerId: 'worker_manual',
    };
    await renderExportHandler(h.ctx, record!, tools);
    await renderExportHandler(h.ctx, record!, tools);
    const exports = await h.ctx.db.listExports(me.body.workspace.id, {
      taskId: task.id,
      limit: 50,
    });
    expect(exports).toHaveLength(2);
    expect(exports.map((e) => e.kind).sort()).toEqual(['mp4', 'srt']);
    for (const e of exports) expect(await h.ctx.store.exists(e.storageKey)).toBe(true);
    sqliteHandle(h.ctx.db)
      .prepare("UPDATE tasks SET status = 'cancelled', lease_owner = NULL WHERE id = ?")
      .run(task.id);
    sqliteHandle(h.ctx.db)
      .prepare("UPDATE credit_reservations SET status = 'released' WHERE task_id = ?")
      .run(task.id);
    sqliteHandle(h.ctx.db)
      .prepare(
        'UPDATE credit_accounts SET available = available + reserved, reserved = 0 WHERE workspace_id = ?',
      )
      .run(me.body.workspace.id);
  });

  it('caption generation keeps style edits made while transcription was running', async () => {
    const project = await uploadedProject('concurrent');
    const gen = await h.api<{ task: Task }>('POST', `/v1/projects/${project.id}/captions`, {
      token,
      body: {},
    });
    expect(gen.status).toBe(202);
    const patched = await h.api<{ project: CaptionProject }>(
      'PATCH',
      `/v1/projects/${project.id}`,
      {
        token,
        body: {
          expectedVersion: project.version,
          ops: [
            { op: 'set_position', position: 'top' },
            { op: 'set_title', title: 'Edited during transcription' },
          ],
        },
      },
    );
    expect(patched.status).toBe(200);
    await h.runTasks();
    const after = await h.api<CaptionProject>('GET', `/v1/projects/${project.id}`, { token });
    expect(after.body.status).toBe('captioned');
    expect(after.body.style.position).toBe('top');
    expect(after.body.title).toBe('Edited during transcription');
    expect(after.body.version).toBe(patched.body.project.version + 1);
  });
});

describe('audit: remote import DNS pinning', () => {
  it('guarded lookup rejects private addresses at connect time', async () => {
    const privateLookup = createGuardedLookup(false, async () => [
      { address: '10.0.0.5', family: 4 },
    ]);
    await expect(
      new Promise((resolve, reject) =>
        privateLookup('rebinding.example', { family: 4 } as never, (err, address) =>
          err ? reject(err) : resolve(address),
        ),
      ),
    ).rejects.toBeInstanceOf(PrivateAddressError);
    const publicLookup = createGuardedLookup(false, async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    await expect(
      new Promise((resolve, reject) =>
        publicLookup('example.com', { family: 4 } as never, (err, address) =>
          err ? reject(err) : resolve(address),
        ),
      ),
    ).resolves.toBe('93.184.216.34');
  });

  it('fails the import when a public hostname resolves to a private address, and imports from an allowed local server', async () => {
    const video = await readFile(await h.makeSourceVideo('remote.mp4', 2));
    const server = http.createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { location: '/clip.mp4' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(video.length) });
      res.end(video);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;
    try {
      const rebinding = createGuardedLookup(false, async () => [
        { address: '127.0.0.1', family: 4 },
      ]);
      await expect(
        fetchRemoteSource(
          h.ctx,
          `http://public.example:${port}/clip.mp4`,
          'ws_test/sources/rebind/source.mp4',
          new AbortController().signal,
          rebinding,
        ),
      ).rejects.toMatchObject({ code: 'SOURCE_URL_REJECTED' } satisfies Partial<TaskFailure>);

      const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', {
        token,
        body: { sourceUrl: `http://127.0.0.1:${port}/redirect` },
      });
      expect(created.status).toBe(201);
      expect(created.body.importTask).toBeDefined();
      await h.runTasks();
      const project = await h.api<CaptionProject>(
        'GET',
        `/v1/projects/${created.body.project.id}`,
        { token },
      );
      expect(project.body.status).toBe('ready');
      expect(project.body.source?.bytes).toBe(video.length);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
