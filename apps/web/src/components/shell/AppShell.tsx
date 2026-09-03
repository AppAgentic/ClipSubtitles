'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import type { Me } from '@clipsubtitles/contracts';
import { useMe } from '@/lib/hooks';
import { Spinner } from '@/components/ui/primitives';
import { ClipSubtitlesWordmark } from '@/components/brand/ClipSubtitlesWordmark';
import {
  clearSupportUser,
  identifySupportUser,
  SupportButton,
} from '@/components/support/GleapSupport';
import { trackPaidFunnelEventOnce } from '@/lib/attribution';

type NavIconName = 'home' | 'plus' | 'film' | 'spark' | 'settings' | 'help' | 'code';

const NAV: Array<{
  href: string;
  label: string;
  mobileLabel?: string;
  icon: NavIconName;
  match: (p: string) => boolean;
}> = [
  {
    href: '/app',
    label: 'Home',
    icon: 'home',
    match: (p) => p === '/app',
  },
  { href: '/app/new', label: 'New video', icon: 'plus', match: (p) => p === '/app/new' },
  {
    href: '/app/exports',
    label: 'Exports',
    icon: 'film',
    match: (p) => p.startsWith('/app/exports'),
  },
  {
    href: '/app/connections',
    label: 'AI connections',
    mobileLabel: 'AI tools',
    icon: 'spark',
    match: (p) => p.startsWith('/app/connections'),
  },
  {
    href: '/app/settings',
    label: 'Settings',
    icon: 'settings',
    match: (p) => p.startsWith('/app/settings'),
  },
];

