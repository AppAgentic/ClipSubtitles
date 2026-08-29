import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { TranscriptWord } from '@clipsubtitles/contracts';
import { deterministicId } from './ids';
import { DEFAULT_SEGMENTATION } from './presets';
import { evaluateCaptions, pagesCoverWords } from './qa';
import { segmentWords } from './segmentation';
import { wordsFromText } from './test-utils';

const params = DEFAULT_SEGMENTATION;

describe('segmentWords', () => {
  it('returns no pages for no words', () => {
    expect(segmentWords([], params)).toEqual([]);
  });

  it('covers every word exactly once, in order, with lines tiling each page', () => {
    const words = wordsFromText(
      'So today I want to show you the fastest way to caption a video. | It takes about thirty seconds, and you never have to retype a single word. Ready? Let us go.',
    );
    const pages = segmentWords(words, params);
    expect(pagesCoverWords(words, pages)).toBe(true);
    const qa = evaluateCaptions(words, pages, params);
    expect(qa.fidelity).toBe(true);
    expect(pages.flatMap((p) => p.lines.map((l) => l.text)).join(' ')).toBe(words.map((w) => w.text).join(' '));
  });

  it('breaks at sentence boundaries and long pauses rather than mid-phrase', () => {
    const words = wordsFromText('I love this app. | It saves me hours every week and my captions look great.');
    const pages = segmentWords(words, params);
    const firstPage = pages[0];
    expect(firstPage).toBeDefined();
    // "I love this app." (4 words) should end the first page.
    expect(firstPage?.text).toBe('I love this app.');
  });

  it('never exceeds maxWordsPerPage', () => {
    const words = wordsFromText(Array.from({ length: 60 }, (_, i) => `word${i}`).join(' '));
    const pages = segmentWords(words, { ...params, maxWordsPerPage: 5 });
    for (const p of pages) expect(p.endWordIndex - p.startWordIndex + 1).toBeLessThanOrEqual(5);
  });

  it('honours forced and forbidden breaks', () => {
    const words = wordsFromText('one two three four five six seven eight');
    const forced = segmentWords(words, params, { forcedBreaks: new Set([3]) });
    expect(forced.some((p) => p.startWordIndex === 3)).toBe(true);
    expect(forced.find((p) => p.startWordIndex === 3)?.manual).toBe(true);

    const forbidden = segmentWords(words, { ...params, maxWordsPerPage: 4 }, { forbiddenBreaks: new Set([4]) });
    expect(forbidden.some((p) => p.startWordIndex === 4)).toBe(false);
    expect(pagesCoverWords(words, forbidden)).toBe(true);
  });

  it('is deterministic for identical input', () => {
    const words = wordsFromText('the quick brown fox jumps over the lazy dog | and keeps running through the field');
    const a = segmentWords(words, params, { seed: 'rev_a' });
    const b = segmentWords(words, params, { seed: 'rev_a' });
    expect(a).toEqual(b);
    expect(a[0]?.id).toMatch(/^pg_/);
  });

  it('page timing never overlaps the next page and extends into silence up to tailPaddingMs', () => {
    const words = wordsFromText('hello there | general kenobi', { pauseMs: 2000 });
    const pages = segmentWords(words, params);
    expect(pages.length).toBe(2);
    const [a, b] = pages;
    expect(a && b && a.endMs <= b.startMs).toBe(true);
    const lastWordOfA = words[a?.endWordIndex ?? 0];
    expect(a && lastWordOfA && a.endMs - lastWordOfA.endMs).toBeLessThanOrEqual(params.tailPaddingMs);
  });

  it('property: fidelity holds for random transcripts and parameters', () => {
    const wordArb = fc.record({
      text: fc.stringMatching(/^[a-zA-Z]{1,12}[.,!?]?$/),
      dur: fc.integer({ min: 40, max: 900 }),
      gap: fc.integer({ min: 0, max: 1500 }),
    });
    fc.assert(
      fc.property(
        fc.array(wordArb, { minLength: 1, maxLength: 80 }),
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 10, max: 60 }),
        fc.constantFrom(1, 2, 3),
        (specs, maxWords, maxCharsPerLine, maxLines) => {
          let cursor = 0;
          const words: TranscriptWord[] = specs.map((s, i) => {
            const start = cursor + s.gap;
            const end = start + s.dur;
            cursor = end;
            return { id: deterministicId('word', `p:${i}`), text: s.text, startMs: start, endMs: end };
          });
          const p = {
            ...params,
            maxWordsPerPage: maxWords,
            maxCharsPerLine,
            maxLinesPerPage: maxLines as 1 | 2 | 3,
            maxCharsPerPage: Math.max(12, maxCharsPerLine * maxLines),
          };
          const pages = segmentWords(words, p);
          const qa = evaluateCaptions(words, pages, p);
          expect(qa.fidelity).toBe(true);
          for (const page of pages) {
            expect(page.endWordIndex - page.startWordIndex + 1).toBeLessThanOrEqual(maxWords);
            expect(page.lines.length).toBeLessThanOrEqual(maxLines);
            expect(page.endMs).toBeGreaterThan(page.startMs);
          }
          for (let i = 1; i < pages.length; i += 1) {
            expect(pages[i]!.startMs).toBeGreaterThanOrEqual(pages[i - 1]!.endMs);
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});
