import Link from 'next/link';
import { ClipSubtitlesWordmark } from '@/components/brand/ClipSubtitlesWordmark';
import { CaptionFrame, PAGE_ONE } from '@/components/landing-options/StyleBoard';
import { SAMPLE } from '@/components/landing-options/facts';
import type { SeoPage } from './seo-pages';
import { SEO_PAGES, SITE_URL } from './seo-pages';
import { FootageReel } from './FootageReel';
import { ConnectAgent } from '@/components/landing-options/ConnectAgent';
import '@/components/landing-options/landing-options.css';
import '@/components/landing-options/three-gates.css';
import './seo-intent.css';

export function SeoIntentPage({ page }: { page: SeoPage }) {
  const related = Object.values(SEO_PAGES).filter((candidate) => candidate.slug !== page.slug);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'ClipSubtitles',
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web',
        url: new URL(`/${page.slug}`, SITE_URL).toString(),
        description: page.description,
      },
      {
        '@type': 'FAQPage',
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
        <section className="si-hero lo-wrap" aria-labelledby="si-title">
          <div className="si-hero-copy">
            <p className="lo-eyebrow tg-eyebrow si-eyebrow">{page.eyebrow}</p>
            <h1 id="si-title">{page.headline}</h1>
            <p className="si-lede">{page.lede}</p>
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

        <section id="how" className="si-section lo-wrap" aria-labelledby="si-how-title">
          <div className="si-section-copy">
            <p className="lo-eyebrow tg-eyebrow">How it works</p>
            <h2 id="si-how-title">{page.howTitle}</h2>
            <p>{page.howBody}</p>
          </div>
          <ol className="si-steps">
            {page.steps.map((step, index) => (
              <li key={step.title}>
                <span className="lo-mono">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="si-section si-benefits lo-wrap" aria-labelledby="si-benefits-title">
          <div className="si-section-copy">
            <p className="lo-eyebrow tg-eyebrow">{page.benefitEyebrow}</p>
            <h2 id="si-benefits-title">{page.benefitTitle}</h2>
          </div>
          <ul className="si-benefit-list">
            {page.benefits.map((benefit) => (
              <li key={benefit.title}>
                <h3>{benefit.title}</h3>
                <p>{benefit.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {page.slug === 'video-caption-api' ? <ConnectAgent standalone /> : null}

        <FootageReel />

        <section className="si-section lo-wrap" aria-labelledby="si-faq-title">
          <div className="si-section-copy">
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

        <nav className="si-related lo-wrap" aria-labelledby="si-related-title">
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

        <section className="tg-final lo-wrap lo-end" aria-labelledby="si-final-title">
          <h2 id="si-final-title">{page.finalTitle}</h2>
          <p>{page.finalBody}</p>
          <div className="tg-cta">
            <Link href="/sign-in?returnTo=/app/new" className="lo-btn tg-btn-primary">
              Caption a video
            </Link>
            <Link href="/developers" className="lo-btn tg-btn-ghost">
              Build with ClipSubtitles
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
