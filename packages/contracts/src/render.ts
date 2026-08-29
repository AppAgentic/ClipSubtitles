import { z } from 'zod';
import { ExportIdSchema, IdempotencyKeySchema, ProjectIdSchema, QuoteIdSchema, TaskIdSchema } from './ids';
import { LIMITS } from './limits';
import { MsSchema } from './transcript';

export const OUTPUT_KINDS = ['mp4', 'overlay', 'srt', 'vtt'] as const;
export const OutputKindSchema = z.enum(OUTPUT_KINDS);
export type OutputKind = z.infer<typeof OutputKindSchema>;

export const ResolutionSchema = z.enum(['720p', '1080p', 'source']);
export type Resolution = z.infer<typeof ResolutionSchema>;

export const PreviewResolutionSchema = z.enum(['360p', '480p', '720p']);
export type PreviewResolution = z.infer<typeof PreviewResolutionSchema>;

export const FpsSchema = z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60), z.literal('source')]);

/** Immutable output settings captured by a quote. */
export const OutputSettingsSchema = z
  .object({
    outputs: z
      .array(OutputKindSchema)
      .min(1)
      .max(LIMITS.maxExportsPerRender)
      .refine((arr) => new Set(arr).size === arr.length, 'outputs must be unique'),
    resolution: ResolutionSchema,
    fps: FpsSchema,
    quality: z.enum(['standard', 'high']),
  })
  .strict().meta({ id: 'OutputSettings' });
export type OutputSettings = z.infer<typeof OutputSettingsSchema>;

export const DEFAULT_OUTPUT_SETTINGS: OutputSettings = {
  outputs: ['mp4', 'srt'],
  resolution: '1080p',
  fps: 'source',
  quality: 'standard',
};

export const ExpectedOutputSchema = z.object({
  kind: OutputKindSchema,
  container: z.string().max(16),
  mimeType: z.string().max(64),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  priced: z.boolean(),
  credits: z.number().int().nonnegative(),
}).meta({ id: 'ExpectedOutput' });
export type ExpectedOutput = z.infer<typeof ExpectedOutputSchema>;

export const QuoteStatusSchema = z.enum(['open', 'consumed', 'expired', 'invalidated']);

/**
 * Immutable render quote. Any change to project version, style, settings, or
 * price invalidates it; approval must echo the quoted credits exactly.
 */
export const RenderQuoteSchema = z.object({
  id: QuoteIdSchema,
  projectId: ProjectIdSchema,
  projectVersion: z.number().int().positive(),
  contentHash: z.string().length(64),
  settings: OutputSettingsSchema,
  expectedOutputs: z.array(ExpectedOutputSchema).max(LIMITS.maxExportsPerRender),
  durationMs: MsSchema,
  billableMinutes: z.number().nonnegative(),
  creditCost: z.number().int().nonnegative(),
  priceVersion: z.string().max(32),
  status: QuoteStatusSchema,
  invalidatedReason: z.string().max(200).optional(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
}).meta({ id: 'RenderQuote' });
export type RenderQuote = z.infer<typeof RenderQuoteSchema>;

export const CreateRenderQuoteRequestSchema = z
  .object({
    settings: OutputSettingsSchema.optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict().meta({ id: 'CreateRenderQuoteRequest' });
export type CreateRenderQuoteRequest = z.infer<typeof CreateRenderQuoteRequestSchema>;

export const CreateRenderRequestSchema = z
  .object({
    quoteId: QuoteIdSchema,
    approvedCreditCost: z.number().int().nonnegative().describe('Must equal the quote creditCost exactly'),
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict().meta({ id: 'CreateRenderRequest' });
export type CreateRenderRequest = z.infer<typeof CreateRenderRequestSchema>;

export const CreatePreviewRequestSchema = z
  .object({
    startMs: MsSchema.optional(),
    durationMs: z.number().int().min(LIMITS.minPreviewDurationMs).max(LIMITS.maxPreviewDurationMs).optional(),
    resolution: PreviewResolutionSchema.optional(),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict().meta({ id: 'CreatePreviewRequest' });
export type CreatePreviewRequest = z.infer<typeof CreatePreviewRequestSchema>;

export const ExportKindSchema = z.enum([...OUTPUT_KINDS, 'preview']);
export type ExportKind = z.infer<typeof ExportKindSchema>;

export const ExportSchema = z.object({
  id: ExportIdSchema,
  kind: ExportKindSchema,
  projectId: ProjectIdSchema,
  taskId: TaskIdSchema,
  projectVersion: z.number().int().positive(),
  contentHash: z.string().length(64),
  fileName: z.string().max(200),
  mimeType: z.string().max(64),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: MsSchema.optional(),
  status: z.enum(['available', 'purged']),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  downloadUrl: z.string().max(2048).optional().describe('Short-lived signed URL'),
  downloadUrlExpiresAt: z.iso.datetime().optional(),
}).meta({ id: 'Export' });
export type Export = z.infer<typeof ExportSchema>;

export const ExportListSchema = z.object({ exports: z.array(ExportSchema).max(200) });
