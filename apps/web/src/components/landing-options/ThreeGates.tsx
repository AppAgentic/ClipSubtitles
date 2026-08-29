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
            Agents do the work.
            <br />
            <em>Three decisions stay yours.</em>
          </h1>
          <p className="tg-lede">
            Import, transcribe, segment, preview, render: eight MCP tools your agent can call without asking. The words, the cost and the output are
            gates only you can open.
          </p>
          <div className="tg-cta">
            <Link href="/docs" className="lo-btn tg-btn-primary">
              Connect an agent
            </Link>
            <Link href="/sign-in" className="lo-btn tg-btn-ghost">
              Open the studio
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
          <h2 id="tg-h4">Keep your three decisions.</h2>
          <div className="tg-cta">
            <Link href="/docs" className="lo-btn tg-btn-primary">
              Connect an agent
            </Link>
            <Link href="/sign-in" className="lo-btn tg-btn-ghost">
              Open the studio
            </Link>
          </div>
        </section>
      </main>

      <OptionSwitcher current="three-gates" />
    </div>
  );
}
