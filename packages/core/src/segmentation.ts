import type { CaptionLine, CaptionPage, SegmentationParams, TranscriptWord } from '@clipsubtitles/contracts';
import { deterministicId } from './ids';
import { breakLines } from './lines';

export interface SegmentationConstraints {
  /** Word indices that must start a new page (manual splits). */
  forcedBreaks?: ReadonlySet<number>;
  /** Word indices where a page may NOT start (manual merges). */
  forbiddenBreaks?: ReadonlySet<number>;
  /** Seed for deterministic page ids. */
  seed?: string;
}

const SENTENCE_END = /[.!?…]["')\]]?$/u;
const CLAUSE_END = /[,;:—–-]["')\]]?$/u;
const OPEN_QUOTE = /^["'([¿¡]/u;

/** Words that usually begin a new clause — a good place to break BEFORE them. */
const CLAUSE_STARTERS = new Set([
  'and', 'but', 'so', 'because', 'which', 'that', 'when', 'while', 'if', 'then', 'or', 'nor', 'yet',
  'although', 'though', 'since', 'unless', 'until', 'after', 'before', 'where', 'whereas', 'however',
  'actually', 'basically', 'honestly', 'literally', 'okay', 'ok', 'now', 'also', 'plus',
  'y', 'pero', 'porque', 'entonces', 'cuando', 'aunque', 'e', 'mas', 'então', 'quando', 'et', 'mais',
  'donc', 'parce', 'quand', 'und', 'aber', 'weil', 'dann', 'wenn',
]);

/** Function words that should not be stranded at the end of a page. */
const WEAK_TAIL = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'my', 'your', 'our', 'their', 'his',
  'her', 'its', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'i', 'you',
  'we', 'they', 'he', 'she', 'it', 'not', "don't", 'very', 'really', 'just', 'el', 'la', 'los', 'las',
  'un', 'una', 'de', 'del', 'en', 'le', 'les', 'des', 'du', 'der', 'die', 'das', 'ein', 'eine',
]);

function lower(text: string): string {
  return text.toLowerCase().replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
}

interface BoundaryScore {
  /** Negative = good place to break, positive = bad. */
  score: number;
  strong: boolean;
}

/**
 * Score the boundary BEFORE word `i` (i.e. between words i-1 and i) using
 * prosody (pause length) and light semantics (punctuation, clause starters).
 */
export function boundaryScore(words: readonly TranscriptWord[], i: number, params: SegmentationParams): BoundaryScore {
  const prev = words[i - 1];
  const next = words[i];
  if (!prev || !next) return { score: 0, strong: true };
  let score = 0;
  let strong = false;
  const gap = next.startMs - prev.endMs;

  if (gap >= params.pauseBreakMs) {
    score -= 4 + Math.min(4, gap / params.pauseBreakMs);
    strong = true;
  } else if (gap >= params.pauseBreakMs / 2) {
    score -= 1.5;
  } else if (gap < 60) {
    score += 1.2; // tightly connected speech
  }

  if (SENTENCE_END.test(prev.text)) {
    score -= 6;
    strong = true;
  } else if (CLAUSE_END.test(prev.text)) {
    score -= 3;
  }
  if (OPEN_QUOTE.test(next.text)) score -= 1;
  if (CLAUSE_STARTERS.has(lower(next.text))) score -= 2;
  if (WEAK_TAIL.has(lower(prev.text))) score += 3; // avoid "…the | cat"
  if (prev.speaker && next.speaker && prev.speaker !== next.speaker) {
    score -= 5;
    strong = true;
  }
  return { score, strong };
}

function pageChars(words: readonly TranscriptWord[], j: number, i: number): number {
  let chars = 0;
  for (let k = j; k < i; k += 1) chars += (words[k]?.text.length ?? 0) + (k > j ? 1 : 0);
  return chars;
}

/**
 * Semantic + prosody-aware segmentation via dynamic programming. Pages are
 * contiguous word ranges; the algorithm chooses break points only — it never
 * inserts, removes, or rewrites words.
 */
export function segmentWords(
  words: readonly TranscriptWord[],
  params: SegmentationParams,
  constraints: SegmentationConstraints = {},
): CaptionPage[] {
  const n = words.length;
  if (n === 0) return [];
  const forced = constraints.forcedBreaks ?? new Set<number>();
  const forbidden = constraints.forbiddenBreaks ?? new Set<number>();
  const INF = Number.POSITIVE_INFINITY;
  const best = new Array<number>(n + 1).fill(INF);
  const from = new Array<number>(n + 1).fill(-1);
  best[0] = 0;

  const boundary: BoundaryScore[] = new Array(n + 1);
  for (let i = 1; i < n; i += 1) boundary[i] = boundaryScore(words, i, params);

  for (let i = 1; i <= n; i += 1) {
    const minJ = Math.max(0, i - params.maxWordsPerPage);
    for (let j = i - 1; j >= minJ; j -= 1) {
      if (best[j] === INF) continue;
      // A page may not start at a forbidden index (unless it's the very first word).
      if (j > 0 && forbidden.has(j)) continue;
      // A page may not contain a forced break strictly inside it.
      let containsForced = false;
      for (let k = j + 1; k < i; k += 1) {
        if (forced.has(k)) {
          containsForced = true;
          break;
        }
      }
      if (containsForced) break; // extending j further left only keeps the forced break inside

      const first = words[j];
      const last = words[i - 1];
      if (!first || !last) continue;
      const chars = pageChars(words, j, i);
      const durationMs = Math.max(1, last.endMs - first.startMs);
      const cps = chars / (durationMs / 1000);
      let cost = 0;

      if (chars > params.maxCharsPerPage) {
        if (i - j === 1) cost += 10; // single oversized word: unavoidable
        else cost += 40 + (chars - params.maxCharsPerPage) * 6;
      }
      if (durationMs > params.maxPageDurationMs) cost += 12 + (durationMs - params.maxPageDurationMs) / 250;
      if (durationMs < params.minPageDurationMs && i !== n) cost += 3;
      if (cps > params.maxCps) cost += 8 + (cps - params.maxCps) * 2;
      else if (cps > params.targetCps) cost += (cps - params.targetCps) * 0.6;

      // Fill preference: pages that are neither tiny nor bursting read best.
      const fill = chars / params.maxCharsPerPage;
      if (fill < 0.35 && i !== n) cost += (0.35 - fill) * 12;

      const wordsInPage = i - j;
      if (wordsInPage === 1 && n > 1) cost += i === n ? 6 : 4; // orphan
      if (wordsInPage === 2 && i === n && n > 4) cost += 1.5;

      // Boundary quality at the page end (before word i).
      if (i < n) {
        const b = boundary[i];
        if (b) cost += b.score;
      }
      const total = (best[j] ?? INF) + cost + 1; // +1 per page: fewer pages when equal
      if (total < (best[i] ?? INF)) {
        best[i] = total;
        from[i] = j;
      }
    }
  }

  // Reconstruct.
  const ranges: Array<[number, number]> = [];
  let i = n;
  while (i > 0) {
    const j = from[i];
    if (j === undefined || j < 0) {
      // Should not happen; fall back to greedy chunks to guarantee coverage.
      ranges.length = 0;
      for (let s = 0; s < n; s += params.maxWordsPerPage) {
        ranges.push([s, Math.min(n, s + params.maxWordsPerPage) - 1]);
      }
      break;
    }
    ranges.unshift([j, i - 1]);
    i = j;
  }

  return buildPages(words, ranges, params, constraints.seed ?? 'seg', forced);
}

export function buildPages(
  words: readonly TranscriptWord[],
  ranges: ReadonlyArray<readonly [number, number]>,
  params: SegmentationParams,
  seed: string,
  forced: ReadonlySet<number> = new Set(),
): CaptionPage[] {
  const pages: CaptionPage[] = [];
  for (let p = 0; p < ranges.length; p += 1) {
    const range = ranges[p];
    if (!range) continue;
    const [s, e] = range;
    const slice = words.slice(s, e + 1);
    const first = slice[0];
    const last = slice[slice.length - 1];
    if (!first || !last) continue;
    const next = words[e + 1];
    let endMs = last.endMs;
    const gapToNext = next ? next.startMs - last.endMs : Number.POSITIVE_INFINITY;
    // Extend into following silence for readability, never into the next page.
    endMs += Math.min(params.tailPaddingMs, Math.max(0, gapToNext - 1));
    if (endMs - first.startMs < params.minPageDurationMs) {
      endMs = Math.min(first.startMs + params.minPageDurationMs, next ? next.startMs - 1 : first.startMs + params.minPageDurationMs);
      if (endMs <= last.endMs) endMs = last.endMs;
    }
    const lineRanges = breakLines(
      slice.map((w) => w.text),
      params.maxCharsPerLine,
      params.maxLinesPerPage,
    );
    const lines: CaptionLine[] = lineRanges.map((r) => ({
      startWordIndex: s + r.start,
      endWordIndex: s + r.end,
      text: slice
        .slice(r.start, r.end + 1)
        .map((w) => w.text)
        .join(' '),
    }));
    const page: CaptionPage = {
      id: deterministicId('page', `${seed}:${s}-${e}`),
      index: p,
      startWordIndex: s,
      endWordIndex: e,
      startMs: first.startMs,
      endMs,
      lines,
      text: slice.map((w) => w.text).join(' '),
    };
    if (forced.has(s)) page.manual = true;
    pages.push(page);
  }
  return pages;
}
