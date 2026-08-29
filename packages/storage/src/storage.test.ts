import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SEGMENTATION, defaultStyle } from '@clipsubtitles/core';
import { migrate, openDatabase, type Db } from './db';
import { StorageError } from './errors';
import { FileObjectStore, ObjectKeyError, ObjectTooLargeError } from './object-store';
import { recordAudit, listAudit, findAuditByErrorRef } from './repos/audit';
import { createAsset, createUpload, completeUpload, findUploadByTokenHash, getAsset, listExpiredAssets, markAssetPurged, updateAsset } from './repos/assets';
import { getBalance, grantCredits, listLedger, releaseReservation, reserveCredits, settleReservation } from './repos/credits';
import { createExport, getExport, listExpiredExports, listExports, markExportPurged } from './repos/exports';
import {
  createSession,
  ensureGrant,
  ensureUserWorkspace,
  findActiveSession,
  isTokenRevoked,
  listGrants,
  purgeExpiredRevokedTokens,
  revokeGrant,
  revokeSession,
  revokeToken,
  updateWorkspace,
} from './repos/identity';
import { abortIdempotent, beginIdempotent, completeIdempotent } from './repos/idempotency';
import { commitProjectEdit, createProject, createRevision, getProject, getRevision, listProjects, listRevisions, softDeleteProject, updateProjectMeta } from './repos/projects';
import { consumeQuote, createQuote, effectiveStatus, expireOpenQuotes, getQuote, invalidateOpenQuotes } from './repos/quotes';
import {
  claimNextTask,
  completeTask,
  enqueueTask,
  failTask,
  getTask,
  heartbeatTask,
  listTasks,
  markCancelled,
  reclaimExpiredLeases,
  requestCancel,
  toPublicTask,
} from './repos/tasks';

const T0 = '2026-08-29T10:00:00.000Z';
const plus = (ms: number) => new Date(Date.parse(T0) + ms).toISOString();

let db: Db;
let ws: string;
let otherWs: string;
let userId: string;

function seedProject(workspaceId: string) {
  return createProject(db, {
    workspaceId,
    title: 'Demo',
    status: 'awaiting_source',
    style: defaultStyle(),
    segmentation: DEFAULT_SEGMENTATION,
    contentHash: 'a'.repeat(64),
    now: T0,
  });
}

beforeEach(() => {
  db = openDatabase({ path: ':memory:' });
  const a = ensureUserWorkspace(db, { subject: 'sub-a', email: 'a@example.com', now: T0, initialCredits: 100 });
  const b = ensureUserWorkspace(db, { subject: 'sub-b', now: T0, initialCredits: 0 });
  ws = a.workspace.id;
  otherWs = b.workspace.id;
  userId = a.user.id;
});

describe('migrations', () => {
  it('are idempotent', () => {
    expect(migrate(db)).toBe(0);
  });
});

describe('identity', () => {
  it('maps one subject to one workspace and grants initial credits once', () => {
    const again = ensureUserWorkspace(db, { subject: 'sub-a', now: plus(1000), initialCredits: 100 });
    expect(again.created).toBe(false);
    expect(again.workspace.id).toBe(ws);
    expect(getBalance(db, ws)).toEqual({ workspaceId: ws, available: 100, reserved: 0 });
    expect(listLedger(db, ws)).toHaveLength(1);
    expect(getBalance(db, otherWs).available).toBe(0);
  });

  it('sessions expire and revoke', () => {
    createSession(db, { tokenHash: 'h1', userId, workspaceId: ws, now: T0, expiresAt: plus(3600_000) });
    expect(findActiveSession(db, 'h1', plus(1000))?.workspaceId).toBe(ws);
    expect(findActiveSession(db, 'h1', plus(3600_001))).toBeNull();
    const s = findActiveSession(db, 'h1', plus(1000));
    expect(revokeSession(db, s!.id, plus(2000))).toBe(true);
    expect(findActiveSession(db, 'h1', plus(3000))).toBeNull();
    expect(findActiveSession(db, 'nope', plus(3000))).toBeNull();
  });

  it('grants are per user+client, revocable from the workspace, and token revocations purge', () => {
    const g1 = ensureGrant(db, { userId, workspaceId: ws, clientId: 'chatgpt', scopes: ['captions:read'], now: T0 });
    const g2 = ensureGrant(db, { userId, workspaceId: ws, clientId: 'chatgpt', scopes: ['captions:write'], now: plus(1) });
    expect(g2.id).toBe(g1.id);
    expect(listGrants(db, ws)).toHaveLength(1);
    expect(revokeGrant(db, otherWs, g1.id, plus(2))).toBe(false);
    expect(revokeGrant(db, ws, g1.id, plus(2))).toBe(true);
    expect(ensureGrant(db, { userId, workspaceId: ws, clientId: 'chatgpt', scopes: [], now: plus(3) }).revokedAt).toBeDefined();
    revokeToken(db, 'jti-1', plus(10));
    expect(isTokenRevoked(db, 'jti-1')).toBe(true);
    expect(purgeExpiredRevokedTokens(db, plus(11))).toBe(1);
    expect(isTokenRevoked(db, 'jti-1')).toBe(false);
  });

  it('updates workspace retention', () => {
    const updated = updateWorkspace(db, ws, { retention: { exportDays: 3 } }, plus(1));
    expect(updated.retention).toEqual({ sourceDays: 30, exportDays: 3 });
  });
});

