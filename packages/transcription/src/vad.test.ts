import { describe, expect, it } from 'vitest';
import { chunkRegions, detectSpeech, speechRatio } from './vad';

function burstSignal(sampleRate: number, bursts: Array<[number, number]>, totalMs: number, noise = 0.005): Int16Array {
  const total = Math.round((totalMs / 1000) * sampleRate);
  const out = new Int16Array(total);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < total; i += 1) out[i] = Math.round((rnd() * 2 - 1) * noise * 32767);
  for (const [s, e] of bursts) {
    const a = Math.round((s / 1000) * sampleRate);
    const b = Math.round((e / 1000) * sampleRate);
    for (let i = a; i < b && i < total; i += 1) {
      out[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.5 * 32767);
    }
  }
  return out;
}

describe('detectSpeech', () => {
  it('finds tone bursts at the right times', () => {
    const sr = 16_000;
    const regions = detectSpeech(burstSignal(sr, [[500, 1200], [2000, 2600], [3500, 4100]], 5000), sr);
    expect(regions).toHaveLength(3);
    expect(Math.abs(regions[0]!.startMs - 500)).toBeLessThanOrEqual(40);
    expect(Math.abs(regions[0]!.endMs - 1200)).toBeLessThanOrEqual(40);
    expect(Math.abs(regions[2]!.startMs - 3500)).toBeLessThanOrEqual(40);
  });

  it('bridges short gaps and ignores tiny blips', () => {
    const sr = 16_000;
    const regions = detectSpeech(burstSignal(sr, [[500, 900], [960, 1400], [3000, 3030]], 4000), sr);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.startMs).toBeLessThanOrEqual(520);
    expect(regions[0]!.endMs).toBeGreaterThanOrEqual(1380);
  });

  it('returns nothing for silence and handles empty input', () => {
    expect(detectSpeech(new Int16Array(0), 16_000)).toEqual([]);
    expect(detectSpeech(new Int16Array(16_000), 16_000)).toEqual([]);
  });

  it('chunks long regions and computes speech ratio', () => {
    const chunks = chunkRegions([{ startMs: 0, endMs: 25_000 }], 10_000);
    expect(chunks).toEqual([
      { startMs: 0, endMs: 10_000 },
      { startMs: 10_000, endMs: 20_000 },
      { startMs: 20_000, endMs: 25_000 },
    ]);
    expect(speechRatio([{ startMs: 0, endMs: 500 }], 1000)).toBe(0.5);
  });
});
