import Link from 'next/link';
import { OptionSwitcher } from './OptionSwitcher';
import {
  EDITED_WORD,
  MCP_TOOLS,
  OUTPUTS,
  SAMPLE,
  shortHash,
  timecode,
  wordsForPage,
} from './facts';
import './handoff.css';

type Actor = 'agent' | 'you';

const CALLS: Array<{ actor: Actor; tool: string; args?: string; result: string }> = [
  {
    actor: 'agent',
    tool: 'create_caption_project',
    args: `{ title: "${SAMPLE.title}" }`,
    result: `→ ${SAMPLE.projectId} · v1`,
  },
  {
    actor: 'agent',
    tool: 'generate_captions',
    result: `→ task succeeded · ${SAMPLE.words.length} words · ${SAMPLE.pages.length} pages · v2`,
  },
  {
    actor: 'you',
    tool: 'update_caption_project',
    args: `replace_word_text "${EDITED_WORD.was}" → "${EDITED_WORD.text}"`,
    result: `→ v3 · ${shortHash(SAMPLE.hashV3)}`,
  },
  { actor: 'agent', tool: 'render_caption_preview', result: '→ 480p preview of v3' },
  {
    actor: 'agent',
    tool: 'render_caption_export',
    args: `outputs [${SAMPLE.outputs.join(', ')}] · 1080p`,
    result: `→ quote_required · ${SAMPLE.creditCost} credits · v3`,
  },
  {
    actor: 'you',
    tool: 'approve',
    args: `{ quoteId, approvedCreditCost: ${SAMPLE.creditCost} }`,
    result: `→ ${SAMPLE.taskId} · reserved ${SAMPLE.creditCost}`,
  },
  {
    actor: 'agent',
    tool: 'get_caption_task',
    result: `→ succeeded · settled ${SAMPLE.creditCost} · mp4 + srt`,
  },
];

const LEDGER: Array<{ step: string; agent: string; you: string; owner: Actor }> = [
  {
    step: 'Import & probe',
    agent: 'Uploads or fetches the clip, waits for the durable task',
    you: '—',
    owner: 'agent',
  },
  {
    step: 'Transcribe',
    agent: 'Word-level words with timings, provider fallback before any transcript exists',
    you: '—',
    owner: 'agent',
  },
  {
    step: 'Segment & style',
    agent: 'Pages by pause and clause; picks a preset and motion',
    you: '—',
    owner: 'agent',
  },
  {
    step: 'Exact words',
    agent: 'Never rewrites a spoken word',
    you: 'replace_word_text, set_word_timing, split/merge pages',
    owner: 'you',
  },
  {
    step: 'Preview',
    agent: 'Renders the exact current version at 360–720p',
    you: 'Looks, or doesn’t',
    owner: 'agent',
  },
  {
    step: 'Quote',
    agent: 'Requests it; receives version, hash, outputs, credits, expiry',
    you: '—',
    owner: 'agent',
  },
  {
    step: 'Exact cost',
    agent: 'Cannot approve',
    you: 'Echoes the quoted credits exactly, or nothing happens',
    owner: 'you',
  },
  {
    step: 'Outputs',
    agent: 'Proposes',
    you: 'MP4 · OVERLAY · SRT · VTT — your pick is frozen in the quote',
    owner: 'you',
  },
  {
    step: 'Render & deliver',
    agent: 'Polls the task; downloads short-lived export URLs',
    you: '—',
    owner: 'agent',
  },
];

