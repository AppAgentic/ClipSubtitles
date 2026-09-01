import Link from 'next/link';
import Image from 'next/image';
import { GatesStory } from './GatesStory';
import { HeroCaptionVideo } from './HeroCaptionVideo';
import { OptionSwitcher } from './OptionSwitcher';
import { PathChooser } from './PathChooser';
import { StyleBoard } from './StyleBoard';
import { SITE_URL } from '@/components/marketing/seo-pages';
import { ConnectAgent } from './ConnectAgent';
import { ClipSubtitlesWordmark } from '@/components/brand/ClipSubtitlesWordmark';
import { PricingSection } from '@/components/marketing/PricingSection';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import './landing-options.css';
import './three-gates.css';

const AUDIENCES = [
  {
    title: 'Creators & editors',
    body: 'Add readable, animated captions to short videos without rebuilding every word on a timeline.',
    image: '/marketing/audience-creators-editors.webp',
    alt: 'A creator reviewing animated captions at an editing desk.',
  },
  {
    title: 'Studios & agencies',
    body: 'Reuse the same caption look across a series, then deliver publish-ready video and subtitle files.',
    image: '/marketing/audience-studios-agencies.webp',
    alt: 'A studio team reviewing a consistent set of captioned videos.',
  },
  {
    title: 'Agents & automation teams',
    body: 'Let ChatGPT, Claude, Codex or your own workflow prepare captioned videos while you keep approval over the final export.',
    image: '/marketing/audience-agents-automation.webp',
    alt: 'A builder connecting an AI workflow to a human-approved captioned video.',
  },
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
    'Choose a captioned video, transparent caption overlay or separate subtitle file from the same reviewed words and timing.',
  ],
  [
    'Can an AI agent caption videos through an API?',
    'Yes. Agents can import a clip, generate captions, apply word edits, choose a style, request a preview and prepare an export through MCP or the video caption API. A person still approves before a paid export begins.',
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
        url: new URL('/', SITE_URL).toString(),
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="tg-top lo-wrap">
        <Link href={showSwitcher ? '/landing-options/three-gates' : '/'} className="tg-brand">
          <ClipSubtitlesWordmark />
        </Link>
        <nav aria-label="Primary" className="tg-nav">
          <Link href="/help">Help</Link>
          <Link href="#pricing">Pricing</Link>
          <Link href="/developers">Developers</Link>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>

      <main>
        {/* 1 · Hero: the promise, and finished-caption proof in the first viewport. */}
        <section className="tg-hero lo-wrap" aria-labelledby="tg-h1">
          <div className="tg-hero-copy">
            <p className="lo-eyebrow tg-eyebrow tg-hero-eyebrow">AI video caption generator</p>
            <h1 id="tg-h1">
              Create styled video captions <br /> <em>with your AI agent.</em>
            </h1>
            <p className="tg-lede">
              Upload a clip—or hand it to your AI agent. Review every word, choose a style, and
              download a publish-ready captioned video.
            </p>
            <div className="tg-cta">
              <Link href="/sign-in?returnTo=/app/new" className="lo-btn tg-btn-primary">
                Try for $0
              </Link>
              <a href="#tg-how" className="lo-btn tg-btn-ghost">
                See how it works
              </a>
            </div>
            <PathChooser />
          </div>

          <div className="tg-hero-proof">
            <HeroCaptionVideo />
          </div>
        </section>

        {/* 2 · Styles: real controls, the first full section after the hero */}
        <section className="tg-section tg-styles lo-wrap" aria-labelledby="tg-styles-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">Animated video captions</p>
            <h2 id="tg-styles-title">Choose a caption style that fits your video.</h2>
            <p>
              Explore readable looks and motion presets for short-form video. Preview a direction,
              then reuse it to keep every clip in a series visually consistent—without manual
              keyframes.
            </p>
          </div>
          <StyleBoard />
        </section>

        {/* 3 · How it works: a static three-step strip, no scroll-jacking */}
        <section id="tg-how" className="tg-how lo-wrap" aria-labelledby="tg-how-title">
          <div className="tg-section-head">
            <p className="lo-eyebrow tg-eyebrow">How to add captions to a video</p>
            <h2 id="tg-how-title">Upload your clip. Leave with polished captions.</h2>
          </div>
          <GatesStory />
        </section>

        {/* Mid-page CTA */}
        <section className="tg-mid lo-wrap" aria-labelledby="tg-mid-title">
          <div className="tg-mid-copy">
            <p className="lo-eyebrow">Your first clip is on us</p>
            <h2 id="tg-mid-title">Try it on your own clip.</h2>
            <p>Upload, review and style it in the browser before you export.</p>
          </div>
          <svg className="tg-mid-arrow" viewBox="0 0 128 82" aria-hidden="true">
            <path d="M8 14c19 2 37 15 42 32 4 14-3 24-15 21-10-3-11-14-4-23 7-19 33-22 71-4" />
            <path d="m91 28 14 13-17 8" />
          </svg>
          <Link href="/sign-in?returnTo=/app/new" className="lo-btn tg-btn-primary">
            Try for $0
          </Link>
        </section>

        {/* 4 · Audience: concrete self-selection before the automation path. */}
        <section className="tg-section tg-audience lo-wrap" aria-labelledby="tg-audience-title">
          <div className="tg-section-copy">
            <div className="tg-audience-heading">
              <p className="lo-eyebrow tg-eyebrow">Made for the way you work</p>
              <h2 id="tg-audience-title">Who is ClipSubtitles for?</h2>
            </div>
            <p>
              Start with one clip in the browser, repeat a look across client work, or connect the
              same workflow to an AI agent.
            </p>
          </div>
          <div className="tg-audience-body">
            <ul className="tg-audience-grid">
              {AUDIENCES.map((audience) => (
                <li key={audience.title}>
                  <div className="tg-audience-visual">
                    <Image
                      src={audience.image}
                      alt={audience.alt}
                      fill
                      sizes="(max-width: 620px) calc(100vw - 72px), 30vw"
                    />
                  </div>
                  <h3>{audience.title}</h3>
                  <p>{audience.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Secondary path for people who want to operate ClipSubtitles through an agent. */}
        <ConnectAgent standalone />

        <PricingSection />

        <nav className="tg-related lo-wrap" aria-labelledby="tg-related-title">
          <p className="lo-eyebrow tg-eyebrow">Explore caption workflows</p>
          <h2 id="tg-related-title">Find the right way to caption your video.</h2>
          <ul>
            {RELATED_PAGES.map(([href, label]) => (
              <li key={href}>
                <Link href={href}>
                  {label}
                  <span aria-hidden>↗</span>
                </Link>
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

        <section className="tg-bottom-cta lo-wrap" aria-labelledby="tg-h4">
          <div>
            <p className="lo-eyebrow">Your first clip is on us</p>
            <h2 id="tg-h4">Ready to make every word worth watching?</h2>
            <p>Bring one video. Leave with styled, publish-ready captions.</p>
          </div>
          <div className="tg-cta">
            <Link href="/sign-in?returnTo=/app/new" className="lo-btn tg-bottom-primary">Try for $0</Link>
            <Link href="/developers" className="lo-btn tg-bottom-secondary">Connect your agent</Link>
          </div>
        </section>
      </main>

      <MarketingFooter />

      {showSwitcher ? <OptionSwitcher current="three-gates" /> : null}
    </div>
  );
}
