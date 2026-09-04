import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipSubtitlesWordmark } from '@/components/brand/ClipSubtitlesWordmark';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { PricingSection } from '@/components/marketing/PricingSection';
import '@/components/landing-options/landing-options.css';
import '@/components/landing-options/three-gates.css';

export const metadata: Metadata = {
  title: { absolute: 'Pricing | ClipSubtitles' },
  description:
    'Start captioning for $0, then choose flexible monthly or annual pricing for creators, professionals, or studios.',
  alternates: { canonical: '/pricing' },
  robots: { index: true, follow: true },
};

export default function PricingPage() {
  return (
    <div data-lo="three-gates" className="tg">
      <header className="tg-top lo-wrap">
        <Link href="/" className="tg-brand">
          <ClipSubtitlesWordmark />
        </Link>
        <nav aria-label="Primary" className="tg-nav">
          <Link href="/">Home</Link>
          <Link href="/developers">Developers</Link>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>
      <main>
        <PricingSection compact />
      </main>
      <MarketingFooter />
    </div>
  );
}
