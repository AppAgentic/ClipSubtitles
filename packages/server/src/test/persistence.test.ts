import { readFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CaptionProject, CreateProjectResponse, Task } from '@clipsubtitles/contracts';
import type { Db } from '@clipsubtitles/storage';
import { createApp } from '../http/app';
import { TaskWorker } from '../worker/worker';
import { createHarness, type Harness } from './harness';

let h: Harness;
let token: string;
let workspaceId: string;

/** Index of the bound parameter for `column = ?` in a SET list, or -1. */
function paramIndex(sql: string, column: string): number {
  const at = sql.indexOf(`${column} = ?`);
  return at < 0 ? -1 : sql.slice(0, at).split('?').length - 1;
}

/**
 * A database handle where the first asset write after a blob is stored fails:
 * `updateAsset` rewrites every column, so the failing statement is recognised
 * by its bound values — status still `importing` with a non-null storage key.
 * The later `status = 'failed'` write (storage key null) goes through.
 */
function failingStorageKeyDb(db: Db): Db {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql: string) => {
          const stmt = target.prepare(sql);
          if (!/UPDATE source_assets/i.test(sql)) return stmt;
          const statusAt = paramIndex(sql, 'status');
          const keyAt = paramIndex(sql, 'storage_key');
          return {
            run: (...params: unknown[]) => {
              if (statusAt >= 0 && keyAt >= 0 && params[statusAt] === 'importing' && params[keyAt] !== null && params[keyAt] !== undefined) {
                throw new Error('simulated database failure after object-store write');
              }
              return (stmt.run as (...a: unknown[]) => unknown)(...params);
            },
            get: (...params: unknown[]) => (stmt.get as (...a: unknown[]) => unknown)(...params),
            all: (...params: unknown[]) => (stmt.all as (...a: unknown[]) => unknown)(...params),
          };
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  }) as Db;
}

async function createUploadTarget(): Promise<{ projectId: string; path: string }> {
  const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', { token, body: { title: 'Persistence', fileName: 'clip.mp4' } });
  expect(created.status).toBe(201);
  const url = new URL(created.body.uploadTarget!.url);
  return { projectId: created.body.project.id, path: `${url.pathname}${url.search}` };
}

async function projectStatus(projectId: string): Promise<string> {
  return (await h.api<CaptionProject>('GET', `/v1/projects/${projectId}`, { token })).body.status;
}

beforeAll(async () => {
  h = await createHarness();
  token = await h.token();
  workspaceId = (await h.api<{ workspace: { id: string } }>('GET', '/v1/me', { token })).body.workspace.id;
});

afterAll(async () => {
  await h.cleanup();
});

describe('source blobs never outlive a failed asset', () => {
  it('an upload that cannot be probed leaves no blob behind', async () => {
    const { projectId, path } = await createUploadTarget();
    const res = await h.api('PUT', path, { raw: Buffer.from('definitely not a video'), headers: { 'content-type': 'video/mp4' } });
    expect(res.status).toBe(415);
    expect(await h.ctx.store.list(workspaceId)).toEqual([]);
    expect(await projectStatus(projectId)).toBe('failed');
  });

  it('a database failure after the upload blob is stored deletes the blob and fails the asset', async () => {
    const { projectId, path } = await createUploadTarget();
    const video = await readFile(await h.makeSourceVideo('good.mp4', 2));
    const app = createApp({ ...h.ctx, db: failingStorageKeyDb(h.ctx.db) });
    const res = await app.request(path, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: video });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await h.ctx.store.list(workspaceId)).toEqual([]);
    expect(await projectStatus(projectId)).toBe('failed');
  });

  it('a database failure after a remote import is fetched deletes the blob and fails the task', async () => {
    const video = await readFile(await h.makeSourceVideo('remote.mp4', 2));
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': video.length });
      res.end(video);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;
    try {
      const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', { token, body: { title: 'Import', sourceUrl: `http://127.0.0.1:${port}/clip.mp4` } });
      expect(created.status).toBe(201);
      const taskId = created.body.importTask!.id;
      const failing = new TaskWorker({ ...h.ctx, db: failingStorageKeyDb(h.ctx.db) }, { workerId: 'worker_failing', heartbeatMs: 50, leaseMs: 30_000, pollMs: 5, maintenanceEveryMs: 0, retentionEveryMs: 3_600_000 });
      expect(await failing.runOnce()).toBe(true);
      const task = await h.api<{ task: Task }>('GET', `/v1/tasks/${taskId}`, { token });
      expect(task.body.task.status).toBe('failed');
      expect(await h.ctx.store.list(workspaceId)).toEqual([]);
      expect(await projectStatus(created.body.project.id)).toBe('failed');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('control: a healthy upload stores exactly one source blob', async () => {
    const { projectId, path } = await createUploadTarget();
    const video = await readFile(await h.makeSourceVideo('ok.mp4', 2));
    const res = await h.api('PUT', path, { raw: video, headers: { 'content-type': 'video/mp4' } });
    expect(res.status).toBe(200);
    expect(await projectStatus(projectId)).toBe('ready');
    const keys = await h.ctx.store.list(workspaceId);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(new RegExp(`^${workspaceId}/`));
  });
});
