import { readFile } from 'node:fs/promises';
import type { TranscriptionInput } from './provider';

/** Ground-truth transcript used by mock providers and the benchmark scorer. */
export interface TruthWord {
  text: string;
  startMs: number;
  endMs: number;
  /** True when the word belongs to a named entity / domain term. */
  entity?: boolean;
  speaker?: string;
}

export interface TruthTranscript {
  language: string;
  words: TruthWord[];
  /** Word indices that begin a new sentence (reference caption breaks). */
  sentenceStarts?: number[];
}

export interface TruthSource {
  lookup(input: TranscriptionInput): Promise<TruthTranscript | null>;
}

/** Looks for `<audio>.truth.json` next to the audio file. */
export class SidecarTruthSource implements TruthSource {
  async lookup(input: TranscriptionInput): Promise<TruthTranscript | null> {
    const candidates = [`${input.audioPath}.truth.json`, input.audioPath.replace(/\.[^.]+$/, '') + '.truth.json'];
    for (const path of candidates) {
      try {
        const raw = await readFile(path, 'utf8');
        return parseTruth(raw);
      } catch {
        // try next candidate
      }
    }
    return null;
  }
}

/** In-memory truth keyed by fixture id (benchmarks, tests). */
export class MapTruthSource implements TruthSource {
  private readonly map: Map<string, TruthTranscript>;
  constructor(entries: Record<string, TruthTranscript> | Map<string, TruthTranscript>) {
    this.map = entries instanceof Map ? entries : new Map(Object.entries(entries));
  }
  async lookup(input: TranscriptionInput): Promise<TruthTranscript | null> {
    return input.fixtureId ? (this.map.get(input.fixtureId) ?? null) : null;
  }
}

export function parseTruth(raw: string): TruthTranscript {
  const parsed = JSON.parse(raw) as Partial<TruthTranscript>;
  if (!parsed || !Array.isArray(parsed.words)) throw new Error('truth sidecar missing words');
  const words: TruthWord[] = parsed.words.map((w) => {
    const word: TruthWord = { text: String(w.text), startMs: Number(w.startMs), endMs: Number(w.endMs) };
    if (w.entity) word.entity = true;
    if (w.speaker) word.speaker = String(w.speaker);
    return word;
  });
  const truth: TruthTranscript = { language: typeof parsed.language === 'string' ? parsed.language : 'en', words };
  if (Array.isArray(parsed.sentenceStarts)) truth.sentenceStarts = parsed.sentenceStarts.map(Number);
  return truth;
}
