import type { Metadata } from 'next';
import { FrameExact } from '@/components/landing-options/FrameExact';

export const metadata: Metadata = {
  title: '03 · Frame Exact',
  description: 'Word-exact captions. Byte-exact renders.',
};

export default function FrameExactPage() {
  return <FrameExact />;
}
