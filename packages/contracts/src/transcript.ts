import { z } from 'zod';
import { LIMITS } from './limits';
import { RevisionIdSchema, WordIdSchema } from './ids';

/** BCP-47-ish language tag (e.g. en, en-US, pt-BR). */
export const LanguageTagSchema = z
  .string()
  .min(2)
  .max(LIMITS.maxLanguageTagChars)
  .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'must be a language tag such as en or en-US')
  .describe('Language tag (BCP-47 subset)');

/** Integer milliseconds. All timing in the product uses integer ms to stay deterministic. */
export const MsSchema = z.number().int().nonnegative().max(24 * 60 * 60 * 1000);

/**
 * Provider-neutral word. Providers map into this shape behind adapters; nothing
 * provider-specific escapes into the product.
 */
export const TranscriptWordSchema = z.object({
  id: WordIdSchema,
  text: z.string().min(1).max(LIMITS.wordTextMaxChars).describe('Spoken token exactly as transcribed'),
  startMs: MsSchema,
  endMs: MsSchema,
  confidence: z.number().min(0).max(1).optional().describe('Provider confidence when available'),
  speaker: z.string().max(LIMITS.maxSpeakerLabelChars).optional(),
  language: LanguageTagSchema.optional().describe('Per-word language when the provider detects code-switching'),
  edited: z.boolean().optional().describe('True when a human/agent explicitly changed the text or timing'),
}).meta({ id: 'TranscriptWord' });
export type TranscriptWord = z.infer<typeof TranscriptWordSchema>;

export const TranscriptSourceSchema = z.enum(['generated', 'edit', 'fallback', 'import']);
export type TranscriptSource = z.infer<typeof TranscriptSourceSchema>;

export const TranscriptRevisionSummarySchema = z.object({
  id: RevisionIdSchema,
  revisionNumber: z.number().int().positive(),
  source: TranscriptSourceSchema,
  provider: z.string().max(64).describe('Adapter id that produced the words (e.g. mock, elevenlabs)'),
  model: z.string().max(120).optional(),
  language: LanguageTagSchema,
  wordCount: z.number().int().nonnegative(),
  durationMs: MsSchema,
  fallbackFrom: z.string().max(64).optional().describe('Provider that failed before fallback produced this revision'),
  parentRevisionId: RevisionIdSchema.optional(),
  createdAt: z.iso.datetime(),
}).meta({ id: 'TranscriptRevisionSummary' });
export type TranscriptRevisionSummary = z.infer<typeof TranscriptRevisionSummarySchema>;

export const WordsWindowSchema = z.object({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(LIMITS.maxWordsWindow),
  total: z.number().int().nonnegative(),
});
export type WordsWindow = z.infer<typeof WordsWindowSchema>;

/** Transcript view returned inside a project: summary + optional word window. */
export const TranscriptViewSchema = TranscriptRevisionSummarySchema.extend({
  words: z.array(TranscriptWordSchema).max(LIMITS.maxWordsWindow).optional(),
  wordsWindow: WordsWindowSchema.optional(),
}).meta({ id: 'TranscriptView' });
export type TranscriptView = z.infer<typeof TranscriptViewSchema>;

/** Vocabulary hints passed to transcription adapters (never treated as instructions). */
export const VocabularySchema = z
  .array(z.string().min(1).max(LIMITS.vocabularyTermMaxChars))
  .max(LIMITS.maxVocabularyTerms)
  .describe('Proper nouns / domain terms to bias recognition');
