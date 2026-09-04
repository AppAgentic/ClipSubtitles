import { AsyncLocalStorage } from 'node:async_hooks';
import { openDatabase, type Db, type OpenDatabaseOptions } from './db';
import * as assets from './repos/assets';
import * as admin from './repos/admin';
import * as audit from './repos/audit';
import * as billing from './repos/billing';
import * as credits from './repos/credits';
import * as exportsRepo from './repos/exports';
import * as idempotency from './repos/idempotency';
import * as identity from './repos/identity';
import * as projects from './repos/projects';
import * as quotes from './repos/quotes';
import * as tasks from './repos/tasks';
import type { DataStore } from './store';

/**
 * Local/test adapter over `node:sqlite`.
 *
 * `node:sqlite` is synchronous on a single connection, so a transaction that
 * stayed open across an `await` could otherwise swallow unrelated statements
 * from another async context. Every operation therefore runs through one
 * FIFO mutex; work started *inside* a transaction bypasses it because it
 * already holds the lock. The observable behaviour matches the previous
 * synchronous repositories: statements never interleave.
 */
export class SqliteStore implements DataStore {
  readonly driver = 'sqlite' as const;
  /** The underlying handle. Tests use it for raw SQL and fault injection. */
  readonly raw: Db;
  private readonly inTransaction = new AsyncLocalStorage<true>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(db: Db) {
    this.raw = db;
  }

  static open(opts: OpenDatabaseOptions): SqliteStore {
    return new SqliteStore(openDatabase(opts));
  }

  /** Serialize against any open transaction unless we are already inside one. */
  private run<T>(fn: (db: Db) => T): Promise<T> {
    if (this.inTransaction.getStore()) return Promise.resolve(fn(this.raw));
    const result = this.tail.then(() => fn(this.raw));
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inTransaction.getStore()) return fn();
    const result = this.tail.then(() =>
      this.inTransaction.run(true, async () => {
        this.raw.exec('BEGIN IMMEDIATE;');
        try {
          const out = await fn();
          this.raw.exec('COMMIT;');
          return out;
        } catch (err) {
          try {
            this.raw.exec('ROLLBACK;');
          } catch {
            // ignore rollback failure; the original error wins
          }
          throw err;
        }
      }),
    );
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async close(): Promise<void> {
    await this.tail.catch(() => undefined);
    this.raw.close();
  }

  // --- identity ---------------------------------------------------------------
  ensureUserWorkspace(input: Parameters<DataStore['ensureUserWorkspace']>[0]) {
    return this.run((db) => identity.ensureUserWorkspace(db, input));
  }
  getUser(userId: string) {
    return this.run((db) => identity.getUser(db, userId));
  }
  getUserBySubject(subject: string) {
    return this.run((db) => identity.getUserBySubject(db, subject));
  }
  getWorkspace(workspaceId: string) {
    return this.run((db) => identity.getWorkspace(db, workspaceId));
  }
  updateWorkspace(
    workspaceId: string,
    patch: Parameters<DataStore['updateWorkspace']>[1],
    now: string,
  ) {
    return this.run((db) => identity.updateWorkspace(db, workspaceId, patch, now));
  }
  createSession(input: Parameters<DataStore['createSession']>[0]) {
    return this.run((db) => identity.createSession(db, input));
  }
  findActiveSession(tokenHash: string, now: string) {
    return this.run((db) => identity.findActiveSession(db, tokenHash, now));
  }
  touchSession(id: string, now: string) {
    return this.run((db) => identity.touchSession(db, id, now));
  }
  revokeSession(id: string, now: string) {
    return this.run((db) => identity.revokeSession(db, id, now));
  }
  revokeSessionsForUser(userId: string, now: string) {
    return this.run((db) => identity.revokeSessionsForUser(db, userId, now));
  }
  revokeSessionsByIdpSessionId(idpSessionId: string, now: string) {
    return this.run((db) => identity.revokeSessionsByIdpSessionId(db, idpSessionId, now));
  }
  ensureGrant(input: Parameters<DataStore['ensureGrant']>[0]) {
    return this.run((db) => identity.ensureGrant(db, input));
  }
  touchGrant(id: string, now: string) {
    return this.run((db) => identity.touchGrant(db, id, now));
  }
  listGrants(workspaceId: string) {
    return this.run((db) => identity.listGrants(db, workspaceId));
  }
  getGrant(workspaceId: string, id: string) {
    return this.run((db) => identity.getGrant(db, workspaceId, id));
  }
  revokeGrant(workspaceId: string, id: string, now: string) {
    return this.run((db) => identity.revokeGrant(db, workspaceId, id, now));
  }
  revokeGrantsForUser(userId: string, now: string) {
    return this.run((db) => identity.revokeGrantsForUser(db, userId, now));
  }
  revokeToken(jti: string, expiresAt: string) {
    return this.run((db) => identity.revokeToken(db, jti, expiresAt));
  }
  isTokenRevoked(jti: string) {
    return this.run((db) => identity.isTokenRevoked(db, jti));
  }
  purgeExpiredRevokedTokens(now: string) {
    return this.run((db) => identity.purgeExpiredRevokedTokens(db, now));
  }

