import Link from 'next/link';
import Image from 'next/image';
import { ClipSubtitlesWordmark } from '@/components/brand/ClipSubtitlesWordmark';
import { CaptionFrame, PAGE_ONE } from '@/components/landing-options/StyleBoard';
import { SAMPLE } from '@/components/landing-options/facts';
import type { SeoPage } from './seo-pages';
import { SEO_PAGES, SITE_URL } from './seo-pages';
import { FootageReel } from './FootageReel';
import { MarketingFooter } from './MarketingFooter';
import { ConnectAgent } from '@/components/landing-options/ConnectAgent';
import '@/components/landing-options/landing-options.css';
import '@/components/landing-options/three-gates.css';
import './seo-intent.css';

/**
 * Every intent page walks the same Words → Look → Download shape as the
 * landing page, so the three steps reuse the landing's workflow artwork.
 */
const STEP_ART = [
  { image: '/marketing/workflow-words.webp', alt: 'Audio becoming editable caption lines' },
  { image: '/marketing/workflow-look.webp', alt: 'A vertical video with styled captions' },
  {
    image: '/marketing/workflow-download.webp',
    alt: 'A finished captioned video ready to download',
  },
] as const;

export function SeoIntentPage({ page }: { page: SeoPage }) {
  const related = Object.values(SEO_PAGES).filter((candidate) => candidate.slug !== page.slug);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': new URL(`/${page.slug}#webpage`, SITE_URL).toString(),
        url: new URL(`/${page.slug}`, SITE_URL).toString(),
        name: page.title,
        description: page.description,
        inLanguage: 'en',
        isPartOf: { '@id': new URL('/#website', SITE_URL).toString() },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': new URL('/#software', SITE_URL).toString(),
        name: 'ClipSubtitles',
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web',
        url: new URL(`/${page.slug}`, SITE_URL).toString(),
        description: page.description,
      },
      {
        '@type': 'FAQPage',
        '@id': new URL(`/${page.slug}#faq`, SITE_URL).toString(),
        mainEntity: page.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      },
    ],
  };

  return (
    <div data-lo="three-gates" className="tg si">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="tg-top lo-wrap">
        <Link href="/" className="tg-brand">
          <ClipSubtitlesWordmark />
        </Link>
        <nav aria-label="Primary" className="tg-nav">
          <Link href="/video-caption-api">API</Link>
          <Link href="/developers">Developers</Link>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>

      <main>
        {/* Hero: the intent in the landing's voice, with a styled frame as proof. */}
        <section className="si-hero lo-wrap" aria-labelledby="si-title">
          <div className="si-hero-copy">
            <p className="lo-eyebrow tg-eyebrow tg-hero-eyebrow">{page.eyebrow}</p>
            <h1 id="si-title">{page.headline}</h1>
            <p className="tg-lede">{page.lede}</p>
            <div className="tg-cta">
              <Link href="/sign-in?returnTo=/app/new" className="lo-btn tg-btn-primary">
                Caption a video
              </Link>
              <a href="#how" className="lo-btn tg-btn-ghost">
                See how it works
              </a>
            </div>
          </div>
          <figure className="si-proof">
            <p className="si-proof-label lo-mono" aria-hidden>
              Style preview · Bold Pop
            </p>
            <CaptionFrame
              style="bold-pop"
              motion="soft-rise"
              words={PAGE_ONE}
              readout={`00:00 · ${SAMPLE.title}`}
              className="tg-frame-hero"
              image={page.visual}
              priority
            />
            <figcaption>{page.proof}</figcaption>
          </figure>
        </section>

        {/* Quick answer: one framed surface so the direct answer reads as a unit. */}
        <section className="si-answer-wrap lo-wrap" aria-labelledby="si-answer-title">
          <div className="si-answer">
            <div className="si-answer-head">
              <p className="lo-eyebrow tg-eyebrow">Quick answer</p>
              <h2 id="si-answer-title">{page.answerTitle}</h2>
            </div>
            <p>{page.answerBody}</p>
          </div>
        </section>

        {/* How it works: the landing's Words → Look → Download strip, page copy. */}
        <section id="how" className="tg-how si-how lo-wrap" aria-labelledby="si-how-title">
          <div className="tg-section-head">
            <p className="lo-eyebrow tg-eyebrow">How it works</p>
            <h2 id="si-how-title">{page.howTitle}</h2>
            <p>{page.howBody}</p>
          </div>
          <ol className="tg-steps">
            {page.steps.map((step, index) => {
              const art = STEP_ART[Math.min(index, STEP_ART.length - 1)] ?? STEP_ART[0];
              return (
                <li key={step.title} className="tg-step">
                  <div className="tg-step-visual">
                    <Image
                      src={art.image}
                      alt={art.alt}
                      fill
                      sizes="(max-width: 860px) 100vw, 33vw"
                    />
                  </div>
                  <div className="tg-step-title">
                    <span className="tg-step-n lo-mono">{String(index + 1).padStart(2, '0')}</span>
                    <h3>{step.title}</h3>
                  </div>
                  <p>{step.body}</p>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="tg-section si-benefits lo-wrap" aria-labelledby="si-benefits-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">{page.benefitEyebrow}</p>
            <h2 id="si-benefits-title">{page.benefitTitle}</h2>
          </div>
          <ul className="si-benefit-list">
            {page.benefits.map((benefit) => (
              <li key={benefit.title}>
                <span className="si-benefit-mark" aria-hidden>
                  ✓
                </span>
                <div>
                  <h3>{benefit.title}</h3>
                  <p>{benefit.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {page.slug === 'video-caption-api' ? <ConnectAgent standalone /> : null}

        <FootageReel />

        <section className="tg-section tg-faq lo-wrap" aria-labelledby="si-faq-title">
          <div className="tg-section-copy">
            <p className="lo-eyebrow tg-eyebrow">Questions</p>
            <h2 id="si-faq-title">What you need to know.</h2>
          </div>
          <div className="tg-faq-list">
            {page.faqs.map((faq) => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <span aria-hidden>+</span>
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <nav className="tg-related lo-wrap" aria-labelledby="si-related-title">
          <p className="lo-eyebrow tg-eyebrow">Explore ClipSubtitles</p>
          <h2 id="si-related-title">More caption workflows.</h2>
          <ul>
            <li>
              <Link href="/">
                AI video caption generator<span aria-hidden>↗</span>
              </Link>
            </li>
            {related.map((candidate) => (
              <li key={candidate.slug}>
                <Link href={`/${candidate.slug}`}>
                  {candidate.eyebrow}
                  <span aria-hidden>↗</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Final: the landing's blue conversion panel, page copy and the same links. */}
        <section className="tg-bottom-cta lo-wrap" aria-labelledby="si-final-title">
          <div>
            <p className="lo-eyebrow">Your first clip is on us</p>
            <h2 id="si-final-title">{page.finalTitle}</h2>
            <p>{page.finalBody}</p>
          </div>
          <div className="tg-cta">
            <Link href="/sign-in?returnTo=/app/new" className="lo-btn tg-bottom-primary">
              Caption a video
            </Link>
            <Link href="/developers" className="lo-btn tg-bottom-secondary">
              Build with ClipSubtitles
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
