import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/components/landing-options/landing-options.css';

export const metadata: Metadata = {
  title: { default: 'Landing options', template: '%s · Landing options · ClipSubtitles' },
  description: 'Five agent-first landing page concepts for ClipSubtitles.',
  robots: { index: false },
};

export default function LandingOptionsLayout({ children }: { children: ReactNode }) {
  return children;
}
