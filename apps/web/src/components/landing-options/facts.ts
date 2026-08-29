/**
 * Truthful product facts shared by every landing option. Everything here is
 * derived from `packages/contracts` (tool descriptors, enums, schemas) or the
 * README guarantees. Example identifiers follow the real id grammar
 * (`prefix_` + 16–32 chars of Crockford-style base32) and the sample quote is
 * labelled as an example wherever it is shown.
 */

export const MCP_TOOLS = [
  { name: 'create_caption_project', role: 'agent', does: 'imports a clip by upload target or URL' },
  { name: 'generate_captions', role: 'agent', does: 'word-level transcript, segmented into pages' },
  { name: 'get_caption_project', role: 'agent', does: 'reads words, pages, style, version, hash' },
  { name: 'update_caption_project', role: 'shared', does: 'explicit per-word patch ops against expectedVersion' },
  { name: 'render_caption_preview', role: 'agent', does: 'low-res preview of the exact current version' },
  { name: 'render_caption_export', role: 'shared', does: 'quote first; render only with approval' },
  { name: 'get_caption_task', role: 'agent', does: 'polls a durable task; exports carry short-lived URLs' },
  { name: 'cancel_caption_task', role: 'agent', does: 'cooperative cancel; reservation released' },
] as const;

export const STYLE_PRESETS = ['clean', 'bold-pop', 'lower-third', 'karaoke', 'minimal'] as const;
export const MOTION_PRESETS = ['none', 'soft-rise', 'spring-pop', 'karaoke-slide'] as const;

export const OUTPUTS = [
  { kind: 'mp4', label: 'MP4', container: 'mp4', detail: 'captions composited into the video' },
  { kind: 'overlay', label: 'OVERLAY', container: 'mov', detail: 'ProRes 4444, transparent caption layer' },
  { kind: 'srt', label: 'SRT', container: 'srt', detail: 'SubRip sidecar, same timings' },
  { kind: 'vtt', label: 'VTT', container: 'vtt', detail: 'WebVTT sidecar, same timings' },
] as const;

export const TASK_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;

export interface SampleWord {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  /** Text the transcript originally carried, when a human replaced it. */
  was?: string;
}

const WORDS: readonly SampleWord[] = [
  { id: 'w_01j9x4k7m2q8r5v1', text: 'we', startMs: 0, endMs: 180 },
  { id: 'w_01j9x4k7m2q8r5v2', text: 'shipped', startMs: 180, endMs: 520 },
  { id: 'w_01j9x4k7m2q8r5v3', text: 'the', startMs: 520, endMs: 640 },
  { id: 'w_01j9x4k7m2q8r5v4', text: 'update', startMs: 640, endMs: 1040 },
  { id: 'w_01j9x4k7m2q8r5v5', text: 'to', startMs: 1160, endMs: 1280 },
  { id: 'w_01j9x4k7m2q8r5v6', text: 'their', startMs: 1280, endMs: 1520, was: 'there' },
  { id: 'w_01j9x4k7m2q8r5v7', text: 'inbox', startMs: 1520, endMs: 1900 },
];

/** One 24 s vertical clip; the caption excerpt sits at 00:12. */
export const SAMPLE = {
  projectId: 'proj_01j9x4k7m2q8r5t3',
  title: 'launch-teaser-v2.mp4',
  width: 1080,
  height: 1920,
  fps: 30,
  durationMs: 24_000,
  frames: 720,
  prevVersion: 2,
  version: 3,
  hashV2: '5d41402abc4b2a76b9719d911017c5927c6f1d9e0b3a4c5d6e7f8091a2b3c4d5',
  hashV3: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
  /** Example checksum for the deterministic MP4 output shown in Frame Exact. */
  renderHash: '8a3fc7e41d0926b58c0f4a12ee8f67b99da4c7f06a7231c21bfdb258d663992e',
  quoteId: 'quote_01j9x5b2c7d4e8f9',
  taskId: 'task_01j9x6c3d8e5f2g7',
  reservationId: 'rsv_01j9x6c3d8e5f2h8',
  ledgerId: 'led_01j9x6c3d8e5f2j9',
  auditId: 'aud_01j9x7d4e9f6g3k1',
  errorRef: 'err_01j9x7d4e9f6g3m2',
  idempotencyKey: 'render-proj_01j9x4k7m2q8r5t3-v3',
  billableMinutes: 0.4,
  /** 0.4 billable minutes × 10 credits/min for MP4 at 1080p; SRT/VTT are free. */
  creditCost: 4,
  priceVersion: '2026-08-v1',
  outputs: ['mp4', 'srt'] as const,
  quoteExpiresAt: '2026-08-29T10:14:00Z',
  excerptStartMs: 12_080,
  words: WORDS,
  pages: [
    { id: 'pg_01j9x4k7m2q8r5p1', wordIds: ['w_01j9x4k7m2q8r5v1', 'w_01j9x4k7m2q8r5v2', 'w_01j9x4k7m2q8r5v3', 'w_01j9x4k7m2q8r5v4'] },
    { id: 'pg_01j9x4k7m2q8r5p2', wordIds: ['w_01j9x4k7m2q8r5v5', 'w_01j9x4k7m2q8r5v6', 'w_01j9x4k7m2q8r5v7'] },
  ],
} as const;

export const EDITED_WORD = SAMPLE.words.find((w) => w.was)!;

export function shortHash(hash: string, head = 8, tail = 4): string {
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function timecode(ms: number, fps = 30): string {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  const ff = String(Math.floor(((ms % 1000) / 1000) * fps)).padStart(2, '0');
  return `${mm}:${ss}:${ff}`;
}

/** Guarantees quoted from the README section "Guarantees the code enforces". */
export const GUARANTEES = [
  'Ownership is derived from the verified credential; tool inputs never carry a user or workspace id.',
  'Spoken words are never rewritten by the system; edits are explicit per-word operations recorded as revisions.',
  'Every edit bumps the project version; previews, renders and quotes reference an exact version and content hash.',
  'Paid renders: immutable quote → exact-cost approval → idempotent reserve → exactly-once settle or release.',
  'Duplicate render requests with the same idempotencyKey return the same task.',
  'Public errors are redacted and carry an errorRef; audit events never contain transcript text.',
] as const;
