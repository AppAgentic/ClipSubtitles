import type { Metadata } from 'next';
import { FrameExact } from '@/components/landing-options/FrameExact';

export const metadata: Metadata = {
  title: 'Automatic Video Captions with Word-Level Timing',
  description: 'Automatically transcribe, edit, style and export precise video captions with deterministic rendering.',
};

export default function FrameExactPage() {
  return <FrameExact />;
}
