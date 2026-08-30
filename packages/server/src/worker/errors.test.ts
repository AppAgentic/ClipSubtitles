import { ProviderError } from '@clipsubtitles/transcription';
import { describe, expect, it } from 'vitest';
import { toTaskError } from './errors';

describe('toTaskError', () => {
  it('preserves provider retryability instead of retrying permanent HTTP rejections', () => {
    expect(
      toTaskError(
        new ProviderError(
          'elevenlabs',
          'UNAVAILABLE',
          'Provider rejected the request (401).',
          false,
        ),
      ).error,
    ).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: false });

    expect(
      toTaskError(
        new ProviderError('elevenlabs', 'UNAVAILABLE', 'Provider request failed.', true),
      ).error,
    ).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true });
  });
});
