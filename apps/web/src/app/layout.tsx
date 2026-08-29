import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: { default: 'ClipSubtitles Studio', template: '%s · ClipSubtitles' },
  description: 'Precision caption editor and recovery library for agent-generated captions.',
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
