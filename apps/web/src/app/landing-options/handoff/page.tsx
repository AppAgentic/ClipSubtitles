import type { Metadata } from 'next';
import { Handoff } from '@/components/landing-options/Handoff';

export const metadata: Metadata = {
  title: '01 · The Handoff',
  description: 'Your agent captions the clip. You approve the words and the price.',
};

export default function HandoffPage() {
  return <Handoff />;
}
