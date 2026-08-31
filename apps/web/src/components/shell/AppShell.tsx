'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import type { Me } from '@clipsubtitles/contracts';
import { useMe } from '@/lib/hooks';
import { Spinner } from '@/components/ui/primitives';

const NAV: Array<{ href: string; label: string; glyph: string; match: (p: string) => boolean }> = [
  {
    href: '/app',
    label: 'Library',
    glyph: 'L',
    match: (p) => p === '/app' || p.startsWith('/studio/'),
  },
  { href: '/app/new', label: 'New video', glyph: '+', match: (p) => p === '/app/new' },
  {
    href: '/app/exports',
    label: 'Exports',
    glyph: 'E',
    match: (p) => p.startsWith('/app/exports'),
  },
  {
    href: '/app/settings',
    label: 'Settings',
    glyph: 'S',
    match: (p) => p.startsWith('/app/settings'),
  },
  { href: '/help', label: 'Help', glyph: '?', match: (p) => p.startsWith('/help') },
];

export function AppShell({
  children,
  wide = false,
  render,
}: {
  children?: ReactNode;
  wide?: boolean;
  render?: (me: Me) => ReactNode;
}) {
  const { me, loading, unauthenticated, error } = useMe();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && unauthenticated)
      router.replace(`/sign-in?returnTo=${encodeURIComponent(pathname)}`);
  }, [loading, unauthenticated, router, pathname]);

  if (loading || (!me && !error)) {
    return (
      <div className="grid min-h-screen place-items-center text-ink-mute">
        <div className="flex items-center gap-3 text-[13px]">
          <Spinner /> Loading studio…
        </div>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="rounded-xl border border-danger/40 bg-panel px-5 py-4 text-[13px] text-ink-dim">
          We could not load your workspace. Refresh the page or try again in a moment.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[68px] shrink-0 flex-col items-center border-r border-line bg-bg-elev/70 py-4 backdrop-blur">
        <Link
          href="/app"
          className="mb-6 grid h-9 w-9 place-items-center rounded-xl bg-signal text-[15px] font-bold text-signal-ink shadow-[0_0_24px_-4px_rgb(255_122_26/0.8)]"
          aria-label="ClipSubtitles Library"
        >
          cs
        </Link>
        <nav className="flex flex-col items-center gap-1">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={`group flex w-[56px] flex-col items-center gap-1 rounded-lg py-2 transition-colors ${active ? 'bg-panel-2 text-ink' : 'text-ink-mute hover:text-ink-dim'}`}
              >
                <span
                  className={`mono grid h-6 w-6 place-items-center rounded-md border text-[11px] ${active ? 'border-signal/60 text-signal' : 'border-line-strong'}`}
                >
                  {n.glyph}
                </span>
                <span className="text-[10px] tracking-[0.02em]">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-2">
          <Link
            href="/"
            className="text-[10px] text-ink-mute hover:text-ink"
            aria-label="ClipSubtitles homepage"
          >
            Home
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 min-w-0 items-center justify-between gap-3 overflow-hidden border-b border-line bg-bg/80 px-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-3 text-[12px] text-ink-mute">
            <span className="truncate text-ink" title={me.workspace.name}>
              {me.workspace.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <CreditsPill available={me.credits.available} />
            <span
              className="hidden max-w-[160px] truncate text-[12px] text-ink-dim md:inline"
              title={me.user.displayName ?? me.user.emailMasked ?? me.user.id}
            >
              {me.user.displayName ?? me.user.emailMasked ?? me.user.id}
            </span>
            <form
              method="post"
              action="/auth/logout"
              onSubmit={(e) => {
                e.preventDefault();
                void fetch('/auth/logout', { method: 'POST', credentials: 'include' }).then(() =>
                  router.replace('/sign-in'),
                );
              }}
            >
              <button
                type="submit"
                className="whitespace-nowrap text-[12px] text-ink-mute hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main
          className={`mx-auto w-full min-w-0 flex-1 ${wide ? 'max-w-none px-3 py-4 sm:px-4' : 'max-w-[1240px] px-3 py-5 sm:px-6 sm:py-6'}`}
        >
          {render ? render(me) : children}
        </main>
      </div>
    </div>
  );
}

export function CreditsPill({ available }: { available: number }) {
  return (
    <span
      className="mono inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line-strong bg-panel px-2.5 py-1 text-[11px] text-ink-dim sm:gap-2"
      title={`${available} credits available`}
      aria-label={`${available} credits available`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-phosphor" />
      <span className="text-ink">{available}</span>
      <span className="hidden text-ink-mute sm:inline">credits</span>
    </span>
  );
}
