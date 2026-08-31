import type { Metadata } from 'next';
import { ThreeGates } from '@/components/landing-options/ThreeGates';

export const metadata: Metadata = {
  title: { absolute: 'AI Video Caption Generator | ClipSubtitles' },
  description:
    'Create accurate, styled video captions with an AI agent or in your browser. Review every word, preview the motion and export a polished result.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'ClipSubtitles',
    title: 'AI Video Caption Generator | ClipSubtitles',
    description:
      'Create accurate, styled video captions with an AI agent or in your browser. Review every word, preview the motion and export a polished result.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Video Caption Generator | ClipSubtitles',
    description:
      'Create accurate, styled video captions with an AI agent or in your browser. Review every word, preview the motion and export a polished result.',
  },
};

export default function HomePage() {
  return <ThreeGates showSwitcher={false} />;
}
