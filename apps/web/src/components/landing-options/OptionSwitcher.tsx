import Link from 'next/link';
import { LANDING_OPTIONS, type OptionSlug } from './options';

/**
 * Persistent switcher shown on every landing concept. Server component: the
 * active option is passed by the page, so no client JS is needed.
 */
export function OptionSwitcher({ current }: { current?: OptionSlug }) {
  return (
    <nav className="lo-switcher" aria-label="Landing page options">
      <Link href="/landing-options" className="lo-switch-home" aria-current={current ? undefined : 'page'}>
        <span className="lo-switch-label">Options</span>
      </Link>
      {LANDING_OPTIONS.map((o) => (
        <Link
          key={o.slug}
          href={`/landing-options/${o.slug}`}
          aria-current={o.slug === current ? 'page' : undefined}
          aria-label={`${o.n} ${o.name}`}
          style={{ ['--dot' as string]: o.dot }}
        >
          <span className="lo-dot" aria-hidden />
          <span aria-hidden>{o.n}</span>
          <span className="lo-switch-label" aria-hidden>
            {o.name}
          </span>
        </Link>
      ))}
    </nav>
  );
}
