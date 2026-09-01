import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipSubtitlesWordmark } from '@/components/brand/ClipSubtitlesWordmark';
import { SupportButton } from '@/components/support/GleapSupport';

export const metadata: Metadata = {
  title: 'Help',
  description:
    'Learn how to upload, caption, style, preview and export a video with ClipSubtitles.',
  alternates: { canonical: '/help' },
  robots: { index: true, follow: true },
};

const STEPS = [
  ['Upload a video', 'Choose a short video from your device or start from a supported video link.'],
  [
    'Create captions',
    'ClipSubtitles turns the speech into timed words you can review and correct.',
  ],
  ['Choose the look', 'Pick a caption style and motion, then preview how it feels on the clip.'],
  [
    'Export the result',
    'Review the cost before a paid render, then download the video or subtitle file you need.',
  ],
] as const;

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-bg px-5 py-8 text-ink sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-[960px] items-center justify-between border-b border-line pb-5">
        <Link href="/" className="text-[15px] font-semibold tracking-[-0.02em]">
          <ClipSubtitlesWordmark />
        </Link>
        <nav className="flex items-center gap-5 text-[13px] text-ink-dim" aria-label="Primary">
          <Link href="/developers" className="hover:text-ink">
            Developers
          </Link>
          <Link href="/sign-in?returnTo=/app" className="hover:text-ink">
            Sign in
          </Link>
        </nav>
      </header>
      <div className="mx-auto max-w-[960px] py-16 sm:py-24">
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-signal">
          ClipSubtitles help
        </p>
        <h1 className="mt-4 max-w-[700px] text-[48px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[64px]">
          From spoken video to polished captions.
        </h1>
        <p className="mt-6 max-w-[640px] text-[17px] leading-7 text-ink-dim">
          The essentials for creating your first captioned video and finding your finished work.
        </p>
        <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {STEPS.map(([title, body], index) => (
            <li key={title} className="bg-panel p-6 sm:p-8">
              <span className="mono text-[11px] text-signal">0{index + 1}</span>
              <h2 className="mt-4 text-[23px] font-semibold">{title}</h2>
              <p className="mt-3 text-[14px] leading-6 text-ink-dim">{body}</p>
            </li>
          ))}
        </ol>
        <section className="mt-16 grid gap-8 border-t border-line pt-12 sm:grid-cols-2">
          <div>
            <h2 className="text-[24px] font-semibold">Where are my videos?</h2>
            <p className="mt-3 text-[14px] leading-6 text-ink-dim">
              Your videos, current progress and recent downloads are in your Library.
            </p>
            <Link
              href="/sign-in?returnTo=/app"
              className="mt-5 inline-flex text-[13px] font-semibold text-signal"
            >
              Open your Library →
            </Link>
          </div>
          <div>
            <h2 className="text-[24px] font-semibold">Using an AI agent?</h2>
            <p className="mt-3 text-[14px] leading-6 text-ink-dim">
              The developer guide covers MCP, REST and the approval step for paid exports.
            </p>
            <Link
              href="/developers"
              className="mt-5 inline-flex text-[13px] font-semibold text-signal"
            >
              Read the developer guide →
            </Link>
          </div>
        </section>
        <section className="mt-16 rounded-[28px] border border-line bg-panel p-7 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-10">
          <div>
            <h2 className="text-[24px] font-semibold">Still need a hand?</h2>
            <p className="mt-2 max-w-[560px] text-[14px] leading-6 text-ink-dim">
              Send us a question, report a problem, or tell us what would make ClipSubtitles better.
            </p>
          </div>
          <SupportButton className="mt-6 inline-flex h-11 shrink-0 items-center rounded-full bg-signal px-5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 sm:mt-0">
            Contact support
          </SupportButton>
        </section>
      </div>
    </main>
  );
}
