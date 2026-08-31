import type {
  ExpectedOutput,
  BillingPlanId,
  BillingSubscriptionStatus,
  CreditPoolKind,
  LedgerEntry,
  OutputSettings,
  ProjectStatus,
  RetentionPolicy,
  Scope,
  SegmentationParams,
  StyleConfig,
  TaskError,
  TaskKind,
  TaskResult,
  TranscriptSource,
  TranscriptWord,
} from '@clipsubtitles/contracts';
import type { AssetPatch, AssetRecord, AssetOrigin, AssetStatus, UploadRecord } from './repos/assets';
import type { AuditEventInput, AuditEventRecord } from './repos/audit';
import type { BillingAccountRecord, BillingEventRecord, CreditPoolRecord } from './repos/billing';
import type { CreditBalanceRecord, ReservationRecord } from './repos/credits';
import type { ExportRecord } from './repos/exports';
import type { IdempotencyBegin } from './repos/idempotency';
import type {
  EnsureUserWorkspaceInput,
  GrantRecord,
  SessionRecord,
  UserRecord,
  WorkspaceRecord,
} from './repos/identity';
import type { ProjectEditPatch, ProjectRecord, RevisionRecord } from './repos/projects';
import type { QuoteRecord } from './repos/quotes';
import type { DispatchOutboxRecord, TaskRecord } from './repos/tasks';

export type DataStoreDriver = 'sqlite' | 'postgres';

/**
 * Driver-agnostic persistence surface. Every method is asynchronous so the same
 * call sites work over the synchronous local SQLite adapter and the pooled,
 * genuinely asynchronous PostgreSQL adapter.
 *
 * `transaction` is the only atomicity primitive: it runs `fn` with the store
 * pinned to one connection, and nested calls join the outer transaction rather
 * than opening a second one. Every method invoked inside `fn` — directly or
 * through an awaited callee — uses that same pinned connection.
 */
export interface DataStore {
  readonly driver: DataStoreDriver;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;

  // --- identity ---------------------------------------------------------------
  ensureUserWorkspace(
    input: EnsureUserWorkspaceInput,
  ): Promise<{ user: UserRecord; workspace: WorkspaceRecord; created: boolean }>;
  getUser(userId: string): Promise<UserRecord | null>;
  getUserBySubject(subject: string): Promise<UserRecord | null>;
  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
  updateWorkspace(
    workspaceId: string,
    patch: { name?: string; retention?: Partial<RetentionPolicy> },
    now: string,
  ): Promise<WorkspaceRecord>;
  createSession(input: {
    tokenHash: string;
    userId: string;
    workspaceId: string;
    idpSessionId?: string;
    now: string;
    expiresAt: string;
  }): Promise<SessionRecord>;
  findActiveSession(tokenHash: string, now: string): Promise<SessionRecord | null>;
  touchSession(id: string, now: string): Promise<void>;
  revokeSession(id: string, now: string): Promise<boolean>;
  revokeSessionsForUser(userId: string, now: string): Promise<number>;
  revokeSessionsByIdpSessionId(idpSessionId: string, now: string): Promise<number>;
  ensureGrant(input: {
    userId: string;
    workspaceId: string;
    clientId: string;
    clientName?: string;
    scopes: Scope[];
    now: string;
  }): Promise<GrantRecord>;
  touchGrant(id: string, now: string): Promise<void>;
  listGrants(workspaceId: string): Promise<GrantRecord[]>;
  getGrant(workspaceId: string, id: string): Promise<GrantRecord | null>;
  revokeGrant(workspaceId: string, id: string, now: string): Promise<boolean>;
  revokeGrantsForUser(userId: string, now: string): Promise<number>;
  revokeToken(jti: string, expiresAt: string): Promise<void>;
  isTokenRevoked(jti: string): Promise<boolean>;
  purgeExpiredRevokedTokens(now: string): Promise<number>;

  // --- projects and transcript revisions --------------------------------------
  createProject(input: {
    workspaceId: string;
    title: string;
    status: ProjectStatus;
    style: StyleConfig;
    segmentation: SegmentationParams;
    contentHash: string;
    language?: string;
    now: string;
  }): Promise<ProjectRecord>;
  getProject(workspaceId: string, id: string): Promise<ProjectRecord | null>;
  getProjectById(id: string): Promise<ProjectRecord | null>;
  listProjects(workspaceId: string, limit?: number): Promise<ProjectRecord[]>;
  commitProjectEdit(input: {
    id: string;
    workspaceId: string;
    expectedVersion: number;
    patch: ProjectEditPatch;
    now: string;
  }): Promise<ProjectRecord>;
  updateProjectMeta(
    id: string,
    patch: {
      status?: ProjectStatus;
      sourceAssetId?: string | null;
      language?: string;
      title?: string;
    },
    now: string,
  ): Promise<ProjectRecord | null>;
  softDeleteProject(workspaceId: string, id: string, now: string): Promise<boolean>;
  createRevision(input: {
    projectId: string;
    source: TranscriptSource;
    provider: string;
    model?: string;
    language: string;
    words: TranscriptWord[];
    durationMs: number;
    fallbackFrom?: string;
    parentRevisionId?: string;
    now: string;
  }): Promise<RevisionRecord>;
  getRevision(projectId: string, id: string): Promise<RevisionRecord | null>;
  listRevisions(projectId: string, limit?: number): Promise<RevisionRecord[]>;
  countProjects(workspaceId: string): Promise<number>;

