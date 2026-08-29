import type { Metadata } from 'next';
import Link from 'next/link';
import { OptionSwitcher } from '@/components/landing-options/OptionSwitcher';
import { LANDING_OPTIONS } from '@/components/landing-options/options';
import './index.css';

export const metadata: Metadata = { title: 'Five directions' };

export default function LandingOptionsIndex() {
  return (
    <div data-lo="index" className="lx">
      <header className="lx-mast lo-wrap">
        <span className="lo-eyebrow">ClipSubtitles · landing options</span>
        <span className="lo-eyebrow lx-mast-right">c84cf54 · 2026-08-29</span>
      </header>

      <main className="lo-wrap">
        <section className="lx-hero">
          <h1>
            Five SEO-aware ways to position ClipSubtitles:
            <br />
            <em>AI video captions, built for agents and creators.</em>
          </h1>
          <p>
            Each direction is a complete four-section page — hero, product proof, workflow and trust, final call — built from the same product
            facts: 8 MCP tools, 5 style presets, 4 motion presets, a deterministic renderer, immutable quotes, exact-word edits, version and content
            hashes. Nothing invented.
          </p>
        </section>

        <ol className="lx-list" aria-label="Landing page directions">
          {LANDING_OPTIONS.map((o) => (
            <li key={o.slug} className="lx-row">
              <Link href={`/landing-options/${o.slug}`} className="lx-link" style={{ ['--dot' as string]: o.dot, ['--field' as string]: o.field }}>
                <span className="lx-n lo-mono" aria-hidden>
                  {o.n}
                </span>
                <span className="lx-mark" aria-hidden>
                  <span className="lx-mark-frame">
                    <span className="lx-mark-band" />
                  </span>
                </span>
                <span className="lx-body">
                  <span className="lx-name">
                    {o.name}
                    {o.recommended ? <span className="lx-rec lo-mono">recommended</span> : null}
                  </span>
                  <span className="lx-thesis">{o.thesis}</span>
                  <span className="lx-world">{o.world}</span>
                </span>
                <span className="lx-arrow" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ol>

        <section className="lx-notes lo-end">
          <h2 className="lo-eyebrow">How to read these</h2>
          <p>
            The switcher at the bottom of every page moves between directions. Each page is responsive to 390&nbsp;px, keyboard-navigable, and
            honours <span className="lo-mono">prefers-reduced-motion</span>. Calls to action point at the real studio (<span className="lo-mono">/sign-in</span>) and
            the agent docs (<span className="lo-mono">/docs</span>).
          </p>
        </section>
      </main>

      <OptionSwitcher />
    </div>
  );
}
