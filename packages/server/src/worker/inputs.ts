import { z } from 'zod';
import {
  CaptionPageSchema,
  CaptionPositionSchema,
  LanguageTagSchema,
  OutputSettingsSchema,
  PreviewResolutionSchema,
  SegmentationParamsSchema,
  StyleConfigSchema,
  StylePresetIdSchema,
  VocabularySchema,
} from '@clipsubtitles/contracts';

/** Task inputs are validated on both sides of the queue. */
export const ImportSourceInputSchema = z.object({
  projectId: z.string(),
  assetId: z.string(),
  url: z.string(),
});
export type ImportSourceInput = z.infer<typeof ImportSourceInputSchema>;

export const FinalizeUploadInputSchema = z.object({
  projectId: z.string(),
  assetId: z.string(),
  uploadId: z.string(),
  stagingKey: z.string(),
  verificationKey: z.string(),
  expectedBytes: z.number().int().positive(),
  mimeType: z.string(),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export type FinalizeUploadInput = z.infer<typeof FinalizeUploadInputSchema>;

export const GenerateCaptionsInputSchema = z.object({
  projectId: z.string(),
  assetId: z.string(),
  expectedVersion: z.number().int().positive(),
  language: LanguageTagSchema.optional(),
  vocabulary: VocabularySchema.optional(),
  preset: StylePresetIdSchema.optional(),
  position: CaptionPositionSchema.optional(),
  segmentation: SegmentationParamsSchema.partial().optional(),
  provider: z.string().optional(),
});
export type GenerateCaptionsInput = z.infer<typeof GenerateCaptionsInputSchema>;

const SnapshotSchema = z.object({
  projectId: z.string(),
  assetId: z.string(),
  revisionId: z.string(),
  projectVersion: z.number().int().positive(),
  contentHash: z.string(),
  pages: z.array(CaptionPageSchema),
  style: StyleConfigSchema,
});

export const RenderPreviewInputSchema = SnapshotSchema.extend({
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  resolution: PreviewResolutionSchema,
});
export type RenderPreviewInput = z.infer<typeof RenderPreviewInputSchema>;

export const RenderExportInputSchema = SnapshotSchema.extend({
  quoteId: z.string(),
  settings: OutputSettingsSchema,
  creditCost: z.number().int().nonnegative(),
});
export type RenderExportInput = z.infer<typeof RenderExportInputSchema>;

export const RetentionSweepInputSchema = z.object({});
