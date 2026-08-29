import { describe, expect, it } from 'vitest';
import { PRICE_TABLE } from '@clipsubtitles/contracts';
import { outputDimensions, previewDimensions, quoteRender } from './pricing';

describe('quoteRender', () => {
  const source = { width: 1080, height: 1920 };

  it('prices mp4 per started hundredth of a minute and adds free subtitle outputs', () => {
    const q = quoteRender({
      durationMs: 60_000,
      settings: { outputs: ['mp4', 'srt'], resolution: '1080p', fps: 'source', quality: 'standard' },
      source,
    });
    expect(q.billableMinutes).toBe(1);
    expect(q.creditCost).toBe(PRICE_TABLE.perMinute.mp4['1080p']);
    expect(q.expectedOutputs.find((o) => o.kind === 'srt')?.credits).toBe(0);
    expect(q.expectedOutputs.find((o) => o.kind === 'mp4')?.height).toBe(1920);
    expect(q.priceVersion).toBe(PRICE_TABLE.version);
  });

  it('applies the paid minimum and high-quality multiplier', () => {
    const q = quoteRender({
      durationMs: 1_000,
      settings: { outputs: ['mp4'], resolution: '720p', fps: 30, quality: 'standard' },
      source,
    });
    expect(q.creditCost).toBe(PRICE_TABLE.minimumPaidCredits);
    const hq = quoteRender({
      durationMs: 120_000,
      settings: { outputs: ['mp4'], resolution: '1080p', fps: 30, quality: 'high' },
      source,
    });
    expect(hq.creditCost).toBe(Math.ceil(2 * PRICE_TABLE.perMinute.mp4['1080p'] * PRICE_TABLE.highQualityMultiplier));
  });

  it('subtitle-only renders are free', () => {
    const q = quoteRender({
      durationMs: 300_000,
      settings: { outputs: ['srt', 'vtt'], resolution: 'source', fps: 'source', quality: 'standard' },
      source,
    });
    expect(q.creditCost).toBe(0);
  });

  it('is deterministic', () => {
    const input = {
      durationMs: 91_337,
      settings: { outputs: ['mp4', 'overlay', 'vtt'] as const, resolution: '1080p' as const, fps: 'source' as const, quality: 'standard' as const },
      source,
    };
    expect(quoteRender({ ...input, settings: { ...input.settings, outputs: [...input.settings.outputs] } })).toEqual(
      quoteRender({ ...input, settings: { ...input.settings, outputs: [...input.settings.outputs] } }),
    );
  });
});

describe('dimensions', () => {
  it('scales by the shorter side and keeps even dimensions', () => {
    expect(outputDimensions('720p', { width: 1080, height: 1920 })).toEqual({ width: 720, height: 1280 });
    expect(outputDimensions('1080p', { width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
    expect(outputDimensions('source', { width: 1281, height: 721 })).toEqual({ width: 1282, height: 722 });
    expect(previewDimensions('360p', { width: 1080, height: 1920 })).toEqual({ width: 360, height: 640 });
    expect(previewDimensions('720p', { width: 640, height: 360 })).toEqual({ width: 640, height: 360 });
  });
});