describe('projects', () => {
  it('scopes reads to the workspace and enforces optimistic versions', () => {
    const p = seedProject(ws);
    expect(getProject(db, otherWs, p.id)).toBeNull();
    expect(getProject(db, ws, p.id)?.version).toBe(1);
    const edited = commitProjectEdit(db, { id: p.id, workspaceId: ws, expectedVersion: 1, patch: { title: 'New', contentHash: 'b'.repeat(64) }, now: plus(1) });
    expect(edited.version).toBe(2);
    expect(edited.title).toBe('New');
    expect(() =>
      commitProjectEdit(db, { id: p.id, workspaceId: ws, expectedVersion: 1, patch: { contentHash: 'c'.repeat(64) }, now: plus(2) }),
    ).toThrowError(StorageError);
    expect(() =>
      commitProjectEdit(db, { id: p.id, workspaceId: otherWs, expectedVersion: 2, patch: { contentHash: 'c'.repeat(64) }, now: plus(2) }),
    ).toThrowError(/not found/i);
    // Meta updates do not bump the version.
    const meta = updateProjectMeta(db, p.id, { status: 'ready' }, plus(3));
    expect(meta?.version).toBe(2);
    expect(meta?.status).toBe('ready');
    expect(listProjects(db, ws)).toHaveLength(1);
    expect(softDeleteProject(db, ws, p.id, plus(4))).toBe(true);
    expect(getProject(db, ws, p.id)).toBeNull();
    expect(listProjects(db, ws)).toHaveLength(0);
  });

  it('numbers revisions per project', () => {
    const p = seedProject(ws);
    const words = [{ id: 'w_x', text: 'hi', startMs: 0, endMs: 100 }];
    const r1 = createRevision(db, { projectId: p.id, source: 'generated', provider: 'mock', language: 'en', words, durationMs: 100, now: T0 });
    const r2 = createRevision(db, { projectId: p.id, source: 'edit', provider: 'mock', language: 'en', words, durationMs: 100, parentRevisionId: r1.id, now: plus(1) });
    expect([r1.revisionNumber, r2.revisionNumber]).toEqual([1, 2]);
    expect(getRevision(db, p.id, r2.id)?.parentRevisionId).toBe(r1.id);
    expect(listRevisions(db, p.id)[0]?.id).toBe(r2.id);
    expect(getRevision(db, 'proj_other', r1.id)).toBeNull();
  });
});

