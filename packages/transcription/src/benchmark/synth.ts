import { createPrng, hashSeed } from '../prng';
import type { TruthTranscript } from '../truth';
import type { BenchmarkCase } from './corpus';

/**
 * Synthesize deterministic 16-bit mono audio for a case: one tone burst per
 * ground-truth word (pitch varies per word), plus the case's background
 * noise. Not speech — enough to drive extraction, VAD, chunking, and the
 * mock providers end-to-end.
 */
export function synthesizeCaseAudio(c: BenchmarkCase, truth: TruthTranscript, durationMs: number, sampleRate = 16_000): Int16Array {
  const total = Math.ceil((durationMs / 1000) * sampleRate);
  const out = new Float32Array(total);
  const rnd = createPrng(`synth:${c.id}`);

  // Background noise.
  const level = c.audio.noiseLevel;
  if (c.audio.noise === 'hiss') {
    for (let i = 0; i < total; i += 1) out[i] = (rnd() * 2 - 1) * level * 0.5;
  } else if (c.audio.noise === 'hum') {
    for (let i = 0; i < total; i += 1) {
      const t = i / sampleRate;
      out[i] = (Math.sin(2 * Math.PI * 50 * t) * 0.7 + Math.sin(2 * Math.PI * 100 * t) * 0.3) * level;
    }
  } else if (c.audio.noise === 'music') {
    const chord = [220, 277.18, 329.63, 440];
    for (let i = 0; i < total; i += 1) {
      const t = i / sampleRate;
      let v = 0;
      for (const f of chord) v += Math.sin(2 * Math.PI * f * t) / chord.length;
      const tremolo = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.5 * t);
      out[i] = v * tremolo * level;
    }
  }

  // Word bursts.
  for (const w of truth.words) {
    const s = Math.floor((w.startMs / 1000) * sampleRate);
    const e = Math.min(total, Math.floor((w.endMs / 1000) * sampleRate));
    if (e <= s) continue;
    const variant = (hashSeed(w.text.toLowerCase()) % 9) - 4;
    const freq = c.audio.pitchHz * (1 + variant * 0.05);
    const len = e - s;
    const ramp = Math.max(1, Math.floor(sampleRate * 0.012));
    for (let i = s; i < e; i += 1) {
      const t = (i - s) / sampleRate;
      const env = Math.min(1, (i - s) / ramp, (e - i) / ramp);
      const v =
        Math.sin(2 * Math.PI * freq * t) * 0.6 +
        Math.sin(2 * Math.PI * freq * 2 * t) * 0.25 +
        Math.sin(2 * Math.PI * freq * 3 * t) * 0.15;
      out[i] = (out[i] ?? 0) + v * env * c.audio.speechLevel;
    }
  }

  const pcm = new Int16Array(total);
  for (let i = 0; i < total; i += 1) {
    const v = Math.max(-1, Math.min(1, out[i] ?? 0));
    pcm[i] = Math.round(v * 32767);
  }
  return pcm;
}
