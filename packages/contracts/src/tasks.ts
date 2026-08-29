import { z } from 'zod';
import { ErrorCodeSchema } from './errors';
import { AssetIdSchema, ExportIdSchema, IdempotencyKeySchema, ProjectIdSchema, RevisionIdSchema, TaskIdSchema } from './ids';
import { LIMITS } from './limits';
import { LanguageTagSchema, MsSchema } from './transcript';

export const TASK_KINDS = [
  'import_source',
  'generate_captions',
  'render_preview',
  'render_export',
  'retention_sweep',
] as const;
export const TaskKindSchema = z.enum(TASK_KINDS);
export type TaskKind = z.infer<typeof TaskKindSchema>;

export const TASK_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['succeeded', 'failed', 'cancelled'];

export const TaskErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().max(LIMITS.maxTaskErrorMessageChars),
  retryable: z.boolean(),
  errorRef: z.string().max(64).optional(),
});
export type TaskError = z.infer<typeof TaskErrorSchema>;

export const GenerateCaptionsResultSchema = z.object({
  kind: z.literal('generate_captions'),
  projectId: ProjectIdSchema,
  revisionId: RevisionIdSchema,
  projectVersion: z.number().int().positive(),
  wordCount: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  provider: z.string().max(64),
  model: z.string().max(120).optional(),
  language: LanguageTagSchema,
  fallbackFrom: z.string().max(64).optional(),
});

export const RenderPreviewResultSchema = z.object({
  kind: z.literal('render_preview'),
  projectId: ProjectIdSchema,
  exportId: ExportIdSchema,
  projectVersion: z.number().int().positive(),
  contentHash: z.string().length(64),
});

export const RenderExportResultSchema = z.object({
  kind: z.literal('render_export'),
  projectId: ProjectIdSchema,
  exportIds: z.array(ExportIdSchema).max(LIMITS.maxExportsPerRender),
  projectVersion: z.number().int().positive(),
  contentHash: z.string().length(64),
  creditsCharged: z.number().int().nonnegative(),
  reservationId: z.string().max(64),
});

export const ImportSourceResultSchema = z.object({
  kind: z.literal('import_source'),
  projectId: ProjectIdSchema,
  assetId: AssetIdSchema,
  durationMs: MsSchema,
});

export const RetentionSweepResultSchema = z.object({
  kind: z.literal('retention_sweep'),
  purgedAssets: z.number().int().nonnegative(),
  purgedExports: z.number().int().nonnegative(),
});

export const TaskResultSchema = z.discriminatedUnion('kind', [
  GenerateCaptionsResultSchema,
  RenderPreviewResultSchema,
  RenderExportResultSchema,
  ImportSourceResultSchema,
  RetentionSweepResultSchema,
]);
export type TaskResult = z.infer<typeof TaskResultSchema>;

/** Durable task as exposed publicly. Internal lease/worker fields never leave the server. */
export const TaskSchema = z.object({
  id: TaskIdSchema,
  kind: TaskKindSchema,
  status: TaskStatusSchema,
  progress: z.number().int().min(0).max(100),
  stage: z.string().max(64).optional().describe('Coarse pipeline stage for progress display'),
  projectId: ProjectIdSchema.optional(),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  cancelRequested: z.boolean(),
  idempotencyKey: IdempotencyKeySchema.optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().optional(),
  finishedAt: z.iso.datetime().optional(),
  error: TaskErrorSchema.optional(),
  result: TaskResultSchema.optional(),
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskListSchema = z.object({
  tasks: z.array(TaskSchema).max(200),
});
