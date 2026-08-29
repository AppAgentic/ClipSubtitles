import type { Metadata } from 'next';
import { ThreeGates } from '@/components/landing-options/ThreeGates';

export const metadata: Metadata = {
  title: 'Styled Video Captions That Get Every Word Right',
  description:
    'Caption a short video: correct the word-level transcript, choose a style and motion, then export the files you need at a fixed credit price you approve first.',
};

export default function ThreeGatesPage() {
  return <ThreeGates />;
}
