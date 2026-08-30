import Link from 'next/link';
import { OUTPUTS, SAMPLE } from './facts';
import { GatesStory } from './GatesStory';
import { OptionSwitcher } from './OptionSwitcher';
import { CaptionFrame, PAGE_ONE, StyleBoard } from './StyleBoard';
import { SITE_URL } from '@/components/marketing/seo-pages';
import { FootageReel } from '@/components/marketing/FootageReel';
import { ConnectAgent } from './ConnectAgent';
import { HeroConnect } from './HeroConnect';
import './landing-options.css';
import './three-gates.css';

const AUDIENCES: Array<[string, string]> = [
  [
    'Creators & editors',
    'Add readable, animated captions to short videos without rebuilding every word on a timeline.',
  ],
  [
    'Studios & agencies',
    'Reuse the same caption look across a series, then deliver publish-ready video and subtitle files.',
  ],
];

const FAQS: Array<[string, string]> = [
  [
    'How do I add captions to a video?',
    'Upload a short video and ClipSubtitles generates timed captions from its speech. Review the transcript, choose a style and motion, preview the result, then export the captioned video or subtitle files you need.',
  ],
  [
    'Can I edit automatic video captions?',
    'Yes. Review the transcript and change individual words before you export. The surrounding word timing stays in place, so a small correction does not mean rebuilding the whole caption track.',
  ],
  [
    'Can I create animated captions?',
    'Yes. Choose a caption style and motion preset, then preview the current version of your clip before starting a paid render.',
  ],
  [
    'Which subtitle and video files can I export?',
    'You can export a captioned MP4, a transparent caption overlay, SRT or VTT from the same approved words and timing. The available catalog can expand without changing the workflow.',
  ],
  [
    'Can an AI agent caption videos through an API?',
    'Yes. Agents can import a clip, generate captions, apply explicit word edits, choose a style, request a preview and prepare an export through MCP or the video caption API. Paid renders still wait for human approval.',
  ],
];

const RELATED_PAGES = [
  ['/add-captions-to-video', 'Add captions to video'],
  ['/automatic-video-captions', 'Automatic video captions'],
  ['/animated-video-captions', 'Animated video captions'],
  ['/video-caption-api', 'Video caption API'],
  ['/transparent-caption-overlay', 'Transparent caption overlays'],
] as const;

export function ThreeGates({ showSwitcher = true }: { showSwitcher?: boolean }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'ClipSubtitles',
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web',
        url: new URL('/ai-video-caption-generator', SITE_URL).toString(),
        description:
          'Generate automatic video captions, correct the transcript, choose a style and export a polished video or subtitle file.',
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQS.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  };

  return (
    <div data-lo="three-gates" className="tg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="tg-top lo-wrap">
        <Link href={showSwitcher ? "/landing-options/three-gates" : "/ai-video-caption-generator"} className="tg-brand">
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
            <p className="lo-eyebrow tg-eyebrow tg-hero-eyebrow">AI video caption generator</p>
            <h1 id="tg-h1">
              Create styled video captions{' '}
              <br />{' '}
              <em>with your AI agent.</em>
            </h1>
            <p className="tg-lede">
              Upload a short video and generate automatic captions with word-level timing. Correct
              the transcript, choose a caption style and motion, preview the result, then export it
              for publishing.
            </p>
            <div className="tg-cta">
              <Link href="/sign-in" className="lo-btn tg-btn-primary">
                Caption a video
              </Link>
              <a href="#tg-how" className="lo-btn tg-btn-ghost">
                See how it works
              </a>
            </div>
            <HeroConnect />
          </div>

          <div className="tg-hero-proof">
            <div aria-hidden="true">
              <CaptionFrame
                style="bold-pop"
                motion="none"
                words={PAGE_ONE}
                readout={`00:00 · ${SAMPLE.title}`}
                className="tg-frame-hero"
                priority
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
            <p className="lo-eyebrow tg-eyebrow">How to add captions to a video</p>
            <h2 id="tg-how-title">Upload your clip. Leave with polished captions.</h2>
          </div>
          <GatesStory />
        </section>

        {/* 3 · Styles: real controls */}
        <section className="tg-section tg-styles lo-wrap" aria-labelledby="tg-styles-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">Animated video captions</p>
            <h2 id="tg-styles-title">Choose a caption style that fits your video.</h2>
            <p>
              Explore readable looks and motion presets for short-form video. Preview a direction,
              then reuse it to keep every clip in a series visually consistent—without manual keyframes.
            </p>
          </div>
          <StyleBoard />
        </section>

        <FootageReel />

        {/* Mid-page CTA */}
        <section className="tg-mid lo-wrap" aria-labelledby="tg-mid-title">
          <h2 id="tg-mid-title">Try it on your own clip.</h2>
          <Link href="/sign-in" className="lo-btn tg-btn-primary">
            Caption a video
          </Link>
        </section>

        {/* 4 · Audience */}
        <section className="tg-section tg-audience lo-wrap" aria-labelledby="tg-audience-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">Built for repeat video work</p>
            <h2 id="tg-audience-title">Video captioning for creators, editors and agencies.</h2>
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
            <ConnectAgent />
          </div>
        </section>

        <nav className="tg-related lo-wrap" aria-labelledby="tg-related-title">
          <p className="lo-eyebrow tg-eyebrow">Explore caption workflows</p>
          <h2 id="tg-related-title">Find the right way to caption your video.</h2>
          <ul>
            {RELATED_PAGES.map(([href, label]) => (
              <li key={href}>
                <Link href={href}>{label}<span aria-hidden>↗</span></Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* 5 · FAQ */}
        <section className="tg-section tg-faq lo-wrap" aria-labelledby="tg-faq-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">Questions</p>
            <h2 id="tg-faq-title">Questions about automatic video captions.</h2>
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

        {/* 6 · Final */}
        <section className="tg-final lo-wrap lo-end" aria-labelledby="tg-h4">
          <h2 id="tg-h4">
            Create polished captions <em>for your next video.</em>
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

      {showSwitcher ? <OptionSwitcher current="three-gates" /> : null}
    </div>
  );
}