  // --- source assets and uploads ----------------------------------------------
  createAsset(input: {
    workspaceId: string;
    projectId: string;
    status: AssetStatus;
    origin: AssetOrigin;
    fileName?: string;
    mimeType?: string;
    sourceUrl?: string;
    truthKey?: string;
    now: string;
  }): Promise<AssetRecord>;
  updateAsset(id: string, patch: AssetPatch, now: string): Promise<AssetRecord | null>;
  /** Atomically move one pending upload asset into importing; exactly one competing upload may win. */
  claimAssetForImport(id: string, now: string): Promise<boolean>;
  getAsset(workspaceId: string, id: string): Promise<AssetRecord | null>;
  getAssetById(id: string): Promise<AssetRecord | null>;
  listAssetsForProject(projectId: string): Promise<AssetRecord[]>;
  listExpiredAssets(now: string, limit?: number): Promise<AssetRecord[]>;
  markAssetPurged(id: string, now: string): Promise<boolean>;
  createUpload(input: {
    id?: string;
    workspaceId: string;
    projectId: string;
    assetId: string;
    tokenHash: string;
    maxBytes: number;
    transport?: 'proxy' | 'direct';
    storageKey?: string;
    expectedBytes?: number;
    expectedMimeType?: string;
    expectedSha256?: string;
    now: string;
    expiresAt: string;
  }): Promise<UploadRecord>;
  findUploadByTokenHash(tokenHash: string): Promise<UploadRecord | null>;
  getUpload(workspaceId: string, id: string): Promise<UploadRecord | null>;
  listUploadsForProject(projectId: string): Promise<UploadRecord[]>;
  listExpiredDirectUploads(now: string, limit?: number): Promise<UploadRecord[]>;
  markUploadPurged(id: string, now: string): Promise<boolean>;
  completeUpload(id: string, now: string): Promise<boolean>;

  // --- durable tasks and the dispatch outbox ----------------------------------
  enqueueTask(input: {
    workspaceId: string;
    projectId?: string;
    kind: TaskKind;
    input: unknown;
    idempotencyKey?: string;
    maxAttempts?: number;
    now: string;
    runAfter?: string;
  }): Promise<TaskRecord>;
  findTaskByIdempotencyKey(
    workspaceId: string,
    kind: TaskKind,
    key: string,
  ): Promise<TaskRecord | null>;
  getTask(workspaceId: string, id: string): Promise<TaskRecord | null>;
  getTaskById(id: string): Promise<TaskRecord | null>;
  listTasks(
    workspaceId: string,
    opts?: { projectId?: string; activeOnly?: boolean; limit?: number },
  ): Promise<TaskRecord[]>;
  /** Serialize paid render admission per workspace, then return queued/running exports. */
  countActiveRenderTasksForUpdate(workspaceId: string): Promise<number>;
  claimNextTask(input: {
    workerId: string;
    now: string;
    leaseMs: number;
    kinds?: readonly TaskKind[];
  }): Promise<TaskRecord | null>;
  claimTaskById(input: {
    id: string;
    workerId: string;
    now: string;
    leaseMs: number;
  }): Promise<TaskRecord | null>;
  heartbeatTask(input: {
    id: string;
    workerId: string;
    now: string;
    leaseMs: number;
    progress?: number;
    stage?: string;
  }): Promise<{ owned: boolean; cancelRequested: boolean }>;
  completeTask(input: {
    id: string;
    workerId: string;
    result: TaskResult;
    now: string;
  }): Promise<TaskRecord | null>;
  failTask(input: {
    id: string;
    workerId: string;
    error: TaskError;
    now: string;
    backoffMs?: number;
  }): Promise<{ outcome: 'requeued' | 'failed' | 'not_owned'; task: TaskRecord | null }>;
  requestCancel(
    workspaceId: string,
    id: string,
    now: string,
  ): Promise<{
    outcome: 'cancelled' | 'cancel_requested' | 'not_cancellable' | 'not_found';
    task: TaskRecord | null;
  }>;
  markCancelled(input: { id: string; workerId: string; now: string }): Promise<TaskRecord | null>;
  reclaimExpiredLeases(
    now: string,
  ): Promise<{ requeued: string[]; failed: string[]; cancelled: string[] }>;
  countQueued(): Promise<number>;
  getTaskDispatch(taskId: string): Promise<DispatchOutboxRecord | null>;
  listPendingDispatches(now: string, limit?: number): Promise<DispatchOutboxRecord[]>;
  markTaskDispatched(taskId: string, generation: number, now: string): Promise<boolean>;
  recordTaskDispatchFailure(
    taskId: string,
    generation: number,
    now: string,
    errorCode: string,
  ): Promise<void>;