  // --- projects ---------------------------------------------------------------
  createProject(input: Parameters<DataStore['createProject']>[0]) {
    return this.run((db) => projects.createProject(db, input));
  }
  getProject(workspaceId: string, id: string) {
    return this.run((db) => projects.getProject(db, workspaceId, id));
  }
  getProjectById(id: string) {
    return this.run((db) => projects.getProjectById(db, id));
  }
  listProjects(workspaceId: string, limit?: number) {
    return this.run((db) => projects.listProjects(db, workspaceId, limit));
  }
  commitProjectEdit(input: Parameters<DataStore['commitProjectEdit']>[0]) {
    return this.run((db) => projects.commitProjectEdit(db, input));
  }
  updateProjectMeta(id: string, patch: Parameters<DataStore['updateProjectMeta']>[1], now: string) {
    return this.run((db) => projects.updateProjectMeta(db, id, patch, now));
  }
  softDeleteProject(workspaceId: string, id: string, now: string) {
    return this.run((db) => projects.softDeleteProject(db, workspaceId, id, now));
  }
  createRevision(input: Parameters<DataStore['createRevision']>[0]) {
    return this.run((db) => projects.createRevision(db, input));
  }
  getRevision(projectId: string, id: string) {
    return this.run((db) => projects.getRevision(db, projectId, id));
  }
  listRevisions(projectId: string, limit?: number) {
    return this.run((db) => projects.listRevisions(db, projectId, limit));
  }
  countProjects(workspaceId: string) {
    return this.run((db) => projects.countProjects(db, workspaceId));
  }

  // --- assets and uploads -----------------------------------------------------
  createAsset(input: Parameters<DataStore['createAsset']>[0]) {
    return this.run((db) => assets.createAsset(db, input));
  }
  updateAsset(id: string, patch: assets.AssetPatch, now: string) {
    return this.run((db) => assets.updateAsset(db, id, patch, now));
  }
  claimAssetForImport(id: string, now: string) {
    return this.run((db) => assets.claimAssetForImport(db, id, now));
  }
  getAsset(workspaceId: string, id: string) {
    return this.run((db) => assets.getAsset(db, workspaceId, id));
  }
  getAssetById(id: string) {
    return this.run((db) => assets.getAssetById(db, id));
  }
  listAssetsForProject(projectId: string) {
    return this.run((db) => assets.listAssetsForProject(db, projectId));
  }
  listExpiredAssets(now: string, limit?: number) {
    return this.run((db) => assets.listExpiredAssets(db, now, limit));
  }
  markAssetPurged(id: string, now: string) {
    return this.run((db) => assets.markAssetPurged(db, id, now));
  }
  createUpload(input: Parameters<DataStore['createUpload']>[0]) {
    return this.run((db) => assets.createUpload(db, input));
  }
  findUploadByTokenHash(tokenHash: string) {
    return this.run((db) => assets.findUploadByTokenHash(db, tokenHash));
  }
  getUpload(workspaceId: string, id: string) {
    return this.run((db) => assets.getUpload(db, workspaceId, id));
  }
  listUploadsForProject(projectId: string) {
    return this.run((db) => assets.listUploadsForProject(db, projectId));
  }
  listExpiredDirectUploads(now: string, limit?: number) {
    return this.run((db) => assets.listExpiredDirectUploads(db, now, limit));
  }
  markUploadPurged(id: string, now: string) {
    return this.run((db) => assets.markUploadPurged(db, id, now));
  }
  completeUpload(id: string, now: string) {
    return this.run((db) => assets.completeUpload(db, id, now));
  }

