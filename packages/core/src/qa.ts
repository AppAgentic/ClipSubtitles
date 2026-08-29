import type { CaptionPage, CaptionQaIssue, CaptionQaSummary, SegmentationParams, TranscriptWord } from '@clipsubtitles/contracts';

/**
 * Deterministic caption QA. `fidelity` is the invariant that matters most:
 * every transcript word appears exactly once, in order, across pages and lines.
 */
export function evaluateCaptions(
  words: readonly TranscriptWord[],
  pages: readonly CaptionPage[],
  params: SegmentationParams,
): CaptionQaSummary {
  const issues: CaptionQaIssue[] = [];
  let fidelity = true;
  let expected = 0;
  let maxCps = 0;
  let cpsSum = 0;

  for (let p = 0; p < pages.length; p += 1) {
    const page = pages[p];
    if (!page) continue;
    if (page.startWordIndex !== expected || page.endWordIndex < page.startWordIndex) fidelity = false;
    expected = page.endWordIndex + 1;

    // Lines must tile the page range exactly.
    let lineCursor = page.startWordIndex;
    for (const line of page.lines) {
      if (line.startWordIndex !== lineCursor || line.endWordIndex < line.startWordIndex) fidelity = false;
      lineCursor = line.endWordIndex + 1;
      const expectedText = words
        .slice(line.startWordIndex, line.endWordIndex + 1)
        .map((w) => w.text)
        .join(' ');
      if (line.text !== expectedText) fidelity = false;
      if (line.text.length > params.maxCharsPerLine) {
        issues.push({
          pageId: page.id,
          kind: 'line_length',
          severity: 'warning',
          message: `Line has ${line.text.length} characters (limit ${params.maxCharsPerLine}).`,
        });
      }
    }
    if (lineCursor !== page.endWordIndex + 1) fidelity = false;

    const expectedPageText = words
      .slice(page.startWordIndex, page.endWordIndex + 1)
      .map((w) => w.text)
      .join(' ');
    if (page.text !== expectedPageText) fidelity = false;

    const durationMs = Math.max(1, page.endMs - page.startMs);
    const cps = page.text.length / (durationMs / 1000);
    maxCps = Math.max(maxCps, cps);
    cpsSum += cps;
    if (cps > params.maxCps) {
      issues.push({
        pageId: page.id,
        kind: 'reading_speed',
        severity: 'error',
        message: `Reading speed ${cps.toFixed(1)} cps exceeds ${params.maxCps}.`,
      });
    } else if (cps > params.targetCps * 1.25) {
      issues.push({
        pageId: page.id,
        kind: 'reading_speed',
        severity: 'warning',
        message: `Reading speed ${cps.toFixed(1)} cps is above target ${params.targetCps}.`,
      });
    }
    if (durationMs < params.minPageDurationMs) {
      issues.push({
        pageId: page.id,
        kind: 'duration_short',
        severity: 'warning',
        message: `Page shows for ${durationMs} ms (minimum ${params.minPageDurationMs}).`,
      });
    }
    if (durationMs > params.maxPageDurationMs * 1.5) {
      issues.push({
        pageId: page.id,
        kind: 'duration_long',
        severity: 'warning',
        message: `Page shows for ${durationMs} ms (maximum ${params.maxPageDurationMs}).`,
      });
    }
    const next = pages[p + 1];
    if (next && page.endMs > next.startMs) {
      fidelity = fidelity && false;
      issues.push({ pageId: page.id, kind: 'overlap', severity: 'error', message: 'Page overlaps the next page.' });
    }
    if (page.endWordIndex === page.startWordIndex && pages.length > 1) {
      issues.push({ pageId: page.id, kind: 'orphan_word', severity: 'warning', message: 'Single-word page.' });
    }
  }
  if (expected !== words.length) fidelity = false;

  return {
    pageCount: pages.length,
    issues: issues.slice(0, 500),
    maxCps: round1(maxCps),
    averageCps: pages.length ? round1(cpsSum / pages.length) : 0,
    fidelity,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** True when pages cover words exactly once in order (cheap check used by services). */
export function pagesCoverWords(words: readonly TranscriptWord[], pages: readonly CaptionPage[]): boolean {
  let expected = 0;
  for (const page of pages) {
    if (page.startWordIndex !== expected) return false;
    expected = page.endWordIndex + 1;
  }
  return expected === words.length;
}
