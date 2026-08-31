import Link from 'next/link';
import { InView } from './InView';
import { OptionSwitcher } from './OptionSwitcher';
import { MCP_TOOLS, OUTPUTS, SAMPLE, shortHash } from './facts';
import './task-ledger.css';

const ROWS = [
  {
    id: SAMPLE.quoteId,
    kind: 'render_export',
    state: 'awaiting approval',
    detail: `quote open · v${SAMPLE.version} · ${SAMPLE.outputs.join('+')} · expires 15 min`,
    credits: `${SAMPLE.creditCost} quoted`,
    tone: 'gate',
  },
  {
    id: SAMPLE.taskId.replace(/.$/, '5'),
    kind: 'render_preview',
    state: 'succeeded',
    detail: `v${SAMPLE.version} · 480p · ${shortHash(SAMPLE.hashV3, 6, 4)}`,
    credits: '0',
    tone: 'ok',
  },
  {
    id: SAMPLE.taskId.replace(/.$/, '4'),
    kind: 'generate_captions',
    state: 'succeeded',
    detail: `v2 · ${SAMPLE.words.length} words · ${SAMPLE.pages.length} pages`,
    credits: '0',
    tone: 'ok',
  },
  {
    id: SAMPLE.taskId.replace(/.$/, '3'),
    kind: 'render_export',
    state: 'cancelled',
    detail: `v${SAMPLE.prevVersion} · cancel_requested → lease released`,
    credits: `${SAMPLE.creditCost} released`,
    tone: 'rel',
  },
  {
    id: SAMPLE.taskId.replace(/.$/, '2'),
    kind: 'import_source',
    state: 'succeeded',
    detail: `v1 · sha256 · ffprobe · ${SAMPLE.width}×${SAMPLE.height}`,
    credits: '0',
    tone: 'ok',
  },
] as const;

