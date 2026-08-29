import Link from 'next/link';
import { OUTPUTS, SAMPLE } from './facts';
import { GatesStory } from './GatesStory';
import { OptionSwitcher } from './OptionSwitcher';
import { CaptionFrame, PAGE_ONE, StyleBoard } from './StyleBoard';
import './three-gates.css';

const EXPORTS: Array<[string, string]> = [
  ['Captioned MP4', 'Your video with the captions burned in. Post it as it is.'],
  [
    'Transparent overlay',
    'A ProRes 4444 MOV of just the captions, so you can drop them over your own edit.',
  ],
  [
    'SRT',
    'A standard subtitle file with the same words and timing, for platforms that add captions themselves.',
  ],
  ['VTT', 'Web captions for video players and sites, with the same words and timing.'],
];

const AUDIENCES: Array<[string, string]> = [
  [
    'Creators & editors',
    'Turn a raw clip into polished, readable captions without spending another half-hour on a timeline.',
  ],
  [
    'Studios & agencies',
    'Give every clip in a series the same look and deliver the video, overlay and subtitle files together.',
  ],
];

const FAQS: Array<[string, string]> = [
  [
    'Can I correct the captions?',
    'Yes. Review the transcript and change individual words before you export. The rest of the timing stays put.',
  ],
  [
    'Can I preview the style before I pay?',
    'Yes. Choose a style and motion, then preview the current version of your clip at low resolution. Nothing is charged for that.',
  ],
  [
    'Which files can I download?',
    'Any combination of a captioned MP4, a transparent caption overlay, SRT and VTT. They all share the same approved words and timing.',
  ],
  [
    'What does a render cost?',
    'You see a fixed credit price for the quality and files you chose before a paid render starts, like the example above. SRT and VTT files are free.',
  ],
];

const SAMPLE_MINUTES = SAMPLE.billableMinutes; // 0.4
const RATE_PER_MIN = Math.round(SAMPLE.creditCost / SAMPLE.billableMinutes); // 10 credits/min for 1080p MP4
const QUALITY = `${Math.min(SAMPLE.width, SAMPLE.height)}p`; // 1080p: the short side of the 1080×1920 sample
const OUTPUT_LABEL = Object.fromEntries(OUTPUTS.map((o) => [o.kind, o.label]));

