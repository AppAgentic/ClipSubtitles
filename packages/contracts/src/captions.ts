import { z } from 'zod';
import { LIMITS } from './limits';
import { PageIdSchema } from './ids';
import { MsSchema } from './transcript';

/**
 * Segmentation parameters. Semantic + prosody-aware grouping never rewrites
 * words; it only chooses where pages and lines break.
 */
export const SegmentationParamsSchema = z.object({
  maxCharsPerPage: z.number().int().min(12).max(120),
  maxLinesPerPage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  maxCharsPerLine: z.number().int().min(10).max(60),
  maxPageDurationMs: z.number().int().min(800).max(10_000),
  minPageDurationMs: z.number().int().min(200).max(3_000),
  maxWordsPerPage: z.number().int().min(1).max(30),
  /** Pause (ms) treated as a strong prosodic boundary. */
  pauseBreakMs: z.number().int().min(80).max(2_000),
  /** Target reading speed in characters per second; pages over this are penalised. */
  targetCps: z.number().min(8).max(30),
  /** Hard reading-speed ceiling used by QA. */
  maxCps: z.number().min(10).max(40),
  /** Extend page end into following silence up to this many ms (readability). */
  tailPaddingMs: z.number().int().min(0).max(1_000),
}).meta({ id: 'SegmentationParams' });
export type SegmentationParams = z.infer<typeof SegmentationParamsSchema>;

export const CaptionLineSchema = z.object({
  startWordIndex: z.number().int().nonnegative(),
  endWordIndex: z.number().int().nonnegative().describe('Inclusive'),
  text: z.string().max(LIMITS.wordTextMaxChars * 30),
});
export type CaptionLine = z.infer<typeof CaptionLineSchema>;

/**
 * A caption page is a contiguous, ordered range of transcript words shown
 * together. Pages never duplicate, reorder, or drop words.
 */
export const CaptionPageSchema = z.object({
  id: PageIdSchema,
  index: z.number().int().nonnegative(),
  startWordIndex: z.number().int().nonnegative(),
  endWordIndex: z.number().int().nonnegative().describe('Inclusive'),
  startMs: MsSchema,
  endMs: MsSchema,
  lines: z.array(CaptionLineSchema).min(1).max(3),
  text: z.string().max(LIMITS.wordTextMaxChars * 60),
  /** Set when the user explicitly split/merged; automatic resegmentation preserves manual breaks. */
  manual: z.boolean().optional(),
}).meta({ id: 'CaptionPage' });
export type CaptionPage = z.infer<typeof CaptionPageSchema>;

export const CaptionQaIssueSchema = z.object({
  pageId: PageIdSchema,
  kind: z.enum(['reading_speed', 'line_length', 'duration_short', 'duration_long', 'overlap', 'orphan_word']),
  severity: z.enum(['warning', 'error']),
  message: z.string().max(200),
});
export type CaptionQaIssue = z.infer<typeof CaptionQaIssueSchema>;

export const CaptionQaSummarySchema = z.object({
  pageCount: z.number().int().nonnegative(),
  issues: z.array(CaptionQaIssueSchema).max(500),
  maxCps: z.number().nonnegative(),
  averageCps: z.number().nonnegative(),
  fidelity: z.boolean().describe('True when pages cover every transcript word exactly once, in order'),
}).meta({ id: 'CaptionQaSummary' });
export type CaptionQaSummary = z.infer<typeof CaptionQaSummarySchema>;
