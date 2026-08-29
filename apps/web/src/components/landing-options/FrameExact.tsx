import Link from 'next/link';
import { FrameCounter } from './FrameCounter';
import { OptionSwitcher } from './OptionSwitcher';
import { EDITED_WORD, MOTION_PRESETS, OUTPUTS, SAMPLE, STYLE_PRESETS, shortHash, timecode } from './facts';
import './frame-exact.css';

const page1 = SAMPLE.pages[0].wordIds.map((id) => SAMPLE.words.find((w) => w.id === id)!);
const page2 = SAMPLE.pages[1].wordIds.map((id) => SAMPLE.words.find((w) => w.id === id)!);
const captionSpanMs = SAMPLE.words.at(-1)!.endMs;

export function FrameExact() {
  return (
    <div data-lo="frame-exact" className="fx">
      <header className="fx-top lo-wrap">
        <Link href="/" className="fx-brand" aria-label="ClipSubtitles home">
          <span className="fx-brand-mark" aria-hidden>
            cs
          </span>
          ClipSubtitles
        </Link>
        <span className="fx-top-readout lo-mono" aria-label="Current project version and hash">
          v{SAMPLE.version} · {shortHash(SAMPLE.hashV3)}
        </span>
        <nav className="fx-nav" aria-label="Primary">
          <Link href="/docs">Agents</Link>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>

      <main>
        {/* 1 · Hero — the frame */}
        <section className="fx-hero lo-wrap" aria-labelledby="fx-h1">
          <figure className="fx-stage" aria-label="Vertical frame with a spring-pop caption">
            <div className="fx-frame">
              <div className="fx-frame-video" />
              <span className="fx-frame-readout lo-mono fx-frame-tl">{SAMPLE.projectId}</span>
              <span className="fx-frame-readout lo-mono fx-frame-tr">{timecode(SAMPLE.excerptStartMs)}</span>
              <div className="fx-band" aria-hidden>
                <p className="fx-caption lo-cap fx-caption-a">
                  {page1.map((w) => (
                    <span key={w.id} className="fx-cap-word">
                      {w.text}
                    </span>
                  ))}
                </p>
                <p className="fx-caption lo-cap fx-caption-b">
                  {page2.map((w) => (
                    <span key={w.id} className={`fx-cap-word${w.was ? ' fx-cap-word-edited' : ''}`}>
                      {w.text}
                    </span>
                  ))}
                </p>
              </div>
              <span className="lo-sr">Caption: {SAMPLE.words.map((w) => w.text).join(' ')}</span>
              <span className="fx-frame-readout lo-mono fx-frame-bl">
                {SAMPLE.width}×{SAMPLE.height} · sha256 {shortHash(SAMPLE.hashV3, 6, 6)}
              </span>
            </div>
            <div className="fx-ticks" role="img" aria-label="Word ticks: one tick per word at its start time">
              {SAMPLE.words.map((w) => (
                <span
                  key={w.id}
                  className={`fx-tick${w.was ? ' fx-tick-edited' : ''}`}
                  style={{ left: `${(w.startMs / captionSpanMs) * 100}%`, width: `${((w.endMs - w.startMs) / captionSpanMs) * 100}%` }}
                  title={`${w.text} ${w.startMs}–${w.endMs} ms`}
                />
              ))}
            </div>
            <FrameCounter frames={SAMPLE.frames} fps={SAMPLE.fps} startFrame={Math.round((SAMPLE.excerptStartMs / 1000) * SAMPLE.fps)} />
          </figure>

          <div className="fx-hero-copy">
            <p className="lo-eyebrow fx-eyebrow">Deterministic captions for agents and editors</p>
            <h1 id="fx-h1">
              Word-exact captions.
              <br />
              <em>Byte-exact renders.</em>
            </h1>
            <p className="fx-lede">
              Your agent transcribes, segments and renders. You change a word, not a paragraph. The same version and hash produce the same bytes,
              every time.
            </p>
            <div className="fx-cta">
              <Link href="/docs" className="lo-btn fx-btn-primary">
                Connect an agent
              </Link>
              <Link href="/sign-in" className="lo-btn fx-btn-ghost">
                Open the studio
              </Link>
            </div>
          </div>
        </section>

        {/* 2 · Product proof — 5 × 4 */}
        <section className="fx-matrix-section lo-wrap" aria-labelledby="fx-h2">
          <div className="fx-section-head">
            <p className="lo-eyebrow fx-eyebrow">5 presets × 4 motions</p>
            <h2 id="fx-h2">Twenty looks. One layout engine.</h2>
            <p>
              Sizes are fractions of the shorter frame side, so a preset looks the same at 720p, 1080p and source. The editor overlay, the Skia
              rasterizer and the renderer call the same <span className="lo-mono">layoutCaption</span>.
            </p>
          </div>
          <div className="fx-matrix-scroll">
            <table className="fx-matrix">
              <thead>
                <tr>
                  <th scope="col" className="lo-mono">
                    preset ↓ motion →
                  </th>
                  {MOTION_PRESETS.map((m) => (
                    <th key={m} scope="col" className="lo-mono">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STYLE_PRESETS.map((p, pi) => (
                  <tr key={p}>
                    <th scope="row" className="lo-mono">
                      {p}
                    </th>
                    {MOTION_PRESETS.map((m, mi) => (
                      <td key={m}>
                        <span className={`fx-tile fx-tile-${p} fx-tile-m-${m} lo-cap`} style={{ ['--d' as string]: pi * 4 + mi }} aria-label={`${p} with ${m}`}>
                          <span className="fx-tile-word">update</span>
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3 · Workflow & trust — timing proof + checksum */}
        <section className="fx-proof lo-wrap" aria-labelledby="fx-h3">
          <div className="fx-proof-grid">
            <div>
              <p className="lo-eyebrow fx-eyebrow">Exact-word timing proof</p>
              <h2 id="fx-h3">One word changed. One version bumped.</h2>
              <table className="fx-words lo-mono">
                <thead>
                  <tr>
                    <th scope="col">word</th>
                    <th scope="col">start</th>
                    <th scope="col">end</th>
                    <th scope="col">op</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE.words.map((w) => (
                    <tr key={w.id} className={w.was ? 'fx-words-edited' : undefined}>
                      <td>
                        {w.was ? (
                          <>
                            <s>{w.was}</s> {w.text}
                          </>
                        ) : (
                          w.text
                        )}
                      </td>
                      <td>{w.startMs}</td>
                      <td>{w.endMs}</td>
                      <td>{w.was ? 'replace_word_text' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="fx-proof-note">
                The patch is <span className="lo-mono">{`{ op: "replace_word_text", wordId: "${EDITED_WORD.id}", text: "${EDITED_WORD.text}" }`}</span> against{' '}
                <span className="lo-mono">expectedVersion: {SAMPLE.prevVersion}</span>. Timings are untouched. The commit is v{SAMPLE.version}; open quotes
                on v{SAMPLE.prevVersion} are invalidated.
              </p>
            </div>

            <div>
              <p className="lo-eyebrow fx-eyebrow">Same input, same output</p>
              <h2>Render it twice. Compare the checksum.</h2>
              <dl className="fx-runs lo-mono">
                <div>
                  <dt>input</dt>
                  <dd>
                    v{SAMPLE.version} · {shortHash(SAMPLE.hashV3, 10, 6)} · 1080p · {SAMPLE.fps} fps · bold-pop · spring-pop
                  </dd>
                </div>
                <div>
                  <dt>run 1 · mp4</dt>
                  <dd className="fx-run-hash">{shortHash(SAMPLE.renderHash, 16, 8)}</dd>
                </div>
                <div>
                  <dt>run 2 · mp4</dt>
                  <dd className="fx-run-hash">{shortHash(SAMPLE.renderHash, 16, 8)}</dd>
                </div>
                <div className="fx-run-verdict">
                  <dt>diff</dt>
                  <dd>0 bytes</dd>
                </div>
              </dl>
              <p className="fx-proof-note">
                Captions are rasterized with Skia and composited by FFmpeg running <span className="lo-mono">-fflags +bitexact -map_metadata -1</span>.
                Motion is evaluated on the exact frame grid. <span className="lo-mono">pnpm smoke:render</span> renders the demo fixture twice and asserts
                byte identity; renderer tests assert full-frame and cropped-band identity.
              </p>
            </div>
          </div>
        </section>

        {/* 4 · Final */}
        <section className="fx-final lo-wrap lo-end" aria-labelledby="fx-h4">
          <h2 id="fx-h4">
            Exact words. Exact frames.
            <br />
            <em>Exact cost, approved by you.</em>
          </h2>
          <p>
            Every paid render starts as an immutable quote pinned to a version and a hash. Approve the credits to the unit or nothing renders.
          </p>
          <div className="fx-cta">
            <Link href="/docs" className="lo-btn fx-btn-primary">
              Connect an agent
            </Link>
            <Link href="/sign-in" className="lo-btn fx-btn-ghost">
              Open the studio
            </Link>
          </div>
          <p className="fx-foot lo-mono">8 MCP tools · {OUTPUTS.map((o) => o.label).join(' / ')} · /api/mcp</p>
        </section>
      </main>

      <OptionSwitcher current="frame-exact" />
    </div>
  );
}
