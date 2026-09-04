import type { Metadata } from 'next';
import { ThreeGates } from '@/components/landing-options/ThreeGates';

export const metadata: Metadata = {
  title: { absolute: 'AI Video Caption Generator for ChatGPT & Claude | ClipSubtitles' },
  description:
    'Upload a clip, create accurate animated captions with ChatGPT or Claude, review every word and export a publish-ready video.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'ClipSubtitles',
    title: 'AI Video Caption Generator for ChatGPT & Claude | ClipSubtitles',
    description:
      'Upload a clip, create accurate animated captions with ChatGPT or Claude, review every word and export a publish-ready video.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Video Caption Generator for ChatGPT & Claude | ClipSubtitles',
    description:
      'Upload a clip, create accurate animated captions with ChatGPT or Claude, review every word and export a publish-ready video.',
  },
};

export default function HomePage() {
  return <ThreeGates showSwitcher={false} />;
}