  // --- render quotes ----------------------------------------------------------
  createQuote(input: {
    workspaceId: string;
    projectId: string;
    projectVersion: number;
    contentHash: string;
    settings: OutputSettings;
    expectedOutputs: ExpectedOutput[];
    durationMs: number;
    billableMinutes: number;
    creditCost: number;
    priceVersion: string;
    now: string;
    expiresAt: string;
  }): Promise<QuoteRecord>;
  getQuote(workspaceId: string, id: string): Promise<QuoteRecord | null>;
  consumeQuote(input: { workspaceId: string; id: string; taskId: string; now: string }): Promise<{
    outcome: 'consumed' | 'expired' | 'invalidated' | 'already_consumed' | 'not_found';
    quote: QuoteRecord | null;
  }>;
  invalidateOpenQuotes(projectId: string, reason: string): Promise<number>;
  expireOpenQuotes(now: string): Promise<number>;
  listQuotesForProject(projectId: string, limit?: number): Promise<QuoteRecord[]>;

  // --- credits ----------------------------------------------------------------
  getBalance(workspaceId: string): Promise<CreditBalanceRecord>;
  grantCredits(input: {
    workspaceId: string;
    amount: number;
    idempotencyKey: string;
    note?: string;
    now: string;
    kind?: 'grant' | 'adjust';
    poolKind?: CreditPoolKind;
    expiresAt?: string;
  }): Promise<CreditBalanceRecord>;
  reserveCredits(input: {
    workspaceId: string;
    quoteId: string;
    taskId: string;
    amount: number;
    now: string;
  }): Promise<{ reservation: ReservationRecord; created: boolean }>;
  getReservation(id: string): Promise<ReservationRecord | null>;
  getReservationForTask(taskId: string): Promise<ReservationRecord | null>;
  settleReservation(input: {
    reservationId: string;
    actualAmount?: number;
    now: string;
  }): Promise<{ reservation: ReservationRecord; changed: boolean }>;
  releaseReservation(input: {
    reservationId: string;
    now: string;
    reason?: string;
  }): Promise<{ reservation: ReservationRecord; changed: boolean }>;
  listLedger(workspaceId: string, limit?: number): Promise<LedgerEntry[]>;

  // --- plans, entitlements, and provider events -------------------------------
  getBillingAccount(workspaceId: string): Promise<BillingAccountRecord | null>;
  upsertBillingAccount(input: {
    workspaceId: string;
    planId: BillingPlanId;
    status: BillingSubscriptionStatus;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
    provider?: string;
    providerCustomerId?: string;
    providerSubscriptionId?: string;
    now: string;
  }): Promise<BillingAccountRecord>;
  listCreditPools(workspaceId: string, now: string): Promise<CreditPoolRecord[]>;
  recordBillingEvent(input: {
    provider: string;
    eventId: string;
    eventType: string;
    workspaceId?: string;
    status: 'processing' | 'processed' | 'ignored' | 'failed';
    occurredAt: string;
    processedAt: string;
  }): Promise<{ event: BillingEventRecord; created: boolean }>;

  // --- request idempotency ----------------------------------------------------
  beginIdempotent(input: {
    workspaceId: string;
    scope: string;
    key: string;
    fingerprint: string;
    now: string;
  }): Promise<IdempotencyBegin>;
  completeIdempotent(input: {
    workspaceId: string;
    scope: string;
    key: string;
    statusCode: number;
    response: unknown;
    now: string;
  }): Promise<void>;
  abortIdempotent(input: { workspaceId: string; scope: string; key: string }): Promise<void>;
  purgeIdempotencyKeys(olderThan: string): Promise<number>;

  // --- exports ----------------------------------------------------------------
  createExport(
    input: Omit<ExportRecord, 'id' | 'status' | 'createdAt' | 'purgedAt'> & { now: string },
  ): Promise<ExportRecord>;
  getExport(workspaceId: string, id: string): Promise<ExportRecord | null>;
  listExports(
    workspaceId: string,
    opts?: { projectId?: string; taskId?: string; limit?: number; includePurged?: boolean },
  ): Promise<ExportRecord[]>;
  listExpiredExports(now: string, limit?: number): Promise<ExportRecord[]>;
  markExportPurged(id: string, now: string): Promise<boolean>;
  listExportsForProjectAll(projectId: string): Promise<ExportRecord[]>;
  listExportsForTaskAll(taskId: string): Promise<ExportRecord[]>;
  deleteExportsForTask(taskId: string): Promise<number>;

  // --- audit ------------------------------------------------------------------
  recordAudit(input: AuditEventInput): Promise<AuditEventRecord>;
  listAudit(workspaceId: string, limit?: number): Promise<AuditEventRecord[]>;
  findAuditByErrorRef(errorRef: string): Promise<AuditEventRecord | null>;
}
