import type { CaptionPage } from '@clipsubtitles/contracts';
import { msToSrtTimestamp, msToVttTimestamp } from './time';

function cueLines(page: CaptionPage): string[] {
  return page.lines.length ? page.lines.map((l) => l.text) : [page.text];
}

/** SubRip. Cue text is the page text verbatim (never transformed). */
export function toSrt(pages: readonly CaptionPage[]): string {
  const blocks: string[] = [];
  pages.forEach((page, i) => {
    const end = Math.max(page.endMs, page.startMs + 1);
    blocks.push(`${i + 1}\n${msToSrtTimestamp(page.startMs)} --> ${msToSrtTimestamp(end)}\n${cueLines(page).join('\n')}`);
  });
  return `${blocks.join('\n\n')}\n`;
}

/** WebVTT with cue identifiers. */
export function toVtt(pages: readonly CaptionPage[]): string {
  const blocks: string[] = ['WEBVTT', ''];
  pages.forEach((page, i) => {
    const end = Math.max(page.endMs, page.startMs + 1);
    blocks.push(`${i + 1}\n${msToVttTimestamp(page.startMs)} --> ${msToVttTimestamp(end)}\n${cueLines(page).join('\n')}\n`);
  });
  return `${blocks.join('\n')}`;
}
