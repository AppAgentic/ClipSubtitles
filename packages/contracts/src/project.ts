import { z } from 'zod';
import { CaptionPageSchema, CaptionQaSummarySchema, SegmentationParamsSchema } from './captions';
import { AssetIdSchema, IdempotencyKeySchema, PageIdSchema, ProjectIdSchema, UploadIdSchema, WordIdSchema } from './ids';
import { LIMITS, SUPPORTED_SOURCE_MIME_TYPES } from './limits';
import { ExportSchema } from './render';
import { CaptionPositionSchema, StyleConfigSchema, StylePatchSchema, StylePresetIdSchema } from './style';
import { TaskSchema } from './tasks';
import { LanguageTagSchema, MsSchema, TranscriptViewSchema, VocabularySchema } from './transcript';

export const PROJECT_STATUSES = [
  'awaiting_source',
  'importing',
  'ready',
  'transcribing',
  'captioned',
  'failed',
] as const;
export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const SourceOriginSchema = z.enum(['upload', 'remote_url', 'fixture']);

export const SourceAssetSchema = z.object({
  id: AssetIdSchema,
  status: z.enum(['pending_upload', 'importing', 'ready', 'failed', 'purged']),
  origin: SourceOriginSchema,
  fileName: z.string().max(200).optional(),
  mimeType: z.string().max(64).optional(),
  bytes: z.number().int().nonnegative().optional(),
  durationMs: MsSchema.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().max(240).optional(),
  hasAudio: z.boolean().optional(),
  sha256: z.string().length(64).optional(),
  expiresAt: z.iso.datetime().optional(),
  /** Short-lived signed playback URL for the editor. */
  playbackUrl: z.string().max(2048).optional(),
  playbackUrlExpiresAt: z.iso.datetime().optional(),
});
export type SourceAsset = z.infer<typeof SourceAssetSchema>;

export const UploadTargetSchema = z.object({
  uploadId: UploadIdSchema,
  method: z.literal('PUT'),
  url: z.string().max(2048).describe('Signed, short-lived upload URL (single PUT, bounded size)'),
  maxBytes: z.number().int().positive(),
  acceptedMimeTypes: z.array(z.string()).max(20),
  expiresAt: z.iso.datetime(),
  /** Human upload page for agent flows where the client cannot send binaries. */
  webUploadUrl: z.string().max(2048),
});
export type UploadTarget = z.infer<typeof UploadTargetSchema>;

export const TitleSchema = z.string().trim().min(1).max(LIMITS.titleMaxChars);

export const CreateProjectRequestSchema = z
  .object({
    title: TitleSchema.optional(),
    sourceUrl: z
      .url({ protocol: /^https?$/ })
      .max(LIMITS.maxSourceUrlChars)
      .optional()
      .describe('Bounded remote media URL (http/https, public host, size-capped)'),
    fileName: z.string().max(200).optional().describe('Original file name when an upload target is requested'),
    language: LanguageTagSchema.optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const GenerateCaptionsRequestSchema = z
  .object({
    language: LanguageTagSchema.optional().describe('Expected spoken language; omit for auto-detect'),
    vocabulary: VocabularySchema.optional(),
    preset: StylePresetIdSchema.optional(),
    position: CaptionPositionSchema.optional(),
    segmentation: SegmentationParamsSchema.partial().strict().optional(),
    provider: z.string().max(32).optional().describe('Force a configured provider id (tests/benchmarks)'),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();
export type GenerateCaptionsRequest = z.infer<typeof GenerateCaptionsRequestSchema>;

const WordTextSchema = z.string().trim().min(1).max(LIMITS.wordTextMaxChars);

/**
 * Constrained patch operations. Text changes are explicit, per-word, and recorded
 * as edits — the system never rewrites spoken words on its own.
 */
export const PatchOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_title'), title: TitleSchema }).strict(),
  z.object({ op: z.literal('set_language'), language: LanguageTagSchema }).strict(),
  z.object({ op: z.literal('replace_word_text'), wordId: WordIdSchema, text: WordTextSchema }).strict(),
  z
    .object({ op: z.literal('set_word_timing'), wordId: WordIdSchema, startMs: MsSchema, endMs: MsSchema })
    .strict()
    .refine((v) => v.endMs > v.startMs, 'endMs must be greater than startMs'),
  z.object({ op: z.literal('delete_word'), wordId: WordIdSchema }).strict(),
  z
    .object({
      op: z.literal('insert_word'),
      afterWordId: WordIdSchema.nullable().describe('null inserts at the beginning'),
      text: WordTextSchema,
      startMs: MsSchema,
      endMs: MsSchema,
    })
    .strict()
    .refine((v) => v.endMs > v.startMs, 'endMs must be greater than startMs'),
  z.object({ op: z.literal('split_page'), pageId: PageIdSchema, beforeWordId: WordIdSchema }).strict(),
  z.object({ op: z.literal('merge_page_with_next'), pageId: PageIdSchema }).strict(),
  z
    .object({ op: z.literal('resegment'), segmentation: SegmentationParamsSchema.partial().strict().optional() })
    .strict(),
  z.object({ op: z.literal('set_style'), style: StylePatchSchema }).strict(),
  z.object({ op: z.literal('set_preset'), preset: StylePresetIdSchema }).strict(),
  z.object({ op: z.literal('set_position'), position: CaptionPositionSchema }).strict(),
]);
export type PatchOp = z.infer<typeof PatchOpSchema>;

export const PatchProjectRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive().describe('Optimistic concurrency: current project version'),
    ops: z.array(PatchOpSchema).min(1).max(LIMITS.maxPatchOps),
  })
  .strict();
