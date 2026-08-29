import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreateProjectResponse, Task, UploadTarget } from '@clipsubtitles/contracts';
import {
  FileObjectStore,
  type DirectUploadAuthorization,
  type ObjectStat,
} from '@clipsubtitles/storage';
import { createHarness, type Harness } from './harness';
import { runRetentionSweep } from '../services/retention';
import { directUploadPrefix } from '../services/uploads';

class TestDirectStore extends FileObjectStore {
  snapshotContentTypeOverride: string | undefined;
  failNextMaterialize = false;

  async directUploadAuthorization(
    key: string,
    opts: { contentLength: number; contentType: string },
  ): Promise<DirectUploadAuthorization> {
    return {
      url: `https://r2.invalid/${key}?bytes=${opts.contentLength}`,
      headers: { 'content-type': opts.contentType },
    };
  }

  override async stat(key: string): Promise<ObjectStat | null> {
    const object = await super.stat(key);
    if (!object) return null;
    return {
      ...object,
      contentType:
        key.includes('/verify-') && this.snapshotContentTypeOverride
          ? this.snapshotContentTypeOverride
          : 'video/mp4',
    };
  }

  override async materialize(key: string): Promise<string> {
    if (this.failNextMaterialize) {
      this.failNextMaterialize = false;
      throw new Error('simulated object-store download failure');
    }
    return super.materialize(key);
  }
}

let h: Harness;
let token: string;
let store: TestDirectStore;

beforeAll(async () => {
  h = await createHarness();
  token = await h.token();
  store = new TestDirectStore(path.join(h.dir, 'direct-objects'));
  h.ctx.store = store;
});

afterAll(async () => h.cleanup());

async function projectAndTarget(
  opts: { sha256?: string; subjectToken?: string } = {},
): Promise<{ projectId: string; target: Extract<UploadTarget, { transport: 'direct' }>; sourcePath: string; source: Buffer }> {
  const subjectToken = opts.subjectToken ?? token;
  const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', {
    token: subjectToken,
    body: { fileName: 'source.mp4' },
  });
  const sourcePath = await h.makeSourceVideo(`direct-${created.body.project.id}.mp4`, 2);
  const source = await readFile(sourcePath);
  const response = await h.api<UploadTarget>(
    'POST',
    `/v1/projects/${created.body.project.id}/direct-upload-targets`,
    {
      token: subjectToken,
      body: {
        bytes: source.length,
        mimeType: 'video/mp4',
        ...(opts.sha256 ? { sha256: opts.sha256 } : {}),
      },
    },
  );
  expect(response.status).toBe(201);
  expect(response.body.transport).toBe('direct');
  return {
    projectId: created.body.project.id,
    target: response.body as Extract<UploadTarget, { transport: 'direct' }>,
    sourcePath,
    source,
  };
}