export function TaskLedger() {
  return (
    <div data-lo="task-ledger" className="tl">
      <header className="tl-top lo-wrap lo-mono">
        <Link href="/" className="tl-brand">
          clipsubtitles
        </Link>
        <span className="tl-top-meta">
          workspace · personal · credits 42{' '}
          <span className="tl-amber">+{SAMPLE.creditCost} reserved</span> · example
        </span>
        <nav aria-label="Primary" className="tl-nav">
          <Link href="/developers">agents</Link>
          <Link href="/sign-in">sign in</Link>
        </nav>
      </header>

      <main>
        {/* 1 · Hero — the ledger */}
        <section className="tl-hero lo-wrap" aria-labelledby="tl-h1">
          <div className="tl-hero-copy">
            <p className="lo-eyebrow tl-eyebrow">
              Agent-run video captioning · tracked jobs · fixed render costs
            </p>
            <h1 id="tl-h1">
              Video caption API
              <br />
              <em>for high-volume workflows.</em>
            </h1>
            <p className="tl-lede">
              Batch-caption short videos through MCP or REST. Every import, transcription, preview
              and render is tracked; paid renders use a fixed quote you approve, and nothing is
              charged twice.
            </p>
            <div className="tl-cta">
              <Link href="/sign-in" className="lo-btn tl-btn-primary">
                Caption a video
              </Link>
              <Link href="/developers" className="lo-btn tl-btn-ghost">
                View agent API
              </Link>
            </div>
          </div>

          <div className="tl-ledger-wrap">
            <table className="tl-ledger lo-mono" aria-label="Task ledger for one project (example)">
              <thead>
                <tr>
                  <th scope="col">id</th>
                  <th scope="col">kind</th>
                  <th scope="col">state</th>
                  <th scope="col">detail</th>
                  <th scope="col">credits</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r, i) => (
                  <tr
                    key={r.id}
                    className={`tl-row tl-row-${r.tone}`}
                    style={{ ['--i' as string]: i }}
                  >
                    <td className="tl-id">{r.id}</td>
                    <td>{r.kind}</td>
                    <td className="tl-state">
                      <span className="tl-state-dot" aria-hidden />
                      {r.state}
                    </td>
                    <td className="tl-detail">{r.detail}</td>
                    <td className="tl-credits">{r.credits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tl-ledger-foot lo-mono">
              {SAMPLE.projectId} · only the approval row moves ·{' '}
              <Link href="/sign-in">approve {SAMPLE.creditCost} credits in the studio →</Link>
            </p>
          </div>
        </section>

        {/* 2 · Product proof — lifecycle + credit states */}
        <InView as="section" className="tl-life lo-wrap" threshold={0.2}>
          <div className="tl-section-head">
            <p className="lo-eyebrow tl-eyebrow">Task lifecycle</p>
            <h2>Every caption job is tracked from start to finish.</h2>
          </div>
          <div className="tl-life-grid">
            <svg
              className="tl-graph"
              viewBox="0 0 640 220"
              role="img"
              aria-label="Task states: queued to running; running to succeeded, failed or cancelled; failed re-queues while attempts remain"
            >
              <g className="tl-edges" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M92 110 H190" />
                <path d="M292 110 H400 V40 H430" />
                <path d="M292 110 H430" />
                <path d="M292 110 H400 V180 H430" />
                <path
                  d="M480 40 C520 40 520 20 500 20 H260 C240 20 240 40 260 40 V70"
                  strokeDasharray="4 4"
                />
              </g>
              <g className="tl-nodes lo-mono" fontSize="12" textAnchor="middle">
                <rect x="10" y="92" width="82" height="36" rx="6" />
                <text x="51" y="115">
                  queued
                </text>
                <rect x="190" y="92" width="102" height="36" rx="6" />
                <text x="241" y="115">
                  running
                </text>
                <rect x="430" y="22" width="110" height="36" rx="6" />
                <text x="485" y="45">
                  failed
                </text>
                <rect x="430" y="92" width="110" height="36" rx="6" className="tl-node-ok" />
                <text x="485" y="115">
                  succeeded
                </text>
                <rect x="430" y="162" width="110" height="36" rx="6" />
                <text x="485" y="185">
                  cancelled
                </text>
                <text x="241" y="150" fontSize="10" className="tl-node-note">
                  lease · heartbeat · progress
                </text>
                <text x="380" y="12" fontSize="10" className="tl-node-note">
                  retry with backoff until max_attempts
                </text>
              </g>
            </svg>

            <div
              className="tl-credits-flow"
              role="group"
              aria-label="Credit states for a paid render"
            >
              <ol className="tl-flow lo-mono">
                <li>
                  <span className="tl-flow-k">quote</span>
                  <span className="tl-flow-v">
                    immutable · v{SAMPLE.version} · {SAMPLE.creditCost} credits ·{' '}
                    {SAMPLE.priceVersion}
                  </span>
                </li>
                <li>
                  <span className="tl-flow-k">reserve</span>
                  <span className="tl-flow-v">
                    on approval · {SAMPLE.reservationId}
                    <span className="tl-chip tl-chip-reserve" aria-hidden>
                      {SAMPLE.creditCost}
                    </span>
                  </span>
                </li>
                <li>
                  <span className="tl-flow-k">settle</span>
                  <span className="tl-flow-v">
                    once, in the completion transaction · {SAMPLE.ledgerId}
                    <span className="tl-chip tl-chip-settle" aria-hidden>
                      {SAMPLE.creditCost}
                    </span>
                  </span>
                </li>
                <li>
                  <span className="tl-flow-k">release</span>
                  <span className="tl-flow-v">
                    on failure, cancel or lease loss · same idempotency key, never twice
                  </span>
                </li>
              </ol>
              <p className="tl-flow-note">
                Reserve, settle and release are ledger rows keyed per workspace. A duplicate render
                request with the same <span className="lo-mono">idempotencyKey</span> returns the
                same task and moves no credits.
              </p>
            </div>
          </div>
        </InView>

        {/* 3 · Trust — redacted audit + human cost gate */}
        <InView as="section" className="tl-audit lo-wrap" threshold={0.2}>
          <div className="tl-audit-grid">
            <div>
              <p className="lo-eyebrow tl-eyebrow">Redacted by construction</p>
              <h2>Useful error details. Your transcript stays private.</h2>
              <pre
                className="tl-code lo-mono"
                aria-label="Public error and its audit event (example)"
              >
                <span className="tl-c">// public error, returned to the agent</span>
                {'\n'}
                {`{ "code": "RENDER_FAILED", "retryable": false,\n  "errorRef": "${SAMPLE.errorRef}" }`}
                {'\n\n'}
                <span className="tl-c">// audit event, looked up by errorRef</span>
                {'\n'}
                {`${SAMPLE.auditId} · render_export.failed\n  task=${SAMPLE.taskId} version=${SAMPLE.version}\n  hash=${shortHash(SAMPLE.hashV3, 8, 6)} reservation=released\n  transcript=`}
                <span className="tl-redact">∅ never logged</span>
              </pre>
            </div>
            <div>
              <p className="lo-eyebrow tl-eyebrow">Human cost gate</p>
              <h2>Every paid render waits for your exact approval.</h2>
              <pre className="tl-code lo-mono" aria-label="Approval request (example)">
                {`render_caption_export {\n  approval: {\n    quoteId: "${SAMPLE.quoteId}",\n    `}
                <span className="tl-amber">approvedCreditCost: {SAMPLE.creditCost}</span>
                {`\n  },\n  idempotencyKey: "${SAMPLE.idempotencyKey}"\n}`}
              </pre>
              <ul className="tl-rules lo-mono">
                <li>
                  <span>{SAMPLE.creditCost} ≠ quoted</span>
                  <span>QUOTE_MISMATCH · nothing reserved</span>
                </li>
                <li>
                  <span>quote past expiresAt</span>
                  <span>QUOTE_EXPIRED · nothing reserved</span>
                </li>
                <li>
                  <span>project edited after quote</span>
                  <span>QUOTE_INVALIDATED · re-quote</span>
                </li>
                <li>
                  <span>balance short</span>
                  <span>INSUFFICIENT_CREDITS · 402</span>
                </li>
              </ul>
            </div>
          </div>
        </InView>

        {/* 4 · Final */}
        <section className="tl-final lo-wrap lo-end" aria-labelledby="tl-h4">
          <h2 id="tl-h4">
            Batch-caption videos with an agent.
            <br />
            <em>Track every result.</em>
          </h2>
          <div className="tl-cta">
            <Link href="/sign-in" className="lo-btn tl-btn-primary">
              Caption a video
            </Link>
            <Link href="/developers" className="lo-btn tl-btn-ghost">
              View agent API
            </Link>
          </div>
          <p className="tl-foot lo-mono">
            {MCP_TOOLS.map((t) => t.name).join(' · ')}
            <br />
            {OUTPUTS.map((o) => o.label).join(' / ')} · 5 presets · 4 motions · /api/mcp
          </p>
        </section>
      </main>

      <OptionSwitcher current="task-ledger" />
    </div>
  );
}
