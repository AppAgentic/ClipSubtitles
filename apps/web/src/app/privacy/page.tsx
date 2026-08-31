import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Privacy | ClipSubtitles', robots: { index: true, follow: true } };

export default function PrivacyPage() {
  return <main className="mx-auto max-w-3xl px-5 py-20"><Link href="/" className="text-sm text-ink-dim">← ClipSubtitles</Link><h1 className="mt-12 text-5xl font-semibold tracking-tight">Privacy</h1><div className="mt-8 space-y-5 text-[15px] leading-7 text-ink-dim"><p>ClipSubtitles uses account information to provide your workspace and process the videos you choose to upload.</p><p>Original videos and finished files follow the retention windows shown in your workspace settings. Deleting a project removes its associated media. We do not sell your personal information.</p><p>Service providers may process data only to provide authentication, transcription, storage, rendering, and billing. Contact <a className="text-signal" href="mailto:privacy@clipsubtitles.com">privacy@clipsubtitles.com</a> for access or deletion requests.</p><p>We will publish a dated, jurisdiction-reviewed policy before accepting live payments.</p></div></main>;
}
