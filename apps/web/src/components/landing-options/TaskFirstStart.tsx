'use client';

import { useRef, useState } from 'react';
import { SUPPORTED_SOURCE_EXTENSIONS } from '@clipsubtitles/contracts';
import { trackPaidFunnelEvent } from '@/lib/attribution';
import { stageUpload } from '@/lib/staged-upload';

const UPLOAD_RETURN = '/app/new?staged=1';
const SAMPLE_RETURN = '/app/new?demo=1';

function signInHref(returnTo: string): string {
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function TaskFirstStart() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    trackPaidFunnelEvent('upload_selected', {
      source: 'landing',
      bytes: file.size,
      mime_type: file.type || 'unknown',
    });
    try {
      await stageUpload(file);
      trackPaidFunnelEvent('signup_started', { intent: 'staged_upload' });
      window.location.assign(signInHref(UPLOAD_RETURN));
    } catch {
      setError(
        'This browser could not hold the clip through sign-in. Sign in first, then choose it again.',
      );
      setBusy(false);
    }
  };

  return (
    <div className="tg-start" aria-label="Start captioning">
      <input
        ref={input}
        type="file"
        accept={SUPPORTED_SOURCE_EXTENSIONS.join(',')}
        className="lo-sr"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      <button
        type="button"
        className="tg-start-upload"
        onClick={() => input.current?.click()}
        disabled={busy}
      >
        <span className="tg-start-icon" aria-hidden>
          ↑
        </span>
        <span>
          <strong>{busy ? 'Keeping your clip ready…' : 'Upload a video'}</strong>
          <small>MP4, MOV, WEBM or audio · up to 10 minutes</small>
        </span>
        <span className="tg-start-arrow" aria-hidden>
          →
        </span>
      </button>
      <div className="tg-start-meta">
        <a
          href={signInHref(SAMPLE_RETURN)}
          onClick={() => trackPaidFunnelEvent('signup_started', { intent: 'sample' })}
        >
          Try a real sample <span aria-hidden>▶</span>
        </a>
        <span>First clip free · no card</span>
      </div>
      {error ? (
        <p className="tg-start-error" role="alert">
          {error} <a href={signInHref('/app/new')}>Continue to sign in</a>
        </p>
      ) : null}
    </div>
  );
}
