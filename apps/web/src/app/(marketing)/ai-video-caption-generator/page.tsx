import type { Metadata } from 'next';
import { ThreeGates } from '@/components/landing-options/ThreeGates';

export const metadata: Metadata = {
  title: { absolute: 'AI Video Caption Generator for Styled Captions | ClipSubtitles' },
  description:
    'Add accurate, styled captions to short videos. Review every word, choose a look and motion, preview the result, then export a captioned video or subtitle file.',
  alternates: { canonical: '/ai-video-caption-generator' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: '/ai-video-caption-generator',
    siteName: 'ClipSubtitles',
    title: 'AI Video Caption Generator for Styled Captions | ClipSubtitles',
    description:
      'Add accurate, styled captions to short videos. Review every word, choose a look and motion, preview the result, then export a captioned video or subtitle file.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Video Caption Generator for Styled Captions | ClipSubtitles',
    description: 'Generate automatic captions, correct every word, choose a style and export a polished video.',
  },
};

export default function AiVideoCaptionGeneratorPage() {
  return <ThreeGates showSwitcher={false} />;
}