  // --- tasks ------------------------------------------------------------------
  enqueueTask(input: Parameters<DataStore['enqueueTask']>[0]) {
    return this.run((db) => tasks.enqueueTask(db, input));
  }
  findTaskByIdempotencyKey(
    workspaceId: string,
    kind: Parameters<DataStore['findTaskByIdempotencyKey']>[1],
    key: string,
  ) {
    return this.run((db) => tasks.findTaskByIdempotencyKey(db, workspaceId, kind, key));
  }
  getTask(workspaceId: string, id: string) {
    return this.run((db) => tasks.getTask(db, workspaceId, id));
  }
  getTaskById(id: string) {
    return this.run((db) => tasks.getTaskById(db, id));
  }
  listTasks(workspaceId: string, opts: Parameters<DataStore['listTasks']>[1] = {}) {
    return this.run((db) => tasks.listTasks(db, workspaceId, opts));
  }
  countActiveRenderTasksForUpdate(workspaceId: string) {
    // BEGIN IMMEDIATE already serializes workspace admission in SQLite.
    return this.run((db) => tasks.countActiveRenderTasks(db, workspaceId));
  }
  claimNextTask(input: Parameters<DataStore['claimNextTask']>[0]) {
    return this.run((db) => tasks.claimNextTask(db, input));
  }
  claimTaskById(input: Parameters<DataStore['claimTaskById']>[0]) {
    return this.run((db) => tasks.claimTaskById(db, input));
  }
  heartbeatTask(input: Parameters<DataStore['heartbeatTask']>[0]) {
    return this.run((db) => tasks.heartbeatTask(db, input));
  }
  completeTask(input: Parameters<DataStore['completeTask']>[0]) {
    return this.run((db) => tasks.completeTask(db, input));
  }
  failTask(input: Parameters<DataStore['failTask']>[0]) {
    return this.run((db) => tasks.failTask(db, input));
  }
  requestCancel(workspaceId: string, id: string, now: string) {
    return this.run((db) => tasks.requestCancel(db, workspaceId, id, now));
  }
  markCancelled(input: Parameters<DataStore['markCancelled']>[0]) {
    return this.run((db) => tasks.markCancelled(db, input));
  }
  reclaimExpiredLeases(now: string) {
    return this.run((db) => tasks.reclaimExpiredLeases(db, now));
  }
  countQueued() {
    return this.run((db) => tasks.countQueued(db));
  }
  getTaskDispatch(taskId: string) {
    return this.run((db) => tasks.getTaskDispatch(db, taskId));
  }
  listPendingDispatches(now: string, limit?: number) {
    return this.run((db) => tasks.listPendingDispatches(db, now, limit));
  }
  markTaskDispatched(taskId: string, generation: number, now: string) {
    return this.run((db) => tasks.markTaskDispatched(db, taskId, generation, now));
  }
  recordTaskDispatchFailure(
    taskId: string,
    generation: number,
    now: string,
    errorCode: string,
  ): Promise<void> {
    return this.run((db) =>
      tasks.recordTaskDispatchFailure(db, taskId, generation, now, errorCode),
    );
  }

  // --- quotes -----------------------------------------------------------------
  createQuote(input: Parameters<DataStore['createQuote']>[0]) {
    return this.run((db) => quotes.createQuote(db, input));
  }
  getQuote(workspaceId: string, id: string) {
    return this.run((db) => quotes.getQuote(db, workspaceId, id));
  }
  consumeQuote(input: Parameters<DataStore['consumeQuote']>[0]) {
    return this.run((db) => quotes.consumeQuote(db, input));
  }
  invalidateOpenQuotes(projectId: string, reason: string) {
    return this.run((db) => quotes.invalidateOpenQuotes(db, projectId, reason));
  }
  expireOpenQuotes(now: string) {
    return this.run((db) => quotes.expireOpenQuotes(db, now));
  }
  listQuotesForProject(projectId: string, limit?: number) {
    return this.run((db) => quotes.listQuotesForProject(db, projectId, limit));
  }

  // --- credits ----------------------------------------------------------------
  getBalance(workspaceId: string) {
    return this.run((db) => credits.getBalance(db, workspaceId));
  }
  grantCredits(input: Parameters<DataStore['grantCredits']>[0]) {
    return this.run((db) => credits.grantCredits(db, input));
  }
  reserveCredits(input: Parameters<DataStore['reserveCredits']>[0]) {
    return this.run((db) => credits.reserveCredits(db, input));
  }
  getReservation(id: string) {
    return this.run((db) => credits.getReservation(db, id));
  }
  getReservationForTask(taskId: string) {
    return this.run((db) => credits.getReservationForTask(db, taskId));
  }
  settleReservation(input: Parameters<DataStore['settleReservation']>[0]) {
    return this.run((db) => credits.settleReservation(db, input));
  }
  releaseReservation(input: Parameters<DataStore['releaseReservation']>[0]) {
    return this.run((db) => credits.releaseReservation(db, input));
  }
  listLedger(workspaceId: string, limit?: number) {
    return this.run((db) => credits.listLedger(db, workspaceId, limit));
  }

