import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Terms | ClipSubtitles', robots: { index: true, follow: true } };

export default function TermsPage() {
  return <main className="mx-auto max-w-3xl px-5 py-20"><Link href="/" className="text-sm text-ink-dim">← ClipSubtitles</Link><h1 className="mt-12 text-5xl font-semibold tracking-tight">Terms</h1><div className="mt-8 space-y-5 text-[15px] leading-7 text-ink-dim"><p>You must have the rights needed to upload and process each video. Do not use ClipSubtitles for unlawful content or to violate another person’s rights.</p><p>Finished video renders use credits according to the quote you approve. Previewing, editing, and subtitle-file exports do not use credits. Subscription and purchased-credit terms will be shown clearly before checkout.</p><p>The service is provided during an early-access period and may change as we improve it. Contact <a className="text-signal" href="mailto:support@clipsubtitles.com">support@clipsubtitles.com</a> with questions.</p><p>We will publish dated, jurisdiction-reviewed terms before accepting live payments.</p></div></main>;
}
