import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CaptionProject,
  CreateProjectResponse,
  Export,
  RenderQuote,
  Task,
} from '@clipsubtitles/contracts';
import { SqliteStore, sqliteHandle, type DataStore, type Db } from '@clipsubtitles/storage';
import { discardOutputsForTaskId, exportPrefix } from '../services/outputs';
import { TaskFailure } from '../worker/errors';
import { TaskWorker } from '../worker/worker';
import { createHarness, type Harness } from './harness';

let h: Harness;
let token: string;
let workspaceId: string;

async function captionedProject(): Promise<CaptionProject> {
  const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', {
    token,
    body: { title: 'Outputs test', fileName: 'clip.mp4' },
  });
  expect(created.status).toBe(201);
  const target = created.body.uploadTarget!;
  const video = await readFile(await h.makeSourceVideo('clip.mp4', 2));
  const url = new URL(target.url);
  const put = await h.api('PUT', `${url.pathname}${url.search}`, {
    raw: video,
    headers: { 'content-type': 'video/mp4' },
  });
  expect(put.status).toBe(200);
  const gen = await h.api<{ task: Task }>(
    'POST',
    `/v1/projects/${created.body.project.id}/captions`,
    { token, body: {} },
  );
  expect(gen.status).toBe(202);
  await h.runTasks();
  const view = await h.api<CaptionProject>('GET', `/v1/projects/${created.body.project.id}`, {
    token,
  });
  expect(view.body.status).toBe('captioned');
  return view.body;
}

async function approvedRender(
  project: CaptionProject,
  idempotencyKey: string,
): Promise<{ taskId: string; cost: number }> {
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
  expect(quote.status).toBe(201);
  const started = await h.api<{ task: Task }>('POST', `/v1/projects/${project.id}/renders`, {
    token,
    body: { quoteId: quote.body.id, approvedCreditCost: quote.body.creditCost, idempotencyKey },
  });
  expect(started.status).toBe(202);
  return { taskId: started.body.task.id, cost: quote.body.creditCost };
}

/** A database handle whose `INSERT INTO exports` statements fail while `armed()` is true. */
function failingExportsDb(db: Db, armed: () => boolean): Db {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql: string) => {
          if (armed() && /INSERT INTO exports/i.test(sql))
            throw new TaskFailure('RENDER_FAILED', 'simulated export row failure', {
              retryable: true,
            });
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  }) as Db;
}

function workerWith(db: DataStore, workerId: string): TaskWorker {
  return new TaskWorker(
    { ...h.ctx, db },
    {
      workerId,
      heartbeatMs: 50,
      leaseMs: 30_000,
      pollMs: 5,
      maintenanceEveryMs: 0,
      retentionEveryMs: 3_600_000,
    },
  );
}

beforeAll(async () => {
  h = await createHarness();
  token = await h.token();
  workspaceId = (await h.api<{ workspace: { id: string } }>('GET', '/v1/me', { token })).body
    .workspace.id;
});

afterAll(async () => {
  await h.cleanup();
});

describe('export publish atomicity', () => {
  it('a failed export-row insert leaves no rows, no blobs, and no charge; the retry publishes exactly once', async () => {
    const project = await captionedProject();
    const before = await h.ctx.db.getBalance(workspaceId);
    const { taskId, cost } = await approvedRender(project, 'atomic-1');
    const prefix = exportPrefix(workspaceId, taskId);

    let armed = true;
    const failing = workerWith(
      new SqliteStore(failingExportsDb(sqliteHandle(h.ctx.db), () => armed)),
      'worker_failing',
    );
    expect(await failing.runOnce()).toBe(true);

    const afterFail = await h.api<{ task: Task; exports?: Export[] }>(
      'GET',
      `/v1/tasks/${taskId}`,
      { token },
    );
    expect(afterFail.body.task.status).not.toBe('succeeded');
    expect(afterFail.body.task.error?.code).toBe('RENDER_FAILED');
    expect(afterFail.body.exports ?? []).toEqual([]);
    expect(await h.ctx.db.listExportsForTaskAll(taskId)).toEqual([]);
    expect(await h.ctx.store.list(prefix)).toEqual([]);
    const mid = await h.ctx.db.getBalance(workspaceId);
    expect(mid).toMatchObject({ available: before.available - cost, reserved: cost });

    armed = false;
    h.clock.advance(10 * 60_000);
    await h.runTasks();
    const done = await h.api<{ task: Task; exports: Export[] }>('GET', `/v1/tasks/${taskId}`, {
      token,
    });
    expect(done.body.task.status).toBe('succeeded');
    expect(done.body.exports.map((e) => e.kind).sort()).toEqual(['mp4', 'srt']);
    expect(await h.ctx.store.list(prefix)).toHaveLength(2);
    for (const e of done.body.exports)
      expect(await h.ctx.store.exists(`${prefix}/${e.fileName}`)).toBe(true);
    expect(await h.ctx.db.getBalance(workspaceId)).toMatchObject({
      available: before.available - cost,
      reserved: 0,
    });
    const ledger = await h.api<{ entries: Array<{ kind: string; taskId?: string }> }>(
      'GET',
      '/v1/credits/ledger',
      { token },
    );
    const mine = ledger.body.entries.filter((e) => e.taskId === taskId);
    expect(mine.filter((e) => e.kind === 'settle')).toHaveLength(1);
    expect(mine.filter((e) => e.kind === 'release')).toHaveLength(0);
  });

  it('a permanent failure after blobs were written discards them and releases the reservation', async () => {
    const project = await captionedProject();
    const before = await h.ctx.db.getBalance(workspaceId);
    const { taskId } = await approvedRender(project, 'atomic-2');
    const prefix = exportPrefix(workspaceId, taskId);

    const permanent = new Proxy(sqliteHandle(h.ctx.db), {
      get(target, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (/INSERT INTO exports/i.test(sql))
              throw new TaskFailure('RENDER_FAILED', 'simulated permanent failure', {
                retryable: false,
              });
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === 'function'
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value;
      },
    }) as Db;
    expect(await workerWith(new SqliteStore(permanent), 'worker_permanent').runOnce()).toBe(true);

    const failed = await h.api<{ task: Task; exports?: Export[] }>('GET', `/v1/tasks/${taskId}`, {
      token,
    });
    expect(failed.body.task.status).toBe('failed');
    expect(await h.ctx.db.listExportsForTaskAll(taskId)).toEqual([]);
    expect(await h.ctx.store.list(prefix)).toEqual([]);
    expect(await h.ctx.db.getBalance(workspaceId)).toMatchObject({
      available: before.available,
      reserved: 0,
    });
  });

  it('discardOutputsForTaskId removes rows and blobs of a render task and ignores other kinds', async () => {
    const project = await captionedProject();
    const { taskId } = await approvedRender(project, 'atomic-3');
    await h.runTasks();
    const prefix = exportPrefix(workspaceId, taskId);
    expect(await h.ctx.db.listExportsForTaskAll(taskId)).toHaveLength(2);
    expect(await h.ctx.store.list(prefix)).toHaveLength(2);

    await discardOutputsForTaskId(h.ctx, 'task_doesnotexist');
    await discardOutputsForTaskId(h.ctx, taskId);
    expect(await h.ctx.db.listExportsForTaskAll(taskId)).toEqual([]);
    expect(await h.ctx.store.list(prefix)).toEqual([]);
  });
});
