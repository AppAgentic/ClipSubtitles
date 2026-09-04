import { newId } from '@clipsubtitles/core';
import { many, one, run, type Db } from '../db';

export interface AnalyticsEventInput {
  sessionId: string;
  source: string;
  medium?: string;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adId?: string;
  creativeId?: string;
  appreferClickId?: string;
  landingUrl?: string;
  referrer?: string;
  event: string;
  surface: 'web' | 'api' | 'mcp';
  userId?: string;
  workspaceId?: string;
  projectId?: string;
  taskId?: string;
  properties?: Record<string, string | number | boolean>;
  now: string;
}

export interface AdminOverview {
  generatedAt: string;
  totals: {
    users: number;
    activatedUsers: number;
    projects: number;
    uploadedVideos: number;
    transcribedVideos: number;
    previews: number;
    exports: number;
    purchases: number;
  };
  jobs: {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    oldestQueuedAt?: string;
  };
  funnel: Array<{ event: string; count: number }>;
  sources: Array<{ source: string; sessions: number; registrations: number }>;
  costs: { transcriptionMinutes: number; estimatedTranscriptionUsd: number; storedBytes: number };
}

export interface AdminUserSummary {
  id: string;
  emailMasked?: string;
  createdAt: string;
  projects: number;
  transcriptions: number;
  exports: number;
  source?: string;
  lastActivityAt?: string;
}

export interface AdminJobSummary {
  id: string;
  kind: string;
  status: string;
  progress: number;
  stage?: string;
  attempts: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  userEmailMasked?: string;
}

export interface AdminTimelineEvent {
  event: string;
  surface: string;
  occurredAt: string;
  projectId?: string;
  taskId?: string;
}

const n = (value: unknown): number => Number(value ?? 0);
const s = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length ? value : undefined;

export function maskEmail(email: unknown): string | undefined {
  if (typeof email !== 'string' || !email.includes('@')) return undefined;
  const [local, domain] = email.split('@');
  if (!local || !domain) return undefined;
  return `${local.slice(0, 1)}${local.length > 1 ? '***' : ''}@${domain}`;
}

