import type { CaptionPage, StyleConfig, TranscriptWord } from '@clipsubtitles/contracts';
import { sha256Hex as sha256 } from './sha256';

/**
 * Canonical JSON: recursively sorted object keys, no whitespace, `undefined`
 * members omitted, so semantically equal states hash identically.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = sortValue(v);
    return out;
  }
  return value;
}

export function sha256Hex(input: string | Uint8Array): string {
  return sha256(input);
}

export interface ContentHashInput {
  words: readonly TranscriptWord[];
  pages: readonly CaptionPage[];
  style: StyleConfig;
}

/**
 * The project content hash covers exactly what a render depends on: words
 * (text + timing), page boundaries, and style. Ids are excluded so re-created
 * but identical content hashes the same.
 */
export function computeContentHash(input: ContentHashInput): string {
  const words = input.words.map((w) => [w.text, w.startMs, w.endMs, w.speaker ?? '', w.language ?? '']);
  const pages = input.pages.map((p) => [
    p.startWordIndex,
    p.endWordIndex,
    p.startMs,
    p.endMs,
    p.lines.map((l) => [l.startWordIndex, l.endWordIndex]),
  ]);
  return sha256Hex(canonicalJson({ v: 1, words, pages, style: input.style }));
}

/** Stable fingerprint for idempotency comparisons of request bodies. */
export function fingerprint(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
