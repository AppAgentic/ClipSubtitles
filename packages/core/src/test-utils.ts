import type { TranscriptWord } from '@clipsubtitles/contracts';
import { deterministicId } from './ids';

/**
 * Build a word list from a sentence-ish spec: `"Hello world. How are you"`.
 * Timing: each word lasts 60ms/char (min 120ms) with `gapMs` between words;
 * a `|` token inserts an extra pause of `pauseMs`.
 */
export function wordsFromText(
  text: string,
  opts: { gapMs?: number; pauseMs?: number; startMs?: number; seed?: string } = {},
): TranscriptWord[] {
  const gap = opts.gapMs ?? 40;
  const pause = opts.pauseMs ?? 600;
  const seed = opts.seed ?? 'test';
  let cursor = opts.startMs ?? 0;
  const words: TranscriptWord[] = [];
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (token === '|') {
      cursor += pause;
      continue;
    }
    const dur = Math.max(120, token.length * 60);
    words.push({
      id: deterministicId('word', `${seed}:${words.length}`),
      text: token,
      startMs: cursor,
      endMs: cursor + dur,
    });
    cursor += dur + gap;
  }
  return words;
}
