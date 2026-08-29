import {
  ProviderError,
  throwIfAborted,
  type ProviderCapabilities,
  type TranscriptionInput,
  type TranscriptionProvider,
  type TranscriptionResult,
} from './provider';

export type ScriptedStep =
  | { kind: 'result'; result: Omit<TranscriptionResult, 'provider' | 'model'> & Partial<Pick<TranscriptionResult, 'provider' | 'model'>> }
  | { kind: 'error'; error: ProviderError }
  | { kind: 'hang'; ms: number };

/** Test double that replays a script of results/errors (used for worker + fallback tests). */
export class ScriptedProvider implements TranscriptionProvider {
  readonly displayName: string;
  readonly model = 'scripted-v1';
  readonly capabilities: ProviderCapabilities = {
    wordTimestamps: true,
    speakerLabels: false,
    languageDetection: false,
    vocabularyBiasing: false,
    verbatim: true,
  };
  readonly usdPerMinute = null;
  readonly calls: TranscriptionInput[] = [];
  private readonly steps: ScriptedStep[];
  private configured: boolean;

  constructor(
    readonly id: string,
    steps: ScriptedStep[],
    opts: { configured?: boolean } = {},
  ) {
    this.displayName = `Scripted ${id}`;
    this.steps = [...steps];
    this.configured = opts.configured ?? true;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async transcribe(input: TranscriptionInput, signal?: AbortSignal): Promise<TranscriptionResult> {
    this.calls.push(input);
    throwIfAborted(this.id, signal);
    const step = this.steps.shift();
    if (!step) throw new ProviderError(this.id, 'UNAVAILABLE', 'Scripted provider exhausted.', false);
    if (step.kind === 'error') throw step.error;
    if (step.kind === 'hang') {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, step.ms);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(new ProviderError(this.id, 'CANCELLED', 'Cancelled.'));
          },
          { once: true },
        );
      });
      throw new ProviderError(this.id, 'TIMEOUT', 'Scripted hang ended.', true);
    }
    return { provider: this.id, model: this.model, ...step.result };
  }
}