describe('assets and uploads', () => {
  it('tracks upload completion once and retention expiry', () => {
    const p = seedProject(ws);
    const asset = createAsset(db, { workspaceId: ws, projectId: p.id, status: 'pending_upload', origin: 'upload', fileName: 'clip.mp4', now: T0 });
    const upload = createUpload(db, { workspaceId: ws, projectId: p.id, assetId: asset.id, tokenHash: 'tok', maxBytes: 10, now: T0, expiresAt: plus(1000) });
    expect(findUploadByTokenHash(db, 'tok')?.id).toBe(upload.id);
    expect(completeUpload(db, upload.id, plus(1))).toBe(true);
    expect(completeUpload(db, upload.id, plus(2))).toBe(false);
    updateAsset(db, asset.id, { status: 'ready', bytes: 5, durationMs: 1000, expiresAt: plus(5000) }, plus(3));
    expect(getAsset(db, ws, asset.id)?.status).toBe('ready');
    expect(getAsset(db, otherWs, asset.id)).toBeNull();
    expect(listExpiredAssets(db, plus(4000))).toHaveLength(0);
    expect(listExpiredAssets(db, plus(6000))).toHaveLength(1);
    expect(markAssetPurged(db, asset.id, plus(6000))).toBe(true);
    expect(markAssetPurged(db, asset.id, plus(6001))).toBe(false);
    expect(getAsset(db, ws, asset.id)?.status).toBe('purged');
  });
});

