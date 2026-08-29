import { describe, expect, it } from 'vitest';
import { DEFAULT_SEGMENTATION } from './presets';
import { segmentWords } from './segmentation';
import { toSrt, toVtt } from './subtitles';
import { wordsFromText } from './test-utils';

describe('subtitle writers', () => {
  const words = wordsFromText('Hello there. | This is a second caption page for testing.');
  const pages = segmentWords(words, DEFAULT_SEGMENTATION);

  it('writes valid SRT with sequential indices and comma millis', () => {
    const srt = toSrt(pages);
    expect(srt.startsWith('1\n00:00:00,000 --> ')).toBe(true);
    expect(srt).toContain('\n\n2\n');
    expect(srt).toMatch(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
    expect(srt).toContain('Hello there.');
  });

  it('writes WEBVTT header and dot millis', () => {
    const vtt = toVtt(pages);
    expect(vtt.startsWith('WEBVTT\n\n1\n')).toBe(true);
    expect(vtt).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/);
    expect(vtt).not.toContain(',');
  });

  it('preserves the exact transcript text across cues', () => {
    const srt = toSrt(pages);
    const cueText = srt
      .split('\n')
      .filter((line) => line && !/^\d+$/.test(line) && !line.includes('-->'))
      .join(' ');
    expect(cueText).toBe(words.map((w) => w.text).join(' '));
  });
});
