import type { Metadata } from 'next';
import { ThreeGates } from '@/components/landing-options/ThreeGates';

export const metadata: Metadata = {
  title: 'Styled Video Captions That Get Every Word Right',
  description:
    'Caption a short video: a word-level transcript you can correct, five caption styles with motion, and a captioned MP4, transparent overlay, SRT or VTT at a fixed credit price you approve first.',
};

export default function ThreeGatesPage() {
  return <ThreeGates />;
}
