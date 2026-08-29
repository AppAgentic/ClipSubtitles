import Link from 'next/link';
import { GatesStory } from './GatesStory';
import { InView } from './InView';
import { OptionSwitcher } from './OptionSwitcher';
import './three-gates.css';

const STYLES = ['Clean', 'Bold Pop', 'Lower Third', 'Karaoke', 'Minimal'];
const MOTIONS = ['Still', 'Soft Rise', 'Spring Pop', 'Karaoke Slide'];
const EXPORTS = [
  ['Captioned MP4', 'A finished video you can post straight away.'],
  ['Transparent overlay', 'Animated captions to place over your own edit.'],
  ['SRT', 'A standard subtitle file for social platforms and editors.'],
  ['VTT', 'Web captions for video players and websites.'],
];
const AUDIENCES = [
  ['Creators & editors', 'Turn a raw clip into polished, readable captions without spending another half-hour on a timeline.'],
  ['Studios & agencies', 'Give every clip in a series the same look and deliver video, overlay and subtitle files together.'],
  ['Apps & AI agents', 'Add captioning to an automated workflow through MCP or a straightforward API.'],
];
const FAQS = [
  ['Do I need an AI agent?', 'No. You can caption a video in the web studio yourself. Agent tools are there when you want to automate repeat work.'],
  ['Can I correct the captions?', 'Yes. Review the transcript and change individual words before you export, without disturbing everything around them.'],
  ['Can I preview the style first?', 'Yes. Choose a caption style and motion, then preview the current clip before approving the final render.'],
  ['Which files can I download?', 'Choose any combination of a captioned MP4, transparent caption overlay, SRT and VTT. They all use the same approved words and timing.'],
  ['How does render pricing work?', 'You see a fixed credit price for the quality and files you selected before a paid render starts. Nothing renders until you approve it.'],
];

export function ThreeGates() {
  return (
    <div data-lo="three-gates" className="tg">
      <header className="tg-top lo-wrap">
        <Link href="/" className="tg-brand">
          ClipSubtitles
        </Link>
        <nav aria-label="Primary" className="tg-nav">
          <Link href="/docs">For agents</Link>
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
            Send a short video. Get back styled, animated captions and the files you need to publish. Your agent can handle the workflow; you stay in
            control of the words, look and final render.
          </p>
          <div className="tg-cta">
            <Link href="/sign-in" className="lo-btn tg-btn-primary">
              Caption a video
            </Link>
            <Link href="/docs" className="lo-btn tg-btn-ghost">
              Read the agent docs
            </Link>
          </div>
          <p className="tg-scroll lo-mono" aria-hidden>
            ↓ words · look · files
          </p>
        </section>

        {/* 2 · Product proof — the story */}
        <section className="lo-wrap" aria-labelledby="tg-how-title">
          <div className="tg-section-head">
            <p className="lo-eyebrow tg-eyebrow">How it works</p>
            <h2 id="tg-how-title">One clip. Three quick checks.</h2>
          </div>
          <GatesStory />
        </section>

        {/* 3 · Styles */}
        <InView as="section" className="tg-section tg-styles lo-wrap" threshold={0.18}>
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">Caption styles</p>
            <h2>Polished captions without the timeline work.</h2>
            <p>Choose a clear, ready-made look, add motion and preview it on your own video. Reuse the same choices to keep a series consistent.</p>
          </div>
          <div className="tg-style-board" aria-label="Available caption styles and motions">
            <div className="tg-style-preview lo-cap"><span>Make every</span><strong>word count.</strong></div>
            <ul className="tg-pills">
              {STYLES.map((style, i) => <li key={style} className={i === 1 ? 'is-active' : ''}>{style}</li>)}
            </ul>
            <p className="lo-eyebrow tg-board-label">Motion</p>
            <ul className="tg-motion-list lo-mono">
              {MOTIONS.map((motion, i) => <li key={motion}>{String(i + 1).padStart(2, '0')} {motion}</li>)}
            </ul>
          </div>
        </InView>

        {/* 4 · Outcomes */}
        <section className="tg-section tg-exports lo-wrap" aria-labelledby="tg-export-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">One edit, every file</p>
            <h2 id="tg-export-title">Ready to post. Ready to edit. Ready for anywhere.</h2>
          </div>
          <ul className="tg-export-grid">
            {EXPORTS.map(([title, body], i) => (
              <li key={title}><span className="lo-mono">0{i + 1}</span><h3>{title}</h3><p>{body}</p></li>
            ))}
          </ul>
        </section>

        {/* 5 · Value and audience */}
        <section className="tg-section tg-control lo-wrap" aria-labelledby="tg-control-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">No surprises at export</p>
            <h2 id="tg-control-title">See the result and the price before anything is final.</h2>
            <p>Review the words. Preview the style. Choose your files. Then approve one fixed credit price for the render you asked for.</p>
          </div>
          <div className="tg-approval" aria-label="What you approve before export">
            <span>Words checked</span><span>Style previewed</span><span>Files selected</span><strong>{'Approved →'}</strong>
          </div>
        </section>

        <section className="tg-section tg-audience lo-wrap" aria-labelledby="tg-audience-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">Built for repeatable video work</p>
            <h2 id="tg-audience-title">More publishing. Less caption editing.</h2>
          </div>
          <ul className="tg-audience-grid">
            {AUDIENCES.map(([title, body]) => <li key={title}><h3>{title}</h3><p>{body}</p></li>)}
          </ul>
          <div className="tg-agent-note">
            <p><strong>For builders:</strong> import, caption, edit, preview and export through MCP or API. Your agent can prepare everything, while paid renders still wait for your approval.</p>
            <Link href="/docs">Explore the agent API →</Link>
          </div>
        </section>

        {/* 6 · FAQ */}
        <section className="tg-section tg-faq lo-wrap" aria-labelledby="tg-faq-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">Questions, answered</p>
            <h2 id="tg-faq-title">What you need to know.</h2>
          </div>
          <div className="tg-faq-list">
            {FAQS.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden>+</span></summary><p>{answer}</p></details>)}
          </div>
        </section>

        {/* 7 · Final */}
        <section className="tg-final lo-wrap lo-end" aria-labelledby="tg-h4">
          <h2 id="tg-h4">Your words. Your look. <em>Ready to post.</em></h2>
          <p>Caption one clip and see the whole flow.</p>
          <div className="tg-cta">
            <Link href="/sign-in" className="lo-btn tg-btn-primary">
              Caption a video
            </Link>
            <Link href="/docs" className="lo-btn tg-btn-ghost">
              Read the agent docs
            </Link>
          </div>
        </section>
      </main>

      <OptionSwitcher current="three-gates" />
    </div>
  );
}
