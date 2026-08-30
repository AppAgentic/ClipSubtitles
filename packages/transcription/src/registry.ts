import { ElevenLabsScribeProvider } from './adapters/elevenlabs';
import { GeminiTranscribeProvider } from './adapters/gemini';
import { MOCK_PROFILES, MockTranscriptionProvider } from './mock';
import type { TranscriptionProvider } from './provider';
import type { TruthSource } from './truth';

export interface ProviderEnv {
  TRANSCRIPTION_PROVIDERS?: string | undefined;
  GEMINI_API_KEY?: string | undefined;
  GEMINI_TRANSCRIBE_MODEL?: string | undefined;
  ELEVENLABS_API_KEY?: string | undefined;
  ELEVENLABS_SCRIBE_MODEL?: string | undefined;
  /** Optional list prices for cost scoring, e.g. BENCHMARK_USD_PER_MINUTE_GEMINI=0.01 */
  [key: `BENCHMARK_USD_PER_MINUTE_${string}`]: string | undefined;
}

export const KNOWN_PROVIDER_IDS = [
  'mock',
  'mock-noisy',
  'mock-drifty',
  'mock-flaky',
  'gemini',
  'elevenlabs',
] as const;
export type KnownProviderId = (typeof KNOWN_PROVIDER_IDS)[number];

export interface ProviderRegistry {
  all: TranscriptionProvider[];
  byId(id: string): TranscriptionProvider | undefined;
  /** The configured fallback chain in order (from TRANSCRIPTION_PROVIDERS). */
  chain: TranscriptionProvider[];
}

function price(env: ProviderEnv, id: string): number | null {
  const key = `BENCHMARK_USD_PER_MINUTE_${id.toUpperCase().replace(/-/g, '_')}` as const;
  const raw = env[key];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function createProviderRegistry(
  env: ProviderEnv,
  deps: { truthSources?: TruthSource[] } = {},
): ProviderRegistry {
  const mockOpts = deps.truthSources ? { truthSources: deps.truthSources } : {};
  const all: TranscriptionProvider[] = [
    ...Object.values(MOCK_PROFILES).map(
      (profile) => new MockTranscriptionProvider({ ...mockOpts, profile }),
    ),
    new GeminiTranscribeProvider({
      ...(env.GEMINI_API_KEY ? { apiKey: env.GEMINI_API_KEY } : {}),
      ...(env.GEMINI_TRANSCRIBE_MODEL ? { model: env.GEMINI_TRANSCRIBE_MODEL } : {}),
      usdPerMinute: price(env, 'gemini'),
    }),
    new ElevenLabsScribeProvider({
      ...(env.ELEVENLABS_API_KEY ? { apiKey: env.ELEVENLABS_API_KEY } : {}),
      ...(env.ELEVENLABS_SCRIBE_MODEL ? { model: env.ELEVENLABS_SCRIBE_MODEL } : {}),
      usdPerMinute: price(env, 'elevenlabs'),
    }),
  ];
  const byId = (id: string) => all.find((p) => p.id === id);
  const ids = (env.TRANSCRIPTION_PROVIDERS ?? 'mock')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const chain: TranscriptionProvider[] = [];
  for (const id of ids) {
    const p = byId(id);
    if (p) chain.push(p);
  }
  if (chain.length === 0) {
    const fallback = byId('mock');
    if (fallback) chain.push(fallback);
  }
  return { all, byId, chain };
}
