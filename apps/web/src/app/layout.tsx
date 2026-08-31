import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://clipsubtitles.com'),
  title: { default: 'ClipSubtitles', template: '%s · ClipSubtitles' },
  description:
    'Create accurate, styled video captions, preview the result and export the files you need.',
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: '#0b0a09',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div id="app">
          <ToastProvider>{children}</ToastProvider>
        </div>
      </body>
    </html>
  );
}
