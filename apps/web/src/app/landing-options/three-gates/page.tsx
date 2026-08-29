import type { Metadata } from 'next';
import { ThreeGates } from '@/components/landing-options/ThreeGates';

export const metadata: Metadata = {
  title: 'Create Styled Video Captions with AI Agents',
  description: 'Send a short video and get a captioned MP4, transparent overlay, SRT or VTT while retaining approval of words, cost and formats.',
};

export default function ThreeGatesPage() {
  return <ThreeGates />;
}
