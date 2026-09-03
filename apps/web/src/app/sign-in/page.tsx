'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ClipSubtitlesWordmark } from '@/components/brand/ClipSubtitlesWordmark';
import { trackPaidFunnelEvent } from '@/lib/attribution';

function SignInInner() {
  const params = useSearchParams();
  const returnTo = params.get('returnTo') ?? '/app';
  const href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      <div className="w-full max-w-[520px]">
        <div className="rise mb-10 flex items-center text-[20px] text-ink">
          <ClipSubtitlesWordmark />
        </div>
        <h1 className="rise rise-1 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em]">
          Welcome back.
          <br />
          <span className="text-ink-dim">Your videos are waiting.</span>
        </h1>
        <p className="rise rise-2 mt-5 max-w-[42ch] text-[15px] leading-relaxed text-ink-dim">
          Sign in to review captions, continue editing and download your finished videos.
        </p>
        <div className="rise rise-3 mt-8 flex flex-wrap items-center gap-3">
          <a
            href={href}
            onClick={() => trackPaidFunnelEvent('signup_started')}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--color-signal-fill)] px-5 text-[14px] font-semibold text-signal-ink transition hover:brightness-110"
          >
            Continue to sign in
            <span aria-hidden>→</span>
          </a>
          <span className="text-[12px] text-ink-mute">
            Secure sign-in for your ClipSubtitles account.
          </span>
        </div>
        <dl className="rise rise-4 mt-14 grid gap-4 border-t border-line pt-6 text-[12px] text-ink-mute sm:grid-cols-3">
          <div>
            <dt className="mono text-[10px] uppercase tracking-[0.18em]">Your videos</dt>
            <dd className="mt-1 text-ink-dim">Find every caption project in your Library.</dd>
          </div>
          <div>
            <dt className="mono text-[10px] uppercase tracking-[0.18em]">Your captions</dt>
            <dd className="mt-1 text-ink-dim">Review the words and look before exporting.</dd>
          </div>
          <div>
            <dt className="mono text-[10px] uppercase tracking-[0.18em]">Your exports</dt>
            <dd className="mt-1 text-ink-dim">Return to finished work whenever you need it.</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  );
}
