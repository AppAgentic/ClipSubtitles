import Link from 'next/link';
import { GatesStory } from './GatesStory';
import { InView } from './InView';
import { OptionSwitcher } from './OptionSwitcher';
import { GUARANTEES, MCP_TOOLS } from './facts';
import './three-gates.css';

export function ThreeGates() {
  return (
    <div data-lo="three-gates" className="tg">
      <header className="tg-top lo-wrap">
        <Link href="/" className="tg-brand">
          ClipSubtitles
        </Link>
        <nav aria-label="Primary" className="tg-nav">
          <Link href="/docs">Agents</Link>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>

      <main>
        {/* 1 · Hero */}
        <section className="tg-hero lo-wrap" aria-labelledby="tg-h1">
          <h1 id="tg-h1">
            Create styled video captions
            <br />
            <em>with your AI agent.</em>
          </h1>
          <p className="tg-lede">
            Send a short video and get a finished captioned MP4, transparent overlay, SRT or VTT. Your agent handles the workflow; you approve the
            exact words, render cost and output formats.
          </p>
          <div className="tg-cta">
            <Link href="/sign-in" className="lo-btn tg-btn-primary">
              Caption a video
            </Link>
            <Link href="/docs" className="lo-btn tg-btn-ghost">
              View agent API
            </Link>
          </div>
          <p className="tg-scroll lo-mono" aria-hidden>
            ↓ words · cost · output
          </p>
        </section>

        {/* 2 · Product proof — the story */}
        <section className="lo-wrap" aria-label="The three gates">
          <GatesStory />
        </section>

        {/* 3 · Trust */}
        <InView as="section" className="tg-rest lo-wrap" threshold={0.2}>
          <p className="lo-eyebrow tg-eyebrow">Everything else is the agent’s</p>
          <ul className="tg-tools lo-mono" aria-label="MCP tools">
            {MCP_TOOLS.map((t, i) => (
              <li key={t.name} style={{ ['--i' as string]: i }}>
                {t.name}
              </li>
            ))}
          </ul>
          <ul className="tg-guarantees">
            {GUARANTEES.slice(0, 4).map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </InView>

        {/* 4 · Final */}
        <section className="tg-final lo-wrap lo-end" aria-labelledby="tg-h4">
          <h2 id="tg-h4">Keep control of the words, cost and files.</h2>
          <div className="tg-cta">
            <Link href="/sign-in" className="lo-btn tg-btn-primary">
              Caption a video
            </Link>
            <Link href="/docs" className="lo-btn tg-btn-ghost">
              View agent API
            </Link>
          </div>
        </section>
      </main>

      <OptionSwitcher current="three-gates" />
    </div>
  );
}
