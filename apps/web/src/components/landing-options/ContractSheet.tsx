import Link from 'next/link';
import type { ReactNode } from 'react';
import { InView } from './InView';
import { OptionSwitcher } from './OptionSwitcher';
import { EDITED_WORD, GUARANTEES, MCP_TOOLS, OUTPUTS, SAMPLE, shortHash } from './facts';
import './contract-sheet.css';

type Field =
  | 'quoteId'
  | 'approvedCreditCost'
  | 'idempotencyKey'
  | 'projectVersion'
  | 'contentHash'
  | 'expiresAt';

/** A prose term linked to a schema field in Exhibit A; hover/focus highlights the field. */
function Term({ field, children }: { field: Field; children: ReactNode }) {
  return (
    <a href="#exhibit-a" className="cs-term lo-mono" data-field={field}>
      {children}
    </a>
  );
}

function F({ field, children }: { field: Field; children: ReactNode }) {
  return (
    <span className="cs-field" data-field={field}>
      {children}
    </span>
  );
}

const WORKFLOW = [
  {
    n: '1.1',
    title: 'Import',
    body: (
      <>
        The agent calls <span className="lo-mono">create_caption_project</span> with an upload
        target or URL. The clip is probed and hashed by a durable task before anything else runs.
      </>
    ),
  },
  {
    n: '1.2',
    title: 'Transcribe',
    body: (
      <>
        The agent calls <span className="lo-mono">generate_captions</span>. Words arrive with start
        and end times in a provider-neutral schema. Provider fallback happens only before a
        transcript exists.
      </>
    ),
  },
  {
    n: '1.3',
    title: 'Segment',
    body: (
      <>
        Pages are cut on pause, punctuation and clause boundaries. No word is rewritten, reordered
        or dropped by the system.
      </>
    ),
  },
  {
    n: '1.4',
    title: 'Edit',
    body: (
      <>
        Any change is an explicit per-word operation against{' '}
        <Term field="projectVersion">expectedVersion</Term> — for example{' '}
        <span className="lo-mono">replace_word_text</span> “{EDITED_WORD.was}” → “{EDITED_WORD.text}
        ”. Each commit bumps the version and the <Term field="contentHash">contentHash</Term>.
      </>
    ),
  },
  {
    n: '1.5',
    title: 'Quote',
    body: (
      <>
        A render request without approval returns an immutable quote: version, hash, expected
        outputs, credit cost, price version and an <Term field="expiresAt">expiry</Term>. Editing
        the project invalidates it.
      </>
    ),
  },
  {
    n: '1.6',
    title: 'Render',
    body: (
      <>
        The same call with <Term field="quoteId">quoteId</Term> and{' '}
        <Term field="approvedCreditCost">approvedCreditCost</Term> reserves credits and starts the
        render. Retrying with the same <Term field="idempotencyKey">idempotencyKey</Term> returns
        the same task.
      </>
    ),
  },
];

const RETAINED = [
  {
    n: '3.1',
    title: 'The exact words',
    body: 'Only a human-authored patch changes a word. The transcript is data, never an instruction, and never rewritten on the system’s initiative.',
  },
  {
    n: '3.2',
    title: 'The exact cost',
    body: 'Approval must echo the quoted credits to the unit. A mismatch is QUOTE_MISMATCH; an expired quote is QUOTE_EXPIRED; nothing is charged either way.',
  },
  {
    n: '3.3',
    title: 'The final outputs',
    body: 'MP4, transparent overlay, SRT, VTT — the selection is frozen inside the quote you approve, not chosen later.',
  },
];

