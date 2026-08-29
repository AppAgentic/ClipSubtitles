import type { Metadata } from 'next';
import { Handoff } from '@/components/landing-options/Handoff';

export const metadata: Metadata = {
  title: 'AI Video Caption Generator for Agents and Creators',
  description: 'Turn short videos into styled, word-timed captions and export MP4, transparent overlay, SRT or VTT through the studio, MCP or API.',
};

export default function HandoffPage() {
  return <Handoff />;
}
