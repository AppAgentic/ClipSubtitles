import {
  PRICE_TABLE,
  type ExpectedOutput,
  type OutputKind,
  type OutputSettings,
  type Resolution,
} from '@clipsubtitles/contracts';

export interface SourceDimensions {
  width: number;
  height: number;
}

/** Resolution names refer to the SHORTER side so vertical short-form video keeps its aspect. */
export function outputDimensions(resolution: Resolution, source: SourceDimensions): SourceDimensions {
  if (resolution === 'source') return { width: even(source.width), height: even(source.height) };
  const target = resolution === '720p' ? 720 : 1080;
  const shorter = Math.min(source.width, source.height);
  const scale = target / shorter;
  return { width: even(Math.round(source.width * scale)), height: even(Math.round(source.height * scale)) };
}

export function previewDimensions(resolution: '360p' | '480p' | '720p', source: SourceDimensions): SourceDimensions {
  const target = resolution === '360p' ? 360 : resolution === '480p' ? 480 : 720;
  const shorter = Math.min(source.width, source.height);
  const scale = Math.min(1, target / shorter);
  return { width: even(Math.round(source.width * scale)), height: even(Math.round(source.height * scale)) };
}

function even(n: number): number {
  const v = Math.max(2, Math.round(n));
  return v % 2 === 0 ? v : v + 1;
}

const OUTPUT_META: Record<OutputKind, { container: string; mimeType: string; video: boolean }> = {
  mp4: { container: 'mp4', mimeType: 'video/mp4', video: true },
  overlay: { container: 'mov', mimeType: 'video/quicktime', video: true },
  srt: { container: 'srt', mimeType: 'application/x-subrip', video: false },
  vtt: { container: 'vtt', mimeType: 'text/vtt', video: false },
};

export interface RenderQuoteInput {
  durationMs: number;
  settings: OutputSettings;
  source: SourceDimensions;
}

export interface RenderQuoteResult {
  expectedOutputs: ExpectedOutput[];
  billableMinutes: number;
  creditCost: number;
  priceVersion: string;
}

/**
 * Deterministic credit pricing. Billable minutes are rounded up to 1/100 minute;
 * each priced output is charged per started minute-fraction, then the paid
 * minimum applies once per render.
 */
export function quoteRender(input: RenderQuoteInput): RenderQuoteResult {
  const billableMinutes = Math.ceil((input.durationMs / 60_000) * 100) / 100;
  const qualityMultiplier = input.settings.quality === 'high' ? PRICE_TABLE.highQualityMultiplier : 1;
  const expectedOutputs: ExpectedOutput[] = [];
  let total = 0;
  for (const kind of input.settings.outputs) {
    const meta = OUTPUT_META[kind];
    const rate = PRICE_TABLE.perMinute[kind][input.settings.resolution];
    const credits = rate > 0 ? Math.ceil(billableMinutes * rate * qualityMultiplier) : 0;
    total += credits;
    const dims = meta.video ? outputDimensions(input.settings.resolution, input.source) : undefined;
    const out: ExpectedOutput = {
      kind,
      container: meta.container,
      mimeType: meta.mimeType,
      priced: rate > 0,
      credits,
    };
    if (dims) {
      out.width = dims.width;
      out.height = dims.height;
    }
    expectedOutputs.push(out);
  }
  const anyPaid = expectedOutputs.some((o) => o.priced);
  const creditCost = anyPaid ? Math.max(PRICE_TABLE.minimumPaidCredits, total) : 0;
  return { expectedOutputs, billableMinutes, creditCost, priceVersion: PRICE_TABLE.version };
}
