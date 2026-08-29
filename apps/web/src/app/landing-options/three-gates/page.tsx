import type { Metadata } from 'next';
import { ThreeGates } from '@/components/landing-options/ThreeGates';

export const metadata: Metadata = {
  title: 'AI Video Caption Generator for Styled Captions',
  description:
    'Add accurate, styled captions to short videos. Review every word, choose a look and motion, preview the result, then export a captioned video or subtitle file.',
};

export default function ThreeGatesPage() {
  return <ThreeGates />;
}