describe('task queue', () => {
  it('claims, heartbeats, completes, and lists tasks with public projection', () => {
    const p = seedProject(ws);
    const t = enqueueTask(db, { workspaceId: ws, projectId: p.id, kind: 'generate_captions', input: { a: 1 }, now: T0 });
    expect(claimNextTask(db, { workerId: 'w1', now: plus(-1000), leaseMs: 1000 })).toBeNull(); // run_after in future relative to now
    const claimed = claimNextTask(db, { workerId: 'w1', now: T0, leaseMs: 1000 });
    expect(claimed?.id).toBe(t.id);
    expect(claimed?.attempts).toBe(1);
    expect(claimNextTask(db, { workerId: 'w2', now: T0, leaseMs: 1000 })).toBeNull();
    const hb = heartbeatTask(db, { id: t.id, workerId: 'w1', now: plus(500), leaseMs: 1000, progress: 40, stage: 'transcribing' });
    expect(hb).toEqual({ owned: true, cancelRequested: false });
    expect(heartbeatTask(db, { id: t.id, workerId: 'w2', now: plus(500), leaseMs: 1000 }).owned).toBe(false);
    expect(getTask(db, otherWs, t.id)).toBeNull();
    const pub = toPublicTask(getTask(db, ws, t.id)!);
    expect(pub.progress).toBe(40);
    expect((pub as unknown as Record<string, unknown>).leaseOwner).toBeUndefined();
    const done = completeTask(db, {
      id: t.id,
      workerId: 'w1',
      result: { kind: 'generate_captions', projectId: p.id, revisionId: 'rev_x', projectVersion: 2, wordCount: 1, pageCount: 1, provider: 'mock', language: 'en' },
      now: plus(600),
    });
    expect(done?.status).toBe('succeeded');
    expect(completeTask(db, { id: t.id, workerId: 'w1', result: done!.result!, now: plus(700) })).toBeNull();
    expect(listTasks(db, ws, { activeOnly: true })).toHaveLength(0);
    expect(listTasks(db, ws, { projectId: p.id })).toHaveLength(1);
  });

  it('retries retryable failures with backoff until attempts run out', () => {
    const t = enqueueTask(db, { workspaceId: ws, kind: 'render_preview', input: {}, maxAttempts: 2, now: T0 });
    claimNextTask(db, { workerId: 'w1', now: T0, leaseMs: 1000 });
    const first = failTask(db, { id: t.id, workerId: 'w1', error: { code: 'PROVIDER_UNAVAILABLE', message: 'x', retryable: true }, now: plus(1), backoffMs: 500 });
    expect(first.outcome).toBe('requeued');
    expect(claimNextTask(db, { workerId: 'w1', now: plus(100), leaseMs: 1000 })).toBeNull();
    const again = claimNextTask(db, { workerId: 'w1', now: plus(600), leaseMs: 1000 });
    expect(again?.attempts).toBe(2);
    const second = failTask(db, { id: t.id, workerId: 'w1', error: { code: 'PROVIDER_UNAVAILABLE', message: 'x', retryable: true }, now: plus(700) });
    expect(second.outcome).toBe('failed');
    expect(second.task?.status).toBe('failed');
    expect(second.task?.error?.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('non-retryable failures fail immediately', () => {
    const t = enqueueTask(db, { workspaceId: ws, kind: 'render_export', input: {}, now: T0 });
    claimNextTask(db, { workerId: 'w1', now: T0, leaseMs: 1000 });
    const out = failTask(db, { id: t.id, workerId: 'w1', error: { code: 'RENDER_FAILED', message: 'x', retryable: false }, now: plus(1) });
    expect(out.outcome).toBe('failed');
  });

  it('cancels queued tasks immediately and running tasks cooperatively', () => {
    const q = enqueueTask(db, { workspaceId: ws, kind: 'render_export', input: {}, now: T0 });
    expect(requestCancel(db, otherWs, q.id, plus(1)).outcome).toBe('not_found');
    expect(requestCancel(db, ws, q.id, plus(1)).outcome).toBe('cancelled');
    expect(requestCancel(db, ws, q.id, plus(2)).outcome).toBe('not_cancellable');

    const r = enqueueTask(db, { workspaceId: ws, kind: 'render_export', input: {}, now: plus(3) });
    claimNextTask(db, { workerId: 'w1', now: plus(3), leaseMs: 1000 });
    expect(requestCancel(db, ws, r.id, plus(4)).outcome).toBe('cancel_requested');
    expect(heartbeatTask(db, { id: r.id, workerId: 'w1', now: plus(5), leaseMs: 1000 }).cancelRequested).toBe(true);
    expect(markCancelled(db, { id: r.id, workerId: 'w1', now: plus(6) })?.status).toBe('cancelled');
  });

  it('reclaims expired leases (requeue, then fail when out of attempts) and reports cancelled ones', () => {
    const t = enqueueTask(db, { workspaceId: ws, kind: 'generate_captions', input: {}, maxAttempts: 2, now: T0 });
    claimNextTask(db, { workerId: 'w1', now: T0, leaseMs: 1000 });
    expect(reclaimExpiredLeases(db, plus(500))).toEqual({ requeued: [], failed: [], cancelled: [] });
    expect(reclaimExpiredLeases(db, plus(1500))).toEqual({ requeued: [t.id], failed: [], cancelled: [] });
    claimNextTask(db, { workerId: 'w2', now: plus(1600), leaseMs: 1000 });
    expect(reclaimExpiredLeases(db, plus(3000))).toEqual({ requeued: [], failed: [t.id], cancelled: [] });
    expect(getTask(db, ws, t.id)?.error?.code).toBe('INTERNAL');

    const c = enqueueTask(db, { workspaceId: ws, kind: 'render_export', input: {}, now: plus(4000) });
    claimNextTask(db, { workerId: 'w3', now: plus(4000), leaseMs: 1000 });
    requestCancel(db, ws, c.id, plus(4100));
    expect(reclaimExpiredLeases(db, plus(6000))).toEqual({ requeued: [], failed: [], cancelled: [c.id] });
    expect(getTask(db, ws, c.id)?.status).toBe('cancelled');
  });

  it('deduplicates by idempotency key per workspace and kind', () => {
    const a = enqueueTask(db, { workspaceId: ws, kind: 'render_preview', input: {}, idempotencyKey: 'key-1', now: T0 });
    const b = enqueueTask(db, { workspaceId: ws, kind: 'render_preview', input: {}, idempotencyKey: 'key-1', now: plus(1) });
    const c = enqueueTask(db, { workspaceId: otherWs, kind: 'render_preview', input: {}, idempotencyKey: 'key-1', now: plus(1) });
    expect(b.id).toBe(a.id);
    expect(c.id).not.toBe(a.id);
  });
});

describe('quotes', () => {
  function quote(projectId: string, expiresAt = plus(60_000)) {
    return createQuote(db, {
      workspaceId: ws,
      projectId,
      projectVersion: 1,
      contentHash: 'a'.repeat(64),
      settings: { outputs: ['mp4'], resolution: '1080p', fps: 'source', quality: 'standard' },
      expectedOutputs: [],
      durationMs: 10_000,
      billableMinutes: 0.17,
      creditCost: 2,
      priceVersion: 'v1',
      now: T0,
      expiresAt,
    });
  }

  it('consumes exactly once and reports expiry/invalidations', () => {
    const p = seedProject(ws);
    const q = quote(p.id);
    expect(getQuote(db, otherWs, q.id)).toBeNull();
    expect(consumeQuote(db, { workspaceId: ws, id: q.id, taskId: 'task_1', now: plus(1) }).outcome).toBe('consumed');
    expect(consumeQuote(db, { workspaceId: ws, id: q.id, taskId: 'task_2', now: plus(2) }).outcome).toBe('already_consumed');
    const q2 = quote(p.id);
    expect(invalidateOpenQuotes(db, p.id, 'project changed')).toBe(1);
    expect(consumeQuote(db, { workspaceId: ws, id: q2.id, taskId: 'task_3', now: plus(3) }).outcome).toBe('invalidated');
    const q3 = quote(p.id, plus(10));
    expect(effectiveStatus(getQuote(db, ws, q3.id)!, plus(11))).toBe('expired');
    expect(consumeQuote(db, { workspaceId: ws, id: q3.id, taskId: 'task_4', now: plus(11) }).outcome).toBe('expired');
    const q4 = quote(p.id, plus(10));
    expect(expireOpenQuotes(db, plus(20))).toBe(1);
    expect(getQuote(db, ws, q4.id)?.status).toBe('expired');
  });
});

describe('credits', () => {
  it('reserves, settles, and releases exactly once', () => {
    const r1 = reserveCredits(db, { workspaceId: ws, quoteId: 'quote_1', taskId: 'task_1', amount: 30, now: T0 });
    expect(r1.created).toBe(true);
    expect(getBalance(db, ws)).toMatchObject({ available: 70, reserved: 30 });
    const dup = reserveCredits(db, { workspaceId: ws, quoteId: 'quote_1', taskId: 'task_1', amount: 30, now: plus(1) });
    expect(dup.created).toBe(false);
    expect(dup.reservation.id).toBe(r1.reservation.id);
    expect(getBalance(db, ws)).toMatchObject({ available: 70, reserved: 30 });

    const settled = settleReservation(db, { reservationId: r1.reservation.id, actualAmount: 25, now: plus(2) });
    expect(settled.changed).toBe(true);
    expect(getBalance(db, ws)).toMatchObject({ available: 75, reserved: 0 });
    expect(settleReservation(db, { reservationId: r1.reservation.id, now: plus(3) }).changed).toBe(false);
    expect(releaseReservation(db, { reservationId: r1.reservation.id, now: plus(4) }).changed).toBe(false);
    expect(getBalance(db, ws)).toMatchObject({ available: 75, reserved: 0 });

    const r2 = reserveCredits(db, { workspaceId: ws, quoteId: 'quote_2', taskId: 'task_2', amount: 50, now: plus(5) });
    expect(getBalance(db, ws)).toMatchObject({ available: 25, reserved: 50 });
    expect(releaseReservation(db, { reservationId: r2.reservation.id, now: plus(6) }).changed).toBe(true);
    expect(releaseReservation(db, { reservationId: r2.reservation.id, now: plus(7) }).changed).toBe(false);
    expect(() => settleReservation(db, { reservationId: r2.reservation.id, now: plus(8) })).toThrowError(StorageError);
    expect(getBalance(db, ws)).toMatchObject({ available: 75, reserved: 0 });

    expect(() => reserveCredits(db, { workspaceId: ws, quoteId: 'quote_3', taskId: 'task_3', amount: 76, now: plus(9) })).toThrowError(/INSUFFICIENT|credits/i);
    const ledger = listLedger(db, ws);
    expect(ledger.map((e) => e.kind)).toEqual(['release', 'reserve', 'settle', 'reserve', 'grant']);
  });

  it('grants are idempotent by key', () => {
    grantCredits(db, { workspaceId: ws, amount: 10, idempotencyKey: 'topup-1', now: T0 });
    grantCredits(db, { workspaceId: ws, amount: 10, idempotencyKey: 'topup-1', now: plus(1) });
    expect(getBalance(db, ws).available).toBe(110);
  });
});

describe('idempotency keys', () => {
  it('detects new, in-progress, replay, and mismatch', () => {
    const base = { workspaceId: ws, scope: 'renders', key: 'k1', now: T0 };
    expect(beginIdempotent(db, { ...base, fingerprint: 'f1' })).toEqual({ kind: 'new' });
    expect(beginIdempotent(db, { ...base, fingerprint: 'f1' })).toEqual({ kind: 'in_progress' });
    expect(beginIdempotent(db, { ...base, fingerprint: 'f2' })).toEqual({ kind: 'mismatch' });
    completeIdempotent(db, { ...base, statusCode: 202, response: { taskId: 't' } });
    expect(beginIdempotent(db, { ...base, fingerprint: 'f1' })).toEqual({ kind: 'replay', statusCode: 202, response: { taskId: 't' } });
    expect(beginIdempotent(db, { ...base, workspaceId: otherWs, fingerprint: 'f1' })).toEqual({ kind: 'new' });
    abortIdempotent(db, { workspaceId: otherWs, scope: 'renders', key: 'k1' });
    expect(beginIdempotent(db, { ...base, workspaceId: otherWs, fingerprint: 'f1' })).toEqual({ kind: 'new' });
  });
});

describe('exports and audit', () => {
  it('stores exports scoped to the workspace with retention', () => {
    const p = seedProject(ws);
    const e = createExport(db, {
      workspaceId: ws,
      projectId: p.id,
      taskId: 'task_1',
      kind: 'mp4',
      storageKey: `${ws}/exports/x.mp4`,
      fileName: 'x.mp4',
      mimeType: 'video/mp4',
      bytes: 10,
      sha256: 'f'.repeat(64),
      projectVersion: 1,
      contentHash: 'a'.repeat(64),
      expiresAt: plus(1000),
      now: T0,
    });
    expect(getExport(db, otherWs, e.id)).toBeNull();
    expect(listExports(db, ws, { projectId: p.id })).toHaveLength(1);
    expect(listExpiredExports(db, plus(2000))).toHaveLength(1);
    expect(markExportPurged(db, e.id, plus(2000))).toBe(true);
    expect(listExports(db, ws)).toHaveLength(0);
    expect(listExports(db, ws, { includePurged: true })).toHaveLength(1);
  });

  it('records redacted audit events with error refs', () => {
    recordAudit(db, { workspaceId: ws, actorType: 'user', actorId: userId, action: 'project.create', outcome: 'ok', metadata: { projectId: 'proj_x' }, now: T0 });
    recordAudit(db, { workspaceId: ws, actorType: 'agent', action: 'render.start', outcome: 'error', errorRef: 'err_1', now: plus(1) });
    expect(listAudit(db, ws)).toHaveLength(2);
    expect(findAuditByErrorRef(db, 'err_1')?.outcome).toBe('error');
    expect(listAudit(db, otherWs)).toHaveLength(0);
  });
});

describe('FileObjectStore', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'clipsubtitles-store-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('puts, gets, hashes, deletes, and rejects traversal keys', async () => {
    const store = new FileObjectStore(dir);
    const put = await store.put('ws_a/exports/a.txt', 'hello');
    expect(put.bytes).toBe(5);
    expect(put.sha256).toHaveLength(64);
    expect((await store.get('ws_a/exports/a.txt')).toString()).toBe('hello');
    expect(await store.exists('ws_a/exports/a.txt')).toBe(true);
    expect(await store.stat('ws_a/exports/a.txt')).toEqual({ bytes: 5 });
    expect(await store.delete('ws_a/exports/a.txt')).toBe(true);
    expect(await store.delete('ws_a/exports/a.txt')).toBe(false);
    expect(() => store.localPath('../etc/passwd')).toThrowError(ObjectKeyError);
    expect(() => store.localPath('ws_a/../x')).toThrowError(ObjectKeyError);
    expect(() => store.localPath('/abs')).toThrowError(ObjectKeyError);
  });

  it('streams with a hard byte cap', async () => {
    const store = new FileObjectStore(dir);
    const ok = await store.putStream('ws_a/up/ok.bin', Readable.from([Buffer.alloc(4), Buffer.alloc(4)]), { maxBytes: 8 });
    expect(ok.bytes).toBe(8);
    await expect(store.putStream('ws_a/up/big.bin', Readable.from([Buffer.alloc(5), Buffer.alloc(5)]), { maxBytes: 8 })).rejects.toBeInstanceOf(ObjectTooLargeError);
    expect(await store.exists('ws_a/up/big.bin')).toBe(false);
  });
});
