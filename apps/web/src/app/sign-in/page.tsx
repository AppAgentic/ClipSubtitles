'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SignInInner() {
  const params = useSearchParams();
  const returnTo = params.get('returnTo') ?? '/';
  const href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-20%] h-[70vh] w-[70vw] -translate-x-1/2 rounded-full bg-signal/10 blur-[120px]" />
      </div>
      <div className="w-full max-w-[520px]">
        <div className="rise mb-10 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-signal text-[16px] font-bold text-signal-ink">cs</span>
          <span className="text-[13px] uppercase tracking-[0.2em] text-ink-mute">ClipSubtitles Studio</span>
        </div>
        <h1 className="rise rise-1 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em]">
          Captions your agent drafted.
          <br />
          <span className="text-ink-dim">Precision you control.</span>
        </h1>
        <p className="rise rise-2 mt-5 max-w-[42ch] text-[15px] leading-relaxed text-ink-dim">
          Sign in to review word timing, restyle, approve render costs, and recover any project or export your agent created through ChatGPT, Claude, or the API.
        </p>
        <div className="rise rise-3 mt-8 flex flex-wrap items-center gap-3">
          <a href={href} className="inline-flex h-11 items-center gap-2 rounded-xl bg-signal px-5 text-[14px] font-semibold text-signal-ink shadow-[0_0_0_1px_rgb(255_122_26/0.4),0_10px_40px_-10px_rgb(255_122_26/0.7)] transition hover:bg-signal-soft">
            Continue with WorkOS
            <span aria-hidden>→</span>
          </a>
          <span className="text-[12px] text-ink-mute">One identity → one personal workspace.</span>
        </div>
        <dl className="rise rise-4 mt-14 grid grid-cols-3 gap-4 border-t border-line pt-6 text-[12px] text-ink-mute">
          <div>
            <dt className="mono text-[10px] uppercase tracking-[0.18em]">Fidelity</dt>
            <dd className="mt-1 text-ink-dim">Spoken words are never rewritten.</dd>
          </div>
          <div>
            <dt className="mono text-[10px] uppercase tracking-[0.18em]">Cost</dt>
            <dd className="mt-1 text-ink-dim">Every paid render needs an immutable quote.</dd>
          </div>
          <div>
            <dt className="mono text-[10px] uppercase tracking-[0.18em]">Recovery</dt>
            <dd className="mt-1 text-ink-dim">Tasks are durable; exports are retrievable.</dd>
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