export function ThreeGates() {
  return (
    <div data-lo="three-gates" className="tg">
      <header className="tg-top lo-wrap">
        <Link href="/" className="tg-brand">
          ClipSubtitles
        </Link>
        <nav aria-label="Primary" className="tg-nav">
          <Link href="/docs">Docs</Link>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>

      <main>
        {/* 1 · Hero: the promise, and finished-caption proof in the first viewport. */}
        <section className="tg-hero lo-wrap" aria-labelledby="tg-h1">
          <div className="tg-hero-copy">
            <h1 id="tg-h1">
              Create styled video captions
              <br />
              <em>with your AI agent.</em>
            </h1>
            <p className="tg-lede">
              Upload a short video. ClipSubtitles transcribes it word by word, styles the captions,
              and gives you a finished MP4, a transparent overlay or subtitle files — after you have
              checked the words and the price.
            </p>
            <div className="tg-cta">
              <Link href="/sign-in" className="lo-btn tg-btn-primary">
                Caption a video
              </Link>
              <a href="#tg-how" className="lo-btn tg-btn-ghost">
                See how it works
              </a>
            </div>
            <p className="tg-tertiary">
              Building something?{' '}
              <Link href="/docs">Every step is available to agents through MCP and an API.</Link>
            </p>
          </div>

          <div className="tg-hero-proof">
            <div aria-hidden="true">
              <CaptionFrame
                style="bold-pop"
                motion="none"
                words={PAGE_ONE}
                readout={`00:00 · ${SAMPLE.title}`}
                className="tg-frame-hero"
              />
            </div>
            <dl className="tg-hero-meta">
              <div>
                <dt className="lo-eyebrow">Sample</dt>
                <dd>{SAMPLE.title} · 24 s vertical · Bold Pop</dd>
              </div>
              <div>
                <dt className="lo-eyebrow">Exports</dt>
                <dd>
                  <ul className="tg-formats lo-mono">
                    {OUTPUTS.map((o) => (
                      <li key={o.kind}>{o.label}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* 2 · How it works: the scroll story */}
        <section id="tg-how" className="tg-how lo-wrap" aria-labelledby="tg-how-title">
          <div className="tg-section-head">
            <p className="lo-eyebrow tg-eyebrow">How it works</p>
            <h2 id="tg-how-title">One clip. Three quick checks.</h2>
          </div>
          <GatesStory />
        </section>

        {/* 3 · Files and price */}
        <section className="tg-section tg-exports lo-wrap" aria-labelledby="tg-export-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">Files and price</p>
            <h2 id="tg-export-title">One approved edit. Four files. One fixed price.</h2>
            <p>
              Choose the files you need. You see the exact credit price for that choice before a
              paid render starts, and nothing renders until you approve it.
            </p>
          </div>
          <div className="tg-export-wrap">
            <ol className="tg-export-list">
              {EXPORTS.map(([title, body], i) => (
                <li key={title}>
                  <span className="lo-mono">0{i + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="tg-quote-card" role="group" aria-labelledby="tg-quote-title">
              <p id="tg-quote-title" className="lo-eyebrow tg-quote-eyebrow">
                Example quote · sample clip
              </p>
              <dl className="tg-quote-lines">
                <div>
                  <dt>Clip</dt>
                  <dd>
                    {SAMPLE.title} · {SAMPLE_MINUTES} min
                  </dd>
                </div>
                <div>
                  <dt>Quality</dt>
                  <dd>{QUALITY}</dd>
                </div>
                <div>
                  <dt>Files</dt>
                  <dd>{SAMPLE.outputs.map((k) => OUTPUT_LABEL[k]).join(' + ')}</dd>
                </div>
                <div>
                  <dt>
                    MP4 · {SAMPLE_MINUTES} min × {RATE_PER_MIN} credits/min
                  </dt>
                  <dd>{SAMPLE.creditCost} credits</dd>
                </div>
                <div>
                  <dt>SRT</dt>
                  <dd>free</dd>
                </div>
              </dl>
              <p className="tg-quote-total">
                <span>Price you approve</span>
                <strong>{SAMPLE.creditCost} credits</strong>
              </p>
              <p className="tg-quote-foot">
                Example only. Every paid render shows its own fixed price first. SRT and VTT files
                are free.
              </p>
            </div>
          </div>
        </section>

        {/* 4 · Styles: real controls */}
        <section className="tg-section tg-styles lo-wrap" aria-labelledby="tg-styles-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">Caption styles</p>
            <h2 id="tg-styles-title">Polished captions without the timeline work.</h2>
            <p>
              Five ready-made looks, four motion presets. Try them here, then reuse the same choices
              to keep a whole series consistent.
            </p>
          </div>
          <StyleBoard />
        </section>

        {/* Mid-page CTA */}
        <section className="tg-mid lo-wrap" aria-labelledby="tg-mid-title">
          <h2 id="tg-mid-title">Try it on your own clip.</h2>
          <Link href="/sign-in" className="lo-btn tg-btn-primary">
            Caption a video
          </Link>
        </section>

        {/* 5 · Audience */}
        <section className="tg-section tg-audience lo-wrap" aria-labelledby="tg-audience-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">Built for repeat video work</p>
            <h2 id="tg-audience-title">More publishing. Less caption editing.</h2>
          </div>
          <div className="tg-audience-body">
            <ul className="tg-audience-grid">
              {AUDIENCES.map(([title, body]) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ul>
            <div className="tg-agent-note">
              <p>
                <strong>For builders:</strong> import, caption, edit, preview and export through MCP
                or the API. Paid renders still wait for a person&rsquo;s approval.
              </p>
              <Link href="/docs">Read the docs →</Link>
            </div>
          </div>
        </section>

        {/* 6 · FAQ */}
        <section className="tg-section tg-faq lo-wrap" aria-labelledby="tg-faq-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">Questions</p>
            <h2 id="tg-faq-title">What you need to know.</h2>
          </div>
          <div className="tg-faq-list">
            {FAQS.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden>+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 7 · Final */}
        <section className="tg-final lo-wrap lo-end" aria-labelledby="tg-h4">
          <h2 id="tg-h4">
            Your words. Your look. <em>Ready to post.</em>
          </h2>
          <p>Caption one clip and see the whole flow.</p>
          <div className="tg-cta">
            <Link href="/sign-in" className="lo-btn tg-btn-primary">
              Caption a video
            </Link>
            <Link href="/docs" className="lo-btn tg-btn-ghost">
              Read the docs
            </Link>
          </div>
        </section>
      </main>

      <OptionSwitcher current="three-gates" />
    </div>
  );
}
