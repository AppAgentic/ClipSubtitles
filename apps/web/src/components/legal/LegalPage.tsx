import Link from 'next/link';
import type { ReactNode } from 'react';

export const LEGAL_EFFECTIVE_DATE = '3 September 2026';

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-20">
      <Link href="/" className="text-sm text-ink-dim">
        ← ClipSubtitles
      </Link>
      <h1 className="mt-12 text-5xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-4 text-sm text-ink-mute">Effective {LEGAL_EFFECTIVE_DATE}</p>
      <p className="mt-8 text-[15px] leading-7 text-ink-dim">{intro}</p>
      <div className="mt-10 space-y-10 text-[15px] leading-7 text-ink-dim">{children}</div>
      <nav
        className="mt-14 flex flex-wrap gap-5 border-t border-line pt-6 text-sm"
        aria-label="Legal policies"
      >
        <Link href="/terms" className="text-signal">
          Terms
        </Link>
        <Link href="/privacy" className="text-signal">
          Privacy
        </Link>
        <Link href="/refunds" className="text-signal">
          Refunds and cancellation
        </Link>
      </nav>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-6">{children}</ul>;
}