export function recordAnalyticsEvent(db: Db, input: AnalyticsEventInput): void {
  run(
    db,
    `INSERT INTO analytics_sessions
      (id, user_id, workspace_id, source, medium, campaign_id, campaign_name, adset_id, ad_id, creative_id,
       apprefer_click_id, landing_url, referrer, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = COALESCE(excluded.user_id, analytics_sessions.user_id),
       workspace_id = COALESCE(excluded.workspace_id, analytics_sessions.workspace_id),
       source = CASE WHEN analytics_sessions.source = 'direct' THEN excluded.source ELSE analytics_sessions.source END,
       medium = COALESCE(excluded.medium, analytics_sessions.medium),
       campaign_id = COALESCE(excluded.campaign_id, analytics_sessions.campaign_id),
       campaign_name = COALESCE(excluded.campaign_name, analytics_sessions.campaign_name),
       adset_id = COALESCE(excluded.adset_id, analytics_sessions.adset_id),
       ad_id = COALESCE(excluded.ad_id, analytics_sessions.ad_id),
       creative_id = COALESCE(excluded.creative_id, analytics_sessions.creative_id),
       apprefer_click_id = COALESCE(excluded.apprefer_click_id, analytics_sessions.apprefer_click_id),
       last_seen_at = excluded.last_seen_at`,
    input.sessionId,
    input.userId ?? null,
    input.workspaceId ?? null,
    input.source,
    input.medium ?? null,
    input.campaignId ?? null,
    input.campaignName ?? null,
    input.adsetId ?? null,
    input.adId ?? null,
    input.creativeId ?? null,
    input.appreferClickId ?? null,
    input.landingUrl ?? null,
    input.referrer ?? null,
    input.now,
    input.now,
  );
  run(
    db,
    `INSERT OR IGNORE INTO analytics_events
      (id, session_id, user_id, workspace_id, event, surface, project_id, task_id, properties_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('audit'),
    input.sessionId,
    input.userId ?? null,
    input.workspaceId ?? null,
    input.event,
    input.surface,
    input.projectId ?? null,
    input.taskId ?? null,
    input.properties ? JSON.stringify(input.properties) : null,
    input.now,
  );
}

export function getAdminOverview(db: Db, now: string): AdminOverview {
  const rawCutoff = new Date(Date.parse(now) - 90 * 24 * 60 * 60 * 1000).toISOString();
  const cutoffDay = rawCutoff.slice(0, 10);
  const scalar = (sql: string) => n(one(db, sql)?.value);
  const jobRows = many(db, 'SELECT status, COUNT(*) AS count FROM tasks GROUP BY status');
  const jobs = { queued: 0, running: 0, succeeded: 0, failed: 0 } as AdminOverview['jobs'];
  for (const row of jobRows) {
    const key = String(row.status) as keyof typeof jobs;
    if (key in jobs) (jobs[key] as number) = n(row.count);
  }
  const oldest = s(
    one(db, "SELECT MIN(created_at) AS value FROM tasks WHERE status = 'queued'")?.value,
  );
  if (oldest) jobs.oldestQueuedAt = oldest;
  const funnel = many(
    db,
    `SELECT event,SUM(count) AS count FROM (
      SELECT event,COUNT(DISTINCT session_id) AS count FROM analytics_events WHERE occurred_at>=? GROUP BY event
      UNION ALL SELECT event,SUM(event_count) AS count FROM analytics_daily_rollups WHERE day<? GROUP BY event
    ) GROUP BY event ORDER BY count DESC`,
    rawCutoff,
    cutoffDay,
  ).map((r) => ({ event: String(r.event), count: n(r.count) }));
  const sources = many(
    db,
    `SELECT source,SUM(sessions) AS sessions,SUM(registrations) AS registrations FROM (
      SELECT s.source,COUNT(DISTINCT s.id) AS sessions,
        COUNT(DISTINCT CASE WHEN e.event='signup_completed' THEN e.user_id END) AS registrations
      FROM analytics_sessions s LEFT JOIN analytics_events e ON e.session_id=s.id AND e.occurred_at>=?
      WHERE s.source!='internal' AND s.last_seen_at>=? GROUP BY s.source
      UNION ALL
      SELECT source,SUM(session_count),SUM(CASE WHEN event='signup_completed' THEN user_count ELSE 0 END)
      FROM analytics_daily_rollups WHERE day<? AND source!='internal' GROUP BY source
    ) GROUP BY source ORDER BY sessions DESC`,
    rawCutoff,
    rawCutoff,
    cutoffDay,
  ).map((r) => ({
    source: String(r.source),
    sessions: n(r.sessions),
    registrations: n(r.registrations),
  }));
  const transcriptionMs = scalar(
    'SELECT COALESCE(SUM(duration_ms), 0) AS value FROM transcript_revisions',
  );
  const storedBytes =
    scalar('SELECT COALESCE(SUM(bytes), 0) AS value FROM source_assets WHERE purged_at IS NULL') +
    scalar('SELECT COALESCE(SUM(bytes), 0) AS value FROM exports WHERE purged_at IS NULL');
  return {
    generatedAt: now,
    totals: {
      users: scalar('SELECT COUNT(*) AS value FROM users'),
      activatedUsers: scalar(
        'SELECT COUNT(DISTINCT p.workspace_id) AS value FROM projects p JOIN transcript_revisions tr ON tr.project_id = p.id',
      ),
      projects: scalar('SELECT COUNT(*) AS value FROM projects WHERE deleted_at IS NULL'),
      uploadedVideos: scalar("SELECT COUNT(*) AS value FROM source_assets WHERE status = 'ready'"),
      transcribedVideos: scalar(
        'SELECT COUNT(DISTINCT project_id) AS value FROM transcript_revisions',
      ),
      previews: scalar(
        "SELECT COUNT(*) AS value FROM exports WHERE kind = 'preview' AND status != 'purged'",
      ),
      exports: scalar(
        "SELECT COUNT(*) AS value FROM exports WHERE kind != 'preview' AND status != 'purged'",
      ),
      purchases: scalar(
        "SELECT COUNT(*) AS value FROM billing_events WHERE status = 'processed' AND event_type LIKE '%payment%'",
      ),
    },
    jobs,
    funnel,
    sources,
    costs: {
      transcriptionMinutes: Math.round((transcriptionMs / 60000) * 10) / 10,
      estimatedTranscriptionUsd: Math.round((transcriptionMs / 3600000) * 0.22 * 100) / 100,
      storedBytes,
    },
  };
}

export function listAdminUsers(db: Db, limit = 100): AdminUserSummary[] {
  return many(
    db,
    `SELECT u.id, u.email, u.created_at,
      COUNT(DISTINCT p.id) AS projects, COUNT(DISTINCT tr.project_id) AS transcriptions,
      COUNT(DISTINCT ex.id) AS exports, MIN(ans.source) AS source,
      MAX(COALESCE(ae.occurred_at, p.updated_at, u.created_at)) AS last_activity_at
    FROM users u
    LEFT JOIN workspaces w ON w.owner_user_id = u.id
    LEFT JOIN projects p ON p.workspace_id = w.id
    LEFT JOIN transcript_revisions tr ON tr.project_id = p.id
    LEFT JOIN exports ex ON ex.workspace_id = w.id AND ex.status != 'purged'
    LEFT JOIN analytics_sessions ans ON ans.user_id = u.id
    LEFT JOIN analytics_events ae ON ae.user_id = u.id
    GROUP BY u.id, u.email, u.created_at ORDER BY u.created_at DESC LIMIT ?`,
    limit,
  ).map((r) => {
    const item: AdminUserSummary = {
      id: String(r.id),
      createdAt: String(r.created_at),
      projects: n(r.projects),
      transcriptions: n(r.transcriptions),
      exports: n(r.exports),
    };
    const email = maskEmail(r.email);
    const source = s(r.source);
    const last = s(r.last_activity_at);
    if (email) item.emailMasked = email;
    if (source) item.source = source;
    if (last) item.lastActivityAt = last;
    return item;
  });
}

export function listAdminJobs(db: Db, limit = 100): AdminJobSummary[] {
  return many(
    db,
    `SELECT t.*, u.email FROM tasks t
    LEFT JOIN workspaces w ON w.id = t.workspace_id LEFT JOIN users u ON u.id = w.owner_user_id
    ORDER BY t.created_at DESC LIMIT ?`,
    limit,
  ).map((r) => {
    let errorCode: string | undefined;
    try {
      errorCode = s(JSON.parse(String(r.error_json ?? 'null'))?.code);
    } catch {
      /* redacted */
    }
    const item: AdminJobSummary = {
      id: String(r.id),
      kind: String(r.kind),
      status: String(r.status),
      progress: n(r.progress),
      attempts: n(r.attempts),
      createdAt: String(r.created_at),
    };
    const stage = s(r.stage);
    const started = s(r.started_at);
    const finished = s(r.finished_at);
    const email = maskEmail(r.email);
    if (stage) item.stage = stage;
    if (started) item.startedAt = started;
    if (finished) item.finishedAt = finished;
    if (errorCode) item.errorCode = errorCode;
    if (email) item.userEmailMasked = email;
    return item;
  });
}

export function retryAdminTask(db: Db, taskId: string, now: string): boolean {
  const changed = run(
    db,
    `UPDATE tasks SET status='queued', progress=0, stage='queued', attempts=0, error_json=NULL,
    cancel_requested=0, lease_owner=NULL, lease_expires_at=NULL, run_after=?, updated_at=?, started_at=NULL, finished_at=NULL
    WHERE id=? AND status='failed' AND kind IN ('import_source','finalize_upload','generate_captions','render_preview')`,
    now,
    now,
    taskId,
  ).changes;
  if (!changed) return false;
  run(
    db,
    `INSERT INTO task_dispatch_outbox (task_id,available_at,attempts,last_error_code,delivered_at,created_at,updated_at,generation)
    VALUES (?, ?, 0, NULL, NULL, ?, ?, 1)
    ON CONFLICT(task_id) DO UPDATE SET available_at=excluded.available_at, attempts=0, last_error_code=NULL,
      delivered_at=NULL, updated_at=excluded.updated_at, generation=task_dispatch_outbox.generation+1`,
    taskId,
    now,
    now,
    now,
  );
  return true;
}

export function listAdminUserTimeline(db: Db, userId: string, limit = 100): AdminTimelineEvent[] {
  return many(
    db,
    `SELECT event,surface,occurred_at,project_id,task_id FROM analytics_events
     WHERE user_id=? OR workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id=?)
     ORDER BY occurred_at DESC LIMIT ?`,
    userId,
    userId,
    limit,
  ).map((row) => {
    const item: AdminTimelineEvent = {
      event: String(row.event),
      surface: String(row.surface),
      occurredAt: String(row.occurred_at),
    };
    const projectId = s(row.project_id);
    const taskId = s(row.task_id);
    if (projectId) item.projectId = projectId;
    if (taskId) item.taskId = taskId;
    return item;
  });
}

export function maintainAnalytics(
  db: Db,
  now: string,
  rawBefore: string,
): { eventsPurged: number; sessionsPurged: number } {
  run(
    db,
    `INSERT INTO analytics_daily_rollups (day,event,source,event_count,session_count,user_count,updated_at)
    SELECT substr(e.occurred_at,1,10),e.event,s.source,COUNT(*),COUNT(DISTINCT e.session_id),COUNT(DISTINCT e.user_id),?
    FROM analytics_events e JOIN analytics_sessions s ON s.id=e.session_id
    WHERE e.occurred_at < ? GROUP BY substr(e.occurred_at,1,10),e.event,s.source
    ON CONFLICT(day,event,source) DO UPDATE SET event_count=excluded.event_count,session_count=excluded.session_count,
      user_count=excluded.user_count,updated_at=excluded.updated_at`,
    now,
    `${now.slice(0, 10)}T00:00:00.000Z`,
  );
  const eventsPurged = run(
    db,
    'DELETE FROM analytics_events WHERE occurred_at < ?',
    rawBefore,
  ).changes;
  const sessionsPurged = run(
    db,
    `DELETE FROM analytics_sessions WHERE last_seen_at < ?
    AND NOT EXISTS (SELECT 1 FROM analytics_events e WHERE e.session_id=analytics_sessions.id)`,
    rawBefore,
  ).changes;
  return { eventsPurged, sessionsPurged };
}