export function Handoff() {
  const page2 = wordsForPage(SAMPLE.pages[1]);
  const firstPage2Word = page2[0];
  return (
    <div data-lo="handoff" className="ho">
      <header className="ho-top lo-wrap">
        <Link href="/" className="ho-brand" aria-label="ClipSubtitles home">
          <span className="ho-brand-mark" aria-hidden>
            cs
          </span>
          ClipSubtitles
        </Link>
        <nav className="ho-nav" aria-label="Primary">
          <Link href="/developers">Agents</Link>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>

      <main>
        {/* 1 · Hero — split stage */}
        <section className="ho-hero lo-wrap" aria-labelledby="ho-h1">
          <div className="ho-hero-copy">
            <p className="lo-eyebrow ho-eyebrow">Video captions for AI agents · MCP + REST</p>
            <h1 id="ho-h1">
              <span className="ho-agent-ink">AI video caption generator</span> for <em>agents</em>{' '}
              and <em>creators.</em>
            </h1>
            <p className="ho-lede">
              Upload or import a short video and get word-timed, styled captions as MP4, transparent
              overlay, SRT or VTT. Work in the studio or automate through MCP and API.
            </p>
            <div className="ho-cta">
              <Link href="/sign-in" className="lo-btn ho-btn-primary">
                Caption a video
              </Link>
              <Link href="/developers" className="lo-btn ho-btn-ghost">
                View agent API
              </Link>
            </div>
          </div>

          <div
            className="ho-stage"
            role="group"
            aria-label="One project, seen by the agent and by you"
          >
            <ol className="ho-calls lo-mono" aria-label="Tool-call sequence">
              {CALLS.map((c, i) => (
                <li
                  key={c.tool + i}
                  className={`ho-call ho-call-${c.actor}`}
                  style={{ ['--i' as string]: i }}
                >
                  <span className="ho-call-actor">{c.actor}</span>
                  <span className="ho-call-body">
                    <span className="ho-call-tool">
                      {c.tool}
                      {c.args ? <span className="ho-call-args"> {c.args}</span> : null}
                    </span>
                    <span className="ho-call-result">{c.result}</span>
                  </span>
                  {i === 4 ? (
                    <span className="ho-boundary" aria-hidden>
                      <span className="ho-boundary-line" />
                      <span className="ho-boundary-tag">
                        <span className="ho-lock" /> quote boundary · immutable ·{' '}
                        {shortHash(SAMPLE.hashV3)}
                      </span>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>

            <div className="ho-divider" aria-hidden>
              <span className="ho-divider-text lo-mono">
                same project · same version · {SAMPLE.projectId} · v{SAMPLE.version} ·{' '}
                {shortHash(SAMPLE.hashV3)}
              </span>
            </div>

            <figure className="ho-clip" aria-label="Captioned 9:16 clip, version 3">
              <div className="ho-clip-frame">
                <div className="ho-clip-video" />
                <span className="ho-clip-readout lo-mono ho-clip-readout-tl">
                  v{SAMPLE.version} · {shortHash(SAMPLE.hashV3, 6, 4)}
                </span>
                <span className="ho-clip-readout lo-mono ho-clip-readout-tr">
                  {timecode(SAMPLE.excerptStartMs + (firstPage2Word?.startMs ?? 0))}
                </span>
                <p
                  className="ho-caption lo-cap"
                  aria-label={`Caption: ${page2.map((w) => w.text).join(' ')}`}
                >
                  {page2.map((w, i) => (
                    <span
                      key={w.id}
                      className={`ho-word${w.was ? ' ho-word-edited' : ''}`}
                      style={{ ['--w' as string]: i }}
                    >
                      {w.text}
                    </span>
                  ))}
                </p>
                <span className="ho-edit-tag lo-mono">
                  <span className="ho-edit-dot" aria-hidden />
                  you: “{EDITED_WORD.was}” → “{EDITED_WORD.text}”
                </span>
              </div>
              <figcaption className="lo-mono">
                {SAMPLE.width}×{SAMPLE.height} · {SAMPLE.fps} fps · bold-pop · spring-pop
              </figcaption>
            </figure>
          </div>
        </section>

        {/* 2 · Product proof — responsibility ledger */}
        <section className="ho-ledger lo-wrap" aria-labelledby="ho-h2">
          <div className="ho-section-head">
            <p className="lo-eyebrow ho-eyebrow">Responsibility ledger</p>
            <h2 id="ho-h2">Who does what, exactly.</h2>
          </div>
          <table className="ho-table">
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">
                  <span className="ho-pill ho-pill-agent">Agent</span>
                </th>
                <th scope="col">
                  <span className="ho-pill ho-pill-you">You</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {LEDGER.map((row) => (
                <tr key={row.step} className={`ho-row-${row.owner}`}>
                  <th scope="row">{row.step}</th>
                  <td>{row.agent}</td>
                  <td>{row.you}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 3 · Workflow & trust — tool-flow rail */}
        <section className="ho-rail-section lo-wrap" aria-labelledby="ho-h3">
          <div className="ho-section-head">
            <p className="lo-eyebrow ho-eyebrow">Tool flow</p>
            <h2 id="ho-h3">What your agent handles — and what waits for approval.</h2>
          </div>
          <ol className="ho-rail lo-mono" aria-label="MCP tools in workflow order">
            {MCP_TOOLS.map((t) => (
              <li key={t.name} className={`ho-stop ho-stop-${t.role}`}>
                <span className="ho-stop-dot" aria-hidden />
                <span className="ho-stop-name">{t.name}</span>
                <span className="ho-stop-does">{t.does}</span>
              </li>
            ))}
          </ol>
          <ul className="ho-guarantees">
            <li>
              <strong>Versions are exact.</strong> Every edit bumps the project version; previews,
              quotes and renders pin a version and a content hash. Editing invalidates open quotes.
            </li>
            <li>
              <strong>Cost is exact.</strong> Approval must echo the quoted credits. Reserve on
              approval, settle once on success, release on failure or cancel.
            </li>
            <li>
              <strong>Retries are safe.</strong> The same{' '}
              <span className="lo-mono">idempotencyKey</span> returns the same task. Public errors
              carry an <span className="lo-mono">errorRef</span>; audit events never contain
              transcript text.
            </li>
          </ul>
        </section>

        {/* 4 · Final CTA */}
        <section className="ho-final lo-wrap lo-end" aria-labelledby="ho-h4">
          <h2 id="ho-h4">
            Caption videos in the studio.
            <br />
            <em>Or hand them to your agent.</em>
          </h2>
          <div className="ho-cta">
            <Link href="/sign-in" className="lo-btn ho-btn-primary">
              Caption a video
            </Link>
            <Link href="/developers" className="lo-btn ho-btn-ghost">
              View agent API
            </Link>
          </div>
          <p className="ho-foot lo-mono">
            {MCP_TOOLS.length} MCP tools · 5 presets · 4 motions ·{' '}
            {OUTPUTS.map((o) => o.label).join(' / ')} · MCP endpoint /api/mcp
          </p>
        </section>
      </main>

      <OptionSwitcher current="handoff" />
    </div>
  );
}
