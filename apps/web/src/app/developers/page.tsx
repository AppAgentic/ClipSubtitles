import type { Metadata } from 'next';
import Link from 'next/link';
import { MCP_TOOLS } from '@clipsubtitles/contracts';
import { SITE_URL } from '@/components/marketing/seo-pages';
import { ClipSubtitlesWordmark } from '@/components/brand/ClipSubtitlesWordmark';

export const metadata: Metadata = {
  title: 'Video Caption API and Agent Integration',
  description:
    'Connect an AI agent or application to ClipSubtitles through MCP or the video caption REST API.',
  alternates: { canonical: '/developers' },
  robots: { index: true, follow: true },
};

export default function DevelopersPage() {
  const mcpEndpoint = new URL('/api/mcp', SITE_URL).toString();
  return (
    <main className="min-h-screen bg-bg px-5 py-8 text-ink sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-[1080px] items-center justify-between border-b border-line pb-5">
        <Link href="/" className="text-[15px] font-semibold tracking-[-0.02em]">
          <ClipSubtitlesWordmark />
        </Link>
        <nav className="flex items-center gap-5 text-[13px] text-ink-dim" aria-label="Primary">
          <Link href="/help" className="hover:text-ink">
            Help
          </Link>
          <Link href="/sign-in?returnTo=/app" className="hover:text-ink">
            Sign in
          </Link>
        </nav>
      </header>
      <div className="mx-auto max-w-[1080px] py-16 sm:py-24">
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-signal">
          For developers and agents
        </p>
        <h1 className="mt-4 max-w-[760px] text-[48px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[68px]">
          Build a complete video caption workflow.
        </h1>
        <p className="mt-6 max-w-[680px] text-[17px] leading-7 text-ink-dim">
          Import a clip, generate timed captions, apply explicit edits, choose a style, preview the
          result and prepare an export through MCP or REST.
        </p>
        <section
          className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2"
          aria-labelledby="connect-title"
        >
          <div className="bg-panel p-6 sm:p-8">
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">
              MCP endpoint
            </p>
            <h2 id="connect-title" className="mt-3 text-[25px] font-semibold">
              Connect your agent
            </h2>
            <p className="mt-3 text-[14px] leading-6 text-ink-dim">
              Use browser-based sign-in. There is no API key to paste into a chat.
            </p>
            <code className="mono mt-6 block overflow-x-auto rounded-xl border border-line bg-bg-elev p-4 text-[12px] text-signal">
              {mcpEndpoint}
            </code>
          </div>
          <div className="bg-panel p-6 sm:p-8">
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">REST API</p>
            <h2 className="mt-3 text-[25px] font-semibold">Use typed HTTP operations</h2>
            <p className="mt-3 text-[14px] leading-6 text-ink-dim">
              Inspect the machine-readable contract for projects, captions, previews, exports and
              progress.
            </p>
            <a
              href="/openapi.json"
              className="mt-6 inline-flex text-[13px] font-semibold text-signal hover:text-signal-soft"
            >
              Open the API specification →
            </a>
          </div>
        </section>
        <section className="mt-20" aria-labelledby="tools-title">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">Capabilities</p>
          <h2 id="tools-title" className="mt-3 text-[34px] font-semibold tracking-[-0.03em]">
            The complete caption job, exposed as tools.
          </h2>
          <ul className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
            {MCP_TOOLS.map((tool) => (
              <li key={tool.name} className="bg-panel p-5 sm:p-6">
                <code className="mono text-[12px] text-signal">{tool.name}</code>
                <p className="mt-2 text-[13px] leading-6 text-ink-dim">{tool.description}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-20 border-t border-line pt-12" aria-labelledby="approval-title">
          <h2 id="approval-title" className="text-[30px] font-semibold tracking-[-0.03em]">
            Automation with a clear approval boundary.
          </h2>
          <p className="mt-4 max-w-[680px] text-[15px] leading-7 text-ink-dim">
            Agents can prepare the work and return a fixed export cost. A person approves before a
            paid render begins.
          </p>
          <Link
            href="/video-caption-api"
            className="mt-6 inline-flex text-[13px] font-semibold text-signal hover:text-signal-soft"
          >
            Explore the video caption API →
          </Link>
        </section>
      </div>
    </main>
  );
}
