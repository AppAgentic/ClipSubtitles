import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://clipsubtitles.com'),
  title: { default: 'ClipSubtitles', template: '%s · ClipSubtitles' },
  description:
    'Create accurate, styled video captions, preview the result and export the files you need.',
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies a stored manual light/dark override before first paint, so there is
            no flash from the system-default theme to the user's chosen one. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <div id="app">
          <ToastProvider>{children}</ToastProvider>
        </div>
      </body>
    </html>
  );
}