  // --- plans, entitlements, and provider events -------------------------------
  getBillingAccount(workspaceId: string) {
    return this.run((db) => billing.getBillingAccount(db, workspaceId));
  }
  upsertBillingAccount(input: Parameters<DataStore['upsertBillingAccount']>[0]) {
    return this.run((db) => billing.upsertBillingAccount(db, input));
  }
  listCreditPools(workspaceId: string, now: string) {
    return this.run((db) => billing.listCreditPools(db, workspaceId, now));
  }
  recordBillingEvent(input: Parameters<DataStore['recordBillingEvent']>[0]) {
    return this.run((db) => billing.recordBillingEvent(db, input));
  }

  // --- idempotency ------------------------------------------------------------
  beginIdempotent(input: Parameters<DataStore['beginIdempotent']>[0]) {
    return this.run((db) => idempotency.beginIdempotent(db, input));
  }
  completeIdempotent(input: Parameters<DataStore['completeIdempotent']>[0]) {
    return this.run((db) => idempotency.completeIdempotent(db, input));
  }
  abortIdempotent(input: Parameters<DataStore['abortIdempotent']>[0]) {
    return this.run((db) => idempotency.abortIdempotent(db, input));
  }
  purgeIdempotencyKeys(olderThan: string) {
    return this.run((db) => idempotency.purgeIdempotencyKeys(db, olderThan));
  }

  // --- exports ----------------------------------------------------------------
  createExport(input: Parameters<DataStore['createExport']>[0]) {
    return this.run((db) => exportsRepo.createExport(db, input));
  }
  getExport(workspaceId: string, id: string) {
    return this.run((db) => exportsRepo.getExport(db, workspaceId, id));
  }
  listExports(workspaceId: string, opts: Parameters<DataStore['listExports']>[1] = {}) {
    return this.run((db) => exportsRepo.listExports(db, workspaceId, opts));
  }
  listExpiredExports(now: string, limit?: number) {
    return this.run((db) => exportsRepo.listExpiredExports(db, now, limit));
  }
  markExportPurged(id: string, now: string) {
    return this.run((db) => exportsRepo.markExportPurged(db, id, now));
  }
  listExportsForProjectAll(projectId: string) {
    return this.run((db) => exportsRepo.listExportsForProjectAll(db, projectId));
  }
  listExportsForTaskAll(taskId: string) {
    return this.run((db) => exportsRepo.listExportsForTaskAll(db, taskId));
  }
  deleteExportsForTask(taskId: string) {
    return this.run((db) => exportsRepo.deleteExportsForTask(db, taskId));
  }

  // --- audit ------------------------------------------------------------------
  recordAudit(input: audit.AuditEventInput) {
    return this.run((db) => audit.recordAudit(db, input));
  }
  listAudit(workspaceId: string, limit?: number) {
    return this.run((db) => audit.listAudit(db, workspaceId, limit));
  }
  findAuditByErrorRef(errorRef: string) {
    return this.run((db) => audit.findAuditByErrorRef(db, errorRef));
  }

  // --- analytics / read-only admin -------------------------------------------
  recordAnalyticsEvent(input: admin.AnalyticsEventInput) {
    return this.run((db) => admin.recordAnalyticsEvent(db, input));
  }
  getAdminOverview(now: string) {
    return this.run((db) => admin.getAdminOverview(db, now));
  }
  listAdminUsers(limit?: number) {
    return this.run((db) => admin.listAdminUsers(db, limit));
  }
  listAdminJobs(limit?: number) {
    return this.run((db) => admin.listAdminJobs(db, limit));
  }
  listAdminUserTimeline(userId: string, limit?: number) {
    return this.run((db) => admin.listAdminUserTimeline(db, userId, limit));
  }
  retryAdminTask(taskId: string, now: string) {
    return this.transaction(async () => admin.retryAdminTask(this.raw, taskId, now));
  }
  maintainAnalytics(now: string, rawBefore: string) {
    return this.transaction(async () => admin.maintainAnalytics(this.raw, now, rawBefore));
  }
}

/**
 * The raw SQLite handle behind a store. Tests use it for direct SQL and for
 * fault injection; production code must go through the `DataStore` surface.
 */
export function sqliteHandle(store: DataStore): Db {
  if (!(store instanceof SqliteStore)) throw new Error('Not a SQLite-backed store.');
  return store.raw;
}
