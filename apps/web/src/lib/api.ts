import {
  SUPPORTED_SOURCE_MIME_TYPES,
  type CreateDirectUploadTargetRequest,
  type ApiError,
  type CaptionProject,
  type Connection,
  type CreatePreviewRequest,
  type CreateProjectRequest,
  type CreateProjectResponse,
  type CreditBalance,
  type BillingOverview,
  type BillingManagementSession,
  type CheckoutSession,
  type CreateCheckoutRequest,
  type ErrorCode,
  type Export,
  type GenerateCaptionsRequest,
  type LedgerEntry,
  type Me,
  type OutputSettings,
  type PatchOp,
  type ProjectSummary,
  type RenderQuote,
  type Task,
  type TranscriptWord,
  type UploadTarget,
  type Workspace,
} from '@clipsubtitles/contracts';

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
export interface AdminUser {
  id: string;
  emailMasked?: string;
  createdAt: string;
  projects: number;
  transcriptions: number;
  exports: number;
  source?: string;
  lastActivityAt?: string;
}
export interface AdminJob {
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

/** Public API error surfaced to the UI. Messages are already safe for display. */
export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly errorRef: string | undefined;
  readonly details: Array<{ path: string; message: string }> | undefined;
  constructor(status: number, body: ApiError['error']) {
    super(body.message);
    this.name = 'ApiClientError';
    this.code = body.code;
    this.status = status;
    this.errorRef = body.errorRef;
    this.details = body.details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  headers.set('accept', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'include', cache: 'no-store' });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const body = (parsed as ApiError | null)?.error ?? {
      code: 'INTERNAL' as ErrorCode,
      message: `Request failed (${res.status}).`,
      retryable: false,
    };
    throw new ApiClientError(res.status, body);
  }
  return parsed as T;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const api = {
  me: () => request<Me>('/v1/me'),
  updateWorkspace: (body: { name?: string }) =>
    request<Workspace>('/v1/workspace', { method: 'PATCH', body: JSON.stringify(body) }),
  credits: () => request<CreditBalance>('/v1/credits'),
  billing: () => request<BillingOverview>('/v1/billing'),
  billingManagement: () =>
    request<BillingManagementSession>('/v1/billing/manage', { method: 'POST' }),
  createCheckout: (body: CreateCheckoutRequest) =>
    request<CheckoutSession>('/v1/billing/checkout', {
      method: 'POST',
      headers: { 'idempotency-key': `web-${Date.now()}-${Math.random().toString(36).slice(2)}` },
      body: JSON.stringify(body),
    }),
  ledger: () => request<{ entries: LedgerEntry[] }>('/v1/credits/ledger'),
  connections: () => request<{ connections: Connection[] }>('/v1/connections'),
  revokeConnection: (id: string) =>
    request<Connection>(`/v1/connections/${id}/revoke`, { method: 'POST' }),
  adminOverview: () => request<AdminOverview>('/v1/admin/overview'),
  adminUsers: () => request<{ users: AdminUser[] }>('/v1/admin/users?limit=12'),
  adminJobs: () => request<{ jobs: AdminJob[] }>('/v1/admin/jobs?limit=12'),
  adminRetryJob: (taskId: string) =>
    request<{ queued: true }>(`/v1/admin/jobs/${taskId}/retry`, json({ confirm: true })),

  listProjects: () => request<{ projects: ProjectSummary[] }>('/v1/projects'),
  getProject: (
    id: string,
    opts: { words?: boolean; wordsOffset?: number; wordsLimit?: number } = {},
  ) => {
    const q = new URLSearchParams();
    q.set('include', opts.words ? 'pages,words' : 'pages');
    if (opts.wordsOffset !== undefined) q.set('wordsOffset', String(opts.wordsOffset));
    if (opts.wordsLimit !== undefined) q.set('wordsLimit', String(opts.wordsLimit));
    return request<CaptionProject>(`/v1/projects/${id}?${q.toString()}`);
  },
  createProject: (body: CreateProjectRequest) =>
    request<CreateProjectResponse>('/v1/projects', json(body)),
  createUploadTarget: (id: string) =>
    request<UploadTarget>(`/v1/projects/${id}/upload-targets`, { method: 'POST' }),
  createDirectUploadTarget: (id: string, body: CreateDirectUploadTargetRequest) =>
    request<UploadTarget>(`/v1/projects/${id}/direct-upload-targets`, json(body)),
  deleteProject: (id: string) => request<void>(`/v1/projects/${id}`, { method: 'DELETE' }),
  patchProject: (
    id: string,
    expectedVersion: number,
    ops: PatchOp[],
    opts: { keepalive?: boolean } = {},
  ) =>
    request<{ project: CaptionProject; applied: number; newRevision: boolean }>(
      `/v1/projects/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion, ops }),
        ...(opts.keepalive ? { keepalive: true } : {}),
      },
    ),
  generateCaptions: (id: string, body: GenerateCaptionsRequest) =>
    request<{ task: Task; project: CaptionProject }>(`/v1/projects/${id}/captions`, json(body)),
  createPreview: (id: string, body: CreatePreviewRequest) =>
    request<{ task: Task }>(`/v1/projects/${id}/previews`, json(body)),
  createQuote: (id: string, settings: OutputSettings) =>
    request<RenderQuote>(`/v1/projects/${id}/render-quotes`, json({ settings })),
  startRender: (
    id: string,
    body: { quoteId: string; approvedCreditCost: number; idempotencyKey: string },
  ) =>
    request<{ task: Task; quote: RenderQuote; reservedCredits: number }>(
      `/v1/projects/${id}/renders`,
      json(body),
    ),

  listTasks: (opts: { projectId?: string; active?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (opts.projectId) q.set('projectId', opts.projectId);
    if (opts.active) q.set('active', 'true');
    return request<{ tasks: Task[] }>(`/v1/tasks?${q.toString()}`);
  },
  getTask: (id: string) => request<{ task: Task; exports?: Export[] }>(`/v1/tasks/${id}`),
  cancelTask: (id: string) => request<{ task: Task }>(`/v1/tasks/${id}/cancel`, { method: 'POST' }),

  listExports: (opts: { projectId?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.projectId) q.set('projectId', opts.projectId);
    return request<{ exports: Export[] }>(`/v1/exports?${q.toString()}`);
  },
  getExport: (id: string) => request<Export>(`/v1/exports/${id}`),

  devFixtures: () =>
    request<{
      fixtures: Array<{ id: string; title: string; language: string; available: boolean }>;
    }>('/dev/fixtures'),
  createFixtureProject: (fixtureId: string) =>
    request<{ project: CaptionProject }>(`/dev/fixtures/${fixtureId}/projects`, { method: 'POST' }),
};

/** Load every transcript word through bounded windows. */
export async function loadAllWords(projectId: string, total: number): Promise<TranscriptWord[]> {
  const words: TranscriptWord[] = [];
  const limit = 500;
  for (let offset = 0; offset < total; offset += limit) {
    const p = await api.getProject(projectId, {
      words: true,
      wordsOffset: offset,
      wordsLimit: limit,
    });
    words.push(...(p.transcript?.words ?? []));
    if (!p.transcript?.words?.length) break;
  }
  return words;
}

/** Upload with progress via XHR (fetch cannot report upload progress). Same-origin path keeps the cookie session out of it: the URL is signed. */
export async function bestUploadTarget(projectId: string, file: File): Promise<UploadTarget> {
  const direct = directUploadRequest(file);
  if (direct) return api.createDirectUploadTarget(projectId, direct);
  return api.createUploadTarget(projectId);
}

export function directUploadRequest(file: File): CreateDirectUploadTargetRequest | undefined {
  const mimeType = file.type.toLowerCase();
  if (!(SUPPORTED_SOURCE_MIME_TYPES as readonly string[]).includes(mimeType)) return undefined;
  return { bytes: file.size, mimeType: mimeType as CreateDirectUploadTargetRequest['mimeType'] };
}

export async function uploadToTarget(
  target: UploadTarget,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = new URL(target.url);
    xhr.open(
      target.method,
      target.transport === 'direct' ? target.url : `${url.pathname}${url.search}`,
    );
    const headers =
      target.transport === 'direct'
        ? target.headers
        : { 'content-type': file.type || 'application/octet-stream' };
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText) as ApiError;
        reject(new ApiClientError(xhr.status, body.error));
      } catch {
        reject(
          new ApiClientError(xhr.status, {
            code: 'INTERNAL',
            message: `Upload failed (${xhr.status}).`,
            retryable: false,
          }),
        );
      }
    };
    xhr.onerror = () =>
      reject(
        new ApiClientError(0, {
          code: 'INTERNAL',
          message: 'Network error during upload.',
          retryable: true,
        }),
      );
    xhr.send(file);
  });
  if (target.transport !== 'direct') return;
  onProgress(0.92);
  const complete = new URL(target.completeUrl);
  const accepted = await request<{ task: Task }>(
    `${complete.pathname}${complete.search}`,
    json({}),
  );
  const deadline = Date.now() + 10 * 60_000;
  let pollDelayMs = 500;
  for (;;) {
    const current = await api.getTask(accepted.task.id);
    if (current.task.status === 'succeeded') {
      onProgress(1);
      return;
    }
    if (current.task.status === 'failed' || current.task.status === 'cancelled') {
      throw new ApiClientError(
        422,
        current.task.error ?? {
          code: 'TASK_FAILED',
          message: 'Upload verification failed.',
          retryable: false,
        },
      );
    }
    if (Date.now() >= deadline) {
      throw new ApiClientError(408, {
        code: 'INTERNAL',
        message:
          'Upload verification is taking longer than expected. The task will continue safely in the background.',
        retryable: true,
      });
    }
    onProgress(Math.min(0.99, 0.92 + current.task.progress * 0.0007));
    await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
    pollDelayMs = Math.min(3_000, Math.round(pollDelayMs * 1.5));
  }
}

export function isUnauthenticated(err: unknown): boolean {
  return err instanceof ApiClientError && err.status === 401;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError)
    return err.errorRef ? `${err.message} (ref ${err.errorRef})` : err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