const SECONDARY_NAV: Array<{
  href: string;
  label: string;
  icon: NavIconName;
  match: (p: string) => boolean;
}> = [
  { href: '/help', label: 'Help center', icon: 'help', match: (p) => p.startsWith('/help') },
  {
    href: '/developers',
    label: 'Developer access',
    icon: 'code',
    match: (p) => p.startsWith('/developers'),
  },
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
  const immersive = pathname.startsWith('/studio/');

  useEffect(() => {
    if (!loading && unauthenticated)
      router.replace(`/sign-in?returnTo=${encodeURIComponent(pathname)}`);
  }, [loading, unauthenticated, router, pathname]);

  useEffect(() => {
    if (me) {
      identifySupportUser(me);
      trackPaidFunnelEventOnce('signup_completed');
    }
  }, [me]);

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
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-line bg-panel/70 px-3 py-5 backdrop-blur-xl lg:flex">
        <Brand />
        <nav aria-label="Workspace" className="mt-8 flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink key={n.href} item={n} active={n.match(pathname)} />
          ))}
        </nav>
        <nav aria-label="Support" className="mt-auto flex flex-col gap-1 border-t border-line pt-4">
          {SECONDARY_NAV.map((n) => (
            <NavLink key={n.href} item={n} active={n.match(pathname)} />
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[66px] min-w-0 items-center justify-between gap-3 border-b border-line bg-bg-elev/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3 lg:hidden">
            <Brand compact />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
            <CreditsPill available={me.credits.available} />
            <SupportButton className="grid h-8 w-8 place-items-center rounded-full border border-line-strong bg-panel-2 text-ink-dim transition-colors hover:text-ink sm:hidden">
              <span className="sr-only">Contact support</span>
              <NavIcon name="help" className="h-4 w-4" />
            </SupportButton>
            <SupportButton className="hidden text-[12px] text-ink-dim hover:text-ink sm:inline">
              Support
            </SupportButton>
            <Link
              href="/developers"
              className="hidden text-[12px] text-ink-dim hover:text-ink md:inline"
            >
              Developer
            </Link>
            <span
              className="grid h-8 w-8 place-items-center rounded-full border border-line-strong bg-panel-2 text-[11px] font-semibold text-ink"
              title={me.user.displayName ?? me.user.emailMasked ?? me.user.id}
              aria-label={me.user.displayName ?? me.user.emailMasked ?? 'Account'}
            >
              {initials(me.user.displayName ?? me.user.emailMasked ?? 'CS')}
            </span>
            <form
              method="post"
              action="/auth/logout"
              onSubmit={(e) => {
                e.preventDefault();
                clearSupportUser();
                void fetch('/auth/logout', { method: 'POST', credentials: 'include' }).then(() =>
                  router.replace('/sign-in'),
                );
              }}
            >
              <button
                type="submit"
                className="hidden whitespace-nowrap text-[12px] text-ink-mute hover:text-ink sm:block"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main
          className={`mx-auto w-full min-w-0 flex-1 ${immersive ? 'pb-8' : 'pb-24 lg:pb-8'} ${wide ? 'max-w-none px-3 py-4 sm:px-4' : 'max-w-[1380px] px-4 py-6 sm:px-7 sm:py-8'}`}
        >
          {render ? render(me) : children}
        </main>
      </div>
      {immersive ? null : (
        <nav
          aria-label="Workspace"
          className="fixed inset-x-3 bottom-3 z-40 flex h-[62px] items-center justify-around rounded-2xl border border-line bg-panel/95 px-1 shadow-[var(--shadow-float)] backdrop-blur-xl lg:hidden"
        >
          {NAV.slice(0, 5).map((n) => {
            const active = n.match(pathname);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[9px] transition-colors ${active ? 'text-signal' : 'text-ink-mute'}`}
              >
                <NavIcon name={n.icon} className="h-[18px] w-[18px]" />
                <span className="max-w-full truncate px-1">{n.mobileLabel ?? n.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

export function CreditsPill({ available }: { available: number }) {
  return (
    <Link
      href="/app/settings#billing"
      className="mono inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line-strong bg-panel-2 px-3 py-1.5 text-[11px] text-ink-dim"
      title={`${available} credits available`}
      aria-label={`${available} credits available`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-signal" />
      <span className="text-ink">{available}</span>
      <span className="hidden text-ink-mute sm:inline">credits</span>
    </Link>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/app"
      className="inline-flex items-center text-[17px] text-ink"
      aria-label="ClipSubtitles home"
    >
      <ClipSubtitlesWordmark />
      {compact ? null : <span className="sr-only"> workspace</span>}
    </Link>
  );
}

function NavLink({
  item,
  active,
}: {
  item: { href: string; label: string; icon: NavIconName };
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`group flex h-11 items-center gap-3 rounded-lg px-3 text-[13px] transition-[background,color,transform] active:translate-y-px ${active ? 'bg-signal/10 text-signal' : 'text-ink-dim hover:bg-panel-2 hover:text-ink'}`}
    >
      <NavIcon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const path = {
    home: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7" />
      </>
    ),
    plus: (
      <>
        <path d="M12 4v16M4 12h16" />
        <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      </>
    ),
    film: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4" />
      </>
    ),
    spark: (
      <>
        <path d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" />
        <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06-2.76 2.76-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.65V21H10v-.09A1.8 1.8 0 0 0 8.9 19.3a1.8 1.8 0 0 0-2 .36l-.06.06-2.76-2.76.06-.06a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 2.85 13.8H2.8V10h.09A1.8 1.8 0 0 0 4.5 8.9a1.8 1.8 0 0 0-.36-2l-.06-.06 2.76-2.76.06.06a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 10 2.85V2.8h3.9v.09A1.8 1.8 0 0 0 15 4.5a1.8 1.8 0 0 0 2-.36l.06-.06 2.76 2.76-.06.06a1.8 1.8 0 0 0-.36 2 1.8 1.8 0 0 0 1.65 1.1h.09v3.8h-.09A1.8 1.8 0 0 0 19.4 15Z" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.8 9a2.3 2.3 0 1 1 3.3 2.08c-.75.38-1.1.86-1.1 1.67M12 17h.01" />
      </>
    ),
    code: (
      <>
        <path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" />
      </>
    ),
  }[name];
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {path}
    </svg>
  );
}

function initials(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  if (!cleaned) return 'CS';
  return cleaned
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
