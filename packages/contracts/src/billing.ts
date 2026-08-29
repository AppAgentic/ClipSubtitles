import { z } from 'zod';
import { OutputKindSchema, ResolutionSchema } from './render';

export const PRICE_VERSION = '2026-08-v1';

/**
 * Credit price table. Credits per billable output minute; subtitle files are
 * free; previews are free but rate limited. Changing any number here must bump
 * PRICE_VERSION so open quotes are invalidated rather than silently repriced.
 */
export const PRICE_TABLE = {
  version: PRICE_VERSION,
  perMinute: {
    mp4: { '720p': 6, '1080p': 10, source: 10 },
    overlay: { '720p': 6, '1080p': 8, source: 8 },
    srt: { '720p': 0, '1080p': 0, source: 0 },
    vtt: { '720p': 0, '1080p': 0, source: 0 },
  },
  highQualityMultiplier: 1.5,
  minimumPaidCredits: 2,
  previewCredits: 0,
} as const;

export const PriceTableSchema = z.object({
  version: z.string(),
  perMinute: z.record(OutputKindSchema, z.record(ResolutionSchema, z.number().nonnegative())),
  highQualityMultiplier: z.number().positive(),
  minimumPaidCredits: z.number().int().nonnegative(),
  previewCredits: z.number().int().nonnegative(),
});

export const CreditBalanceSchema = z.object({
  available: z.number().int().describe('Credits not reserved by in-flight renders'),
  reserved: z.number().int().nonnegative(),
  total: z.number().int(),
  priceVersion: z.string(),
});
export type CreditBalance = z.infer<typeof CreditBalanceSchema>;

export const LedgerEntryKindSchema = z.enum(['grant', 'reserve', 'settle', 'release', 'adjust']);
export type LedgerEntryKind = z.infer<typeof LedgerEntryKindSchema>;

export const LedgerEntrySchema = z.object({
  id: z.string().max(64),
  kind: LedgerEntryKindSchema,
  amount: z.number().int().describe('Signed credit delta on available balance'),
  availableAfter: z.number().int(),
  reservedAfter: z.number().int().nonnegative(),
  taskId: z.string().max(64).optional(),
  quoteId: z.string().max(64).optional(),
  reservationId: z.string().max(64).optional(),
  note: z.string().max(200).optional(),
  createdAt: z.iso.datetime(),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const LedgerListSchema = z.object({ entries: z.array(LedgerEntrySchema).max(500) });