export function ContractSheet() {
  return (
    <div data-lo="contract-sheet" className="cs">
      <header className="cs-mast">
        <Link href="/" className="cs-brand">
          ClipSubtitles
        </Link>
        <span className="lo-mono cs-mast-meta">
          Terms, as enforced by code · rev. {SAMPLE.priceVersion}
        </span>
        <nav aria-label="Primary" className="cs-mast-nav">
          <Link href="/developers">Agents</Link>
          <Link href="/sign-in">Studio</Link>
        </nav>
      </header>

      <main>
        {/* §0 Hero */}
        <section className="cs-hero" aria-labelledby="cs-h1">
          <p className="cs-clause-n lo-mono">§ 0</p>
          <h1 id="cs-h1">
            A video caption API,
            <br />
            with human approval built in.
          </h1>
          <p className="cs-lede">
            Send a short video; your agent transcribes, styles, previews and renders it. Exact
            words, render cost and output formats stay subject to your approval — and the code
            enforces it.
          </p>
          <div className="cs-cta">
            <Link href="/sign-in" className="lo-btn cs-btn-primary">
              Caption a video
            </Link>
            <Link href="/developers" className="lo-btn cs-btn-ghost">
              View agent API
            </Link>
          </div>

          <figure className="cs-exhibit" id="exhibit-a" aria-labelledby="cs-exhibit-cap">
            <figcaption id="cs-exhibit-cap" className="lo-mono">
              Exhibit A — the render request, as validated by the API. Example values.
            </figcaption>
            <div className="cs-exhibit-grid">
              <pre className="lo-mono" aria-label="Request">
                <span className="cs-c">
                  // MCP · render_caption_export · REST · POST /v1/projects/{'{id}'}/renders
                </span>
                {'\n'}
                {'{\n'}
                {'  "projectId": "'}
                {SAMPLE.projectId}
                {'",\n'}
                {'  "approval": {\n'}
                {'    "'}
                <F field="quoteId">quoteId</F>
                {'": "'}
                <F field="quoteId">{SAMPLE.quoteId}</F>
                {'",\n'}
                {'    "'}
                <F field="approvedCreditCost">approvedCreditCost</F>
                {'": '}
                <F field="approvedCreditCost">{SAMPLE.creditCost}</F>
                {'\n'}
                {'  },\n'}
                {'  "'}
                <F field="idempotencyKey">idempotencyKey</F>
                {'": "'}
                <F field="idempotencyKey">{SAMPLE.idempotencyKey}</F>
                {'"\n'}
                {'}'}
              </pre>
              <pre className="lo-mono" aria-label="Quote being approved">
                <span className="cs-c">// the quote being approved · status: open</span>
                {'\n'}
                {'{\n'}
                {'  "id": "'}
                <F field="quoteId">{SAMPLE.quoteId}</F>
                {'",\n'}
                {'  "'}
                <F field="projectVersion">projectVersion</F>
                {'": '}
                <F field="projectVersion">{SAMPLE.version}</F>
                {',\n'}
                {'  "'}
                <F field="contentHash">contentHash</F>
                {'": "'}
                <F field="contentHash">{shortHash(SAMPLE.hashV3, 12, 8)}</F>
                {'",\n'}
                {'  "expectedOutputs": ['}
                {SAMPLE.outputs.map((o) => `"${o}"`).join(', ')}
                {'],\n'}
                {'  "billableMinutes": '}
                {SAMPLE.billableMinutes}
                {',\n'}
                {'  "'}
                <F field="approvedCreditCost">creditCost</F>
                {'": '}
                <F field="approvedCreditCost">{SAMPLE.creditCost}</F>
                {',\n'}
                {'  "priceVersion": "'}
                {SAMPLE.priceVersion}
                {'",\n'}
                {'  "'}
                <F field="expiresAt">expiresAt</F>
                {'": "'}
                <F field="expiresAt">{SAMPLE.quoteExpiresAt}</F>
                {'"\n'}
                {'}'}
              </pre>
            </div>
          </figure>
        </section>

        {/* §1 Workflow clauses */}
        <InView as="section" className="cs-section" threshold={0.15}>
          <h2 className="cs-h2">
            <span className="cs-clause-n lo-mono">§ 1</span> Workflow
          </h2>
          <ol className="cs-clauses">
            {WORKFLOW.map((c, i) => (
              <li key={c.n} className="cs-clause" style={{ ['--i' as string]: i }}>
                <span className="cs-clause-n lo-mono">{c.n}</span>
                <div>
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </InView>

        {/* §2 Guarantees + §3 Retained decisions */}
        <InView as="section" className="cs-section" threshold={0.15}>
          <h2 className="cs-h2">
            <span className="cs-clause-n lo-mono">§ 2</span> Enforced by code
          </h2>
          <ol className="cs-clauses cs-clauses-tight">
            {GUARANTEES.map((g, i) => (
              <li key={g} className="cs-clause" style={{ ['--i' as string]: i }}>
                <span className="cs-clause-n lo-mono">2.{i + 1}</span>
                <p>{g}</p>
              </li>
            ))}
          </ol>
        </InView>

        <InView as="section" className="cs-section" threshold={0.15}>
          <h2 className="cs-h2">
            <span className="cs-clause-n lo-mono">§ 3</span> Decisions retained by the person
          </h2>
          <ol className="cs-clauses">
            {RETAINED.map((c, i) => (
              <li key={c.n} className="cs-clause cs-clause-ox" style={{ ['--i' as string]: i }}>
                <span className="cs-clause-n lo-mono">{c.n}</span>
                <div>
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </InView>

        {/* §4 Outputs + tools schedule */}
        <InView as="section" className="cs-section" threshold={0.15}>
          <h2 className="cs-h2">
            <span className="cs-clause-n lo-mono">§ 4</span> Schedules
          </h2>
          <div className="cs-schedules">
            <table className="cs-table">
              <caption className="lo-mono">Schedule A — output formats</caption>
              <thead>
                <tr>
                  <th scope="col">Kind</th>
                  <th scope="col">Container</th>
                  <th scope="col">Contents</th>
                </tr>
              </thead>
              <tbody>
                {OUTPUTS.map((o) => (
                  <tr key={o.kind}>
                    <th scope="row" className="lo-mono">
                      {o.kind}
                    </th>
                    <td className="lo-mono">.{o.container}</td>
                    <td>{o.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="cs-table">
              <caption className="lo-mono">Schedule B — the eight tools</caption>
              <tbody>
                {MCP_TOOLS.map((t) => (
                  <tr key={t.name}>
                    <th scope="row" className="lo-mono">
                      {t.name}
                    </th>
                    <td>{t.does}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cs-note">
            Schedule C — style presets{' '}
            <span className="lo-mono">clean · bold-pop · lower-third · karaoke · minimal</span>;
            motion presets{' '}
            <span className="lo-mono">none · soft-rise · spring-pop · karaoke-slide</span>. Rendered
            by a deterministic Skia + FFmpeg pipeline; the same version and hash produce
            byte-identical files.
          </p>
        </InView>

        {/* Final */}
        <section className="cs-final lo-end" aria-labelledby="cs-h4">
          <h2 id="cs-h4">
            Every promise here
            <br />
            is checked by the API.
          </h2>
          <p>
            Every clause above maps to a type in <span className="lo-mono">packages/contracts</span>{' '}
            and a route that validates it. The OpenAPI 3.1 document is at{' '}
            <Link href="/openapi.json">/openapi.json</Link>; the MCP endpoint is{' '}
            <span className="lo-mono">/api/mcp</span>.
          </p>
          <div className="cs-cta">
            <Link href="/sign-in" className="lo-btn cs-btn-primary">
              Caption a video
            </Link>
            <Link href="/developers" className="lo-btn cs-btn-ghost">
              View agent API
            </Link>
          </div>
        </section>
      </main>

      <OptionSwitcher current="contract-sheet" />
    </div>
  );
}