describe('hardened direct upload flow', () => {
  it('returns the direct target from project creation without leaving an unused proxy upload', async () => {
    const sourcePath = await h.makeSourceVideo('initial-direct.mp4', 1);
    const source = await readFile(sourcePath);
    const created = await h.api<CreateProjectResponse>('POST', '/v1/projects', {
      token,
      body: {
        fileName: 'initial-direct.mp4',
        upload: { bytes: source.length, mimeType: 'video/mp4' },
      },
    });

    expect(created.status).toBe(201);
    expect(created.body.uploadTarget?.transport).toBe('direct');
    const uploads = await h.ctx.db.listUploadsForProject(created.body.project.id);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.id).toBe(created.body.uploadTarget?.uploadId);
  });

  it('snapshots before completion, is idempotent, and ignores late signed-URL overwrites', async () => {
    const { projectId, target, sourcePath, source } = await projectAndTarget();
    const initialProject = await h.ctx.db.getProjectById(projectId);
    const upload = await h.ctx.db.getUpload(initialProject!.workspaceId, target.uploadId);
    expect(upload?.storageKey).toBe(
      `${directUploadPrefix(initialProject!.workspaceId, target.uploadId)}/incoming.mp4`,
    );
    await store.putFile(upload!.storageKey!, sourcePath, { contentType: 'video/mp4' });

    const completed = await h.api<{ task: Task }>(
      'POST',
      `/v1/projects/${projectId}/uploads/${target.uploadId}/complete`,
      { token, body: {} },
    );
    expect(completed.status).toBe(202);
    const duplicate = await h.api<{ task: Task }>(
      'POST',
      `/v1/projects/${projectId}/uploads/${target.uploadId}/complete`,
      { token, body: {} },
    );
    expect(duplicate.body.task.id).toBe(completed.body.task.id);

    // The bearer URL can still be reused until expiry, but it only mutates the
    // staging key. The worker consumes the already-created random snapshot.
    await store.put(upload!.storageKey!, Buffer.alloc(source.length, 0x61));
    expect(await h.runTasks()).toBeGreaterThan(0);
    const task = await h.api<{ task: Task }>('GET', `/v1/tasks/${completed.body.task.id}`, { token });
    expect(task.body.task.status).toBe('succeeded');
    const project = await h.ctx.db.getProjectById(projectId);
    const asset = await h.ctx.db.getAssetById(project!.sourceAssetId!);
    expect(asset?.status).toBe('ready');
    expect(asset?.sha256).toBe(createHash('sha256').update(source).digest('hex'));
    expect(await store.list(directUploadPrefix(asset!.workspaceId, target.uploadId))).toEqual([]);
  });

  it('rejects wrong stored size and cross-workspace completion', async () => {
    const { projectId, target } = await projectAndTarget();
    const project = await h.ctx.db.getProjectById(projectId);
    const upload = await h.ctx.db.getUpload(project!.workspaceId, target.uploadId);
    await store.put(upload!.storageKey!, Buffer.from('too short'));
    const wrongSize = await h.api(
      'POST',
      `/v1/projects/${projectId}/uploads/${target.uploadId}/complete`,
      { token, body: {} },
    );
    expect(wrongSize.status).toBe(413);

    const other = await h.token('mock|other');
    const hidden = await h.api(
      'POST',
      `/v1/projects/${projectId}/uploads/${target.uploadId}/complete`,
      { token: other, body: {} },
    );
    expect(hidden.status).toBe(404);
  });

  it('rejects a snapshot whose copied metadata differs from the authorized object', async () => {
    const { projectId, target, sourcePath } = await projectAndTarget();
    const project = await h.ctx.db.getProjectById(projectId);
    const upload = await h.ctx.db.getUpload(project!.workspaceId, target.uploadId);
    await store.putFile(upload!.storageKey!, sourcePath, { contentType: 'video/mp4' });
    store.snapshotContentTypeOverride = 'application/octet-stream';
    try {
      const completed = await h.api(
        'POST',
        `/v1/projects/${projectId}/uploads/${target.uploadId}/complete`,
        { token, body: {} },
      );
      expect(completed.status).toBe(415);
      expect(await store.list(directUploadPrefix(project!.workspaceId, target.uploadId))).toEqual([
        upload!.storageKey,
      ]);
    } finally {
      store.snapshotContentTypeOverride = undefined;
    }
  });

  it('atomically accepts only one of two competing upload targets for an asset', async () => {
    const { projectId, target: first, sourcePath, source } = await projectAndTarget();
    const secondResponse = await h.api<UploadTarget>(
      'POST',
      `/v1/projects/${projectId}/direct-upload-targets`,
      { token, body: { bytes: source.length, mimeType: 'video/mp4' } },
    );
    const second = secondResponse.body as Extract<UploadTarget, { transport: 'direct' }>;
    const project = await h.ctx.db.getProjectById(projectId);
    const firstUpload = await h.ctx.db.getUpload(project!.workspaceId, first.uploadId);
    const secondUpload = await h.ctx.db.getUpload(project!.workspaceId, second.uploadId);
    await Promise.all([
      store.putFile(firstUpload!.storageKey!, sourcePath, { contentType: 'video/mp4' }),
      store.putFile(secondUpload!.storageKey!, sourcePath, { contentType: 'video/mp4' }),
    ]);

    const completions = await Promise.all([
      h.api('POST', `/v1/projects/${projectId}/uploads/${first.uploadId}/complete`, {
        token,
        body: {},
      }),
      h.api('POST', `/v1/projects/${projectId}/uploads/${second.uploadId}/complete`, {
        token,
        body: {},
      }),
    ]);
    expect(completions.map((result) => result.status).sort()).toEqual([202, 409]);
    const tasks = await h.ctx.db.listTasks(project!.workspaceId, { projectId });
    expect(tasks.filter((task) => task.kind === 'finalize_upload')).toHaveLength(1);
  });

  it('treats concurrent completion calls for the same target as one accepted task', async () => {
    const { projectId, target, sourcePath } = await projectAndTarget();
    const project = await h.ctx.db.getProjectById(projectId);
    const upload = await h.ctx.db.getUpload(project!.workspaceId, target.uploadId);
    await store.putFile(upload!.storageKey!, sourcePath, { contentType: 'video/mp4' });

    const completions = await Promise.all([
      h.api<{ task: Task }>(
        'POST',
        `/v1/projects/${projectId}/uploads/${target.uploadId}/complete`,
        { token, body: {} },
      ),
      h.api<{ task: Task }>(
        'POST',
        `/v1/projects/${projectId}/uploads/${target.uploadId}/complete`,
        { token, body: {} },
      ),
    ]);
    expect(completions.map((result) => result.status)).toEqual([202, 202]);
    expect(new Set(completions.map((result) => result.body.task.id)).size).toBe(1);
  });

  it('caps outstanding direct targets for one project', async () => {
    const { projectId, source } = await projectAndTarget();
    const create = () =>
      h.api<UploadTarget>('POST', `/v1/projects/${projectId}/direct-upload-targets`, {
        token,
        body: { bytes: source.length, mimeType: 'video/mp4' },
      });
    expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(409);
  });

  it('fails closed and deletes staging when the expected checksum differs', async () => {
    const { projectId, target, sourcePath } = await projectAndTarget({ sha256: '0'.repeat(64) });
    const project = await h.ctx.db.getProjectById(projectId);
    const upload = await h.ctx.db.getUpload(project!.workspaceId, target.uploadId);
    await store.putFile(upload!.storageKey!, sourcePath, { contentType: 'video/mp4' });
    const completed = await h.api<{ task: Task }>(
      'POST',
      `/v1/projects/${projectId}/uploads/${target.uploadId}/complete`,
      { token, body: {} },
    );
    await h.runTasks();
    const task = await h.api<{ task: Task }>('GET', `/v1/tasks/${completed.body.task.id}`, { token });
    expect(task.body.task.status).toBe('failed');
    expect(task.body.task.error?.code).toBe('UNSUPPORTED_MEDIA');
    expect(await store.list(directUploadPrefix(project!.workspaceId, target.uploadId))).toEqual([]);
    expect((await h.ctx.db.getProjectById(projectId))?.status).toBe('failed');
  });

  it('cleans staging and fails the asset when verification materialization fails', async () => {
    const { projectId, target, sourcePath } = await projectAndTarget();
    const project = await h.ctx.db.getProjectById(projectId);
    const upload = await h.ctx.db.getUpload(project!.workspaceId, target.uploadId);
    await store.putFile(upload!.storageKey!, sourcePath, { contentType: 'video/mp4' });
    const completed = await h.api<{ task: Task }>(
      'POST',
      `/v1/projects/${projectId}/uploads/${target.uploadId}/complete`,
      { token, body: {} },
    );
    store.failNextMaterialize = true;
    await h.runTasks();
    const task = await h.api<{ task: Task }>('GET', `/v1/tasks/${completed.body.task.id}`, { token });
    expect(task.body.task.status).toBe('failed');
    expect(await store.list(directUploadPrefix(project!.workspaceId, target.uploadId))).toEqual([]);
    expect((await h.ctx.db.getAssetById(upload!.assetId))?.status).toBe('failed');
  });

  it('removes abandoned direct-upload staging when the project is deleted', async () => {
    const { projectId, target, sourcePath } = await projectAndTarget();
    const project = await h.ctx.db.getProjectById(projectId);
    const upload = await h.ctx.db.getUpload(project!.workspaceId, target.uploadId);
    await store.putFile(upload!.storageKey!, sourcePath, { contentType: 'video/mp4' });
    expect(await store.list(directUploadPrefix(project!.workspaceId, target.uploadId))).toHaveLength(1);
    expect((await h.api('DELETE', `/v1/projects/${projectId}`, { token })).status).toBe(204);
    expect(await store.list(directUploadPrefix(project!.workspaceId, target.uploadId))).toEqual([]);
    expect((await h.ctx.db.getUpload(project!.workspaceId, target.uploadId))?.purgedAt).toBeTruthy();
  });

  it('sweeps an abandoned staging object after its authorization expires', async () => {
    const { projectId, target, sourcePath } = await projectAndTarget();
    const project = await h.ctx.db.getProjectById(projectId);
    const upload = await h.ctx.db.getUpload(project!.workspaceId, target.uploadId);
    await store.putFile(upload!.storageKey!, sourcePath, { contentType: 'video/mp4' });
    h.clock.advance(16 * 60_000);
    const swept = await runRetentionSweep(h.ctx);
    expect(swept.purgedUploads).toBeGreaterThanOrEqual(1);
    expect(await store.list(directUploadPrefix(project!.workspaceId, target.uploadId))).toEqual([]);
  });
});
