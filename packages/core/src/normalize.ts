import { LIMITS, type TranscriptWord } from '@clipsubtitles/contracts';
import { newId } from './ids';

/** Provider output after adapter mapping, before normalization. */
export interface RawWord {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
  speaker?: string;
  language?: string;
}

export interface NormalizeOptions {
  /** Clamp timings to the media duration when known. */
  durationMs?: number;
  /** Minimum duration assigned to zero-length words. */
  minWordMs?: number;
  /** Id factory (deterministic in fixtures/tests). */
  wordId?: (index: number) => string;
}

const PUNCTUATION_ONLY = /^[\p{P}\p{S}]+$/u;

/**
 * Normalize provider words into the product's word schema without changing
 * spoken content: trims whitespace, glues punctuation-only tokens to the
 * preceding word, repairs non-monotonic/overlapping timings minimally, splits
 * over-long tokens, and assigns stable ids.
 */
export function normalizeWords(raw: readonly RawWord[], opts: NormalizeOptions = {}): TranscriptWord[] {
  const minWordMs = opts.minWordMs ?? 40;
  const merged: RawWord[] = [];

  for (const w of raw) {
    const text = (w.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const prev = merged[merged.length - 1];
    if (PUNCTUATION_ONLY.test(text) && prev) {
      prev.text = `${prev.text}${text}`;
      prev.endMs = Math.max(prev.endMs, w.endMs);
      continue;
    }
    if (text.length > LIMITS.wordTextMaxChars) {
      const chunks = text.match(new RegExp(`.{1,${LIMITS.wordTextMaxChars}}`, 'gu')) ?? [text];
      const span = Math.max(w.endMs - w.startMs, minWordMs * chunks.length);
      chunks.forEach((chunk, i) => {
        merged.push({
          ...w,
          text: chunk,
          startMs: w.startMs + Math.round((span * i) / chunks.length),
          endMs: w.startMs + Math.round((span * (i + 1)) / chunks.length),
        });
      });
      continue;
    }
    merged.push({ ...w, text });
  }

  // Timing repair: monotonic, non-overlapping, minimum duration.
  const words: TranscriptWord[] = [];
  let cursor = 0;
  for (let i = 0; i < merged.length; i += 1) {
    const w = merged[i];
    if (!w) continue;
    let start = Math.max(0, Math.round(Number.isFinite(w.startMs) ? w.startMs : cursor));
    let end = Math.round(Number.isFinite(w.endMs) ? w.endMs : start + minWordMs);
    if (start < cursor) start = cursor;
    if (end < start + minWordMs) end = start + minWordMs;
    if (opts.durationMs !== undefined) {
      const max = Math.max(opts.durationMs, minWordMs);
      if (start > max - minWordMs) start = Math.max(cursor, max - minWordMs);
      if (end > max) end = Math.max(start + minWordMs, max);
      if (start >= end) end = start + minWordMs;
    }
    cursor = end;
    const word: TranscriptWord = {
      id: opts.wordId ? opts.wordId(i) : newId('word'),
      text: w.text,
      startMs: start,
      endMs: end,
    };
    if (w.confidence !== undefined && Number.isFinite(w.confidence)) {
      word.confidence = Math.min(1, Math.max(0, w.confidence));
    }
    if (w.speaker) word.speaker = w.speaker.slice(0, LIMITS.maxSpeakerLabelChars);
    if (w.language) word.language = w.language.slice(0, LIMITS.maxLanguageTagChars);
    words.push(word);
  }
  return words;
}

/** Re-run timing repair only (after explicit edits), keeping ids and text. */
export function repairTimings(words: readonly TranscriptWord[], minWordMs = 40): TranscriptWord[] {
  let cursor = 0;
  return words.map((w) => {
    let start = Math.max(cursor, Math.round(w.startMs));
    let end = Math.round(w.endMs);
    if (end < start + minWordMs) end = start + minWordMs;
    if (start < 0) start = 0;
    cursor = end;
    return { ...w, startMs: start, endMs: end };
  });
}

export function transcriptText(words: readonly TranscriptWord[]): string {
  return words.map((w) => w.text).join(' ');
}

export function transcriptDurationMs(words: readonly TranscriptWord[]): number {
  const last = words[words.length - 1];
  return last ? last.endMs : 0;
}