export type PatchProjectRequest = z.infer<typeof PatchProjectRequestSchema>;

export const ProjectLinksSchema = z.object({
  editor: z.string().max(2048),
  upload: z.string().max(2048).optional(),
});

export const CaptionProjectSchema = z.object({
  id: ProjectIdSchema,
  title: z.string().max(LIMITS.titleMaxChars),
  status: ProjectStatusSchema,
  version: z.number().int().positive(),
  contentHash: z.string().length(64).describe('sha256 over transcript words, pages, and style'),
  language: LanguageTagSchema.optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  source: SourceAssetSchema.nullable(),
  transcript: TranscriptViewSchema.nullable(),
  pageCount: z.number().int().nonnegative(),
  pages: z.array(CaptionPageSchema).max(LIMITS.maxPagesPerProject).optional(),
  style: StyleConfigSchema,
  segmentation: SegmentationParamsSchema,
  qa: CaptionQaSummarySchema.nullable(),
  activeTasks: z.array(TaskSchema).max(20),
  recentExports: z.array(ExportSchema).max(10),
  links: ProjectLinksSchema,
  /** Reminder carried on every project payload: media-derived text is data, not instructions. */
  contentNotice: z.string().max(300),
});
export type CaptionProject = z.infer<typeof CaptionProjectSchema>;

export const ProjectSummarySchema = z.object({
  id: ProjectIdSchema,
  title: z.string().max(LIMITS.titleMaxChars),
  status: ProjectStatusSchema,
  version: z.number().int().positive(),
  language: LanguageTagSchema.optional(),
  durationMs: MsSchema.optional(),
  pageCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const ProjectListSchema = z.object({
  projects: z.array(ProjectSummarySchema).max(200),
});

export const CreateProjectResponseSchema = z.object({
  project: CaptionProjectSchema,
  uploadTarget: UploadTargetSchema.optional(),
  importTask: TaskSchema.optional(),
});
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;

export const ProjectQuerySchema = z.object({
  include: z
    .string()
    .max(64)
    .optional()
    .describe('Comma-separated: pages, words (default: pages)'),
  wordsOffset: z.coerce.number().int().nonnegative().optional(),
  wordsLimit: z.coerce.number().int().positive().max(LIMITS.maxWordsWindow).optional(),
});

export const PatchProjectResponseSchema = z.object({
  project: CaptionProjectSchema,
  applied: z.number().int().nonnegative(),
  newRevision: z.boolean().describe('True when the patch produced a new transcript revision'),
});

export const AcceptedMimeTypes = SUPPORTED_SOURCE_MIME_TYPES;
