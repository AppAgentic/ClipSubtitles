'use client';

import { MCP_TOOLS, SCOPES } from '@clipsubtitles/contracts';
import { AppShell } from '@/components/shell/AppShell';
import { Chip, Panel } from '@/components/ui/primitives';

export default function DocsPage() {
  return <AppShell render={() => <Docs />} />;
}

function Docs() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <div className="mx-auto max-w-[860px]">
      <div className="rise mb-6">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Connect an agent</h1>
        <p className="text-[13px] text-ink-mute">ClipSubtitles is agent-native: the same contracts power ChatGPT, Claude, other MCP clients, and this editor.</p>
      </div>
      <div className="grid gap-4">
        <Panel title="Endpoints" className="rise rise-1 p-4">
          <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-[13px]">
            <dt className="text-ink-mute">MCP (Streamable HTTP)</dt>
            <dd className="mono text-ink">{origin}/api/mcp</dd>
            <dt className="text-ink-mute">OAuth metadata</dt>
            <dd className="mono text-ink">{origin}/.well-known/oauth-protected-resource</dd>
            <dt className="text-ink-mute">REST / OpenAPI</dt>
            <dd className="mono text-ink">
              <a href="/openapi.json" className="hover:text-signal">
                {origin}/openapi.json
              </a>
            </dd>
            <dt className="text-ink-mute">llms.txt</dt>
            <dd className="mono text-ink">
              <a href="/llms.txt" className="hover:text-signal">
                {origin}/llms.txt
              </a>
            </dd>
            <dt className="text-ink-mute">Scopes</dt>
            <dd className="mono text-ink">{SCOPES.join(' ')}</dd>
          </dl>
        </Panel>
        <Panel title="Tools" className="rise rise-2">
          <ul className="divide-y divide-line/70">
            {MCP_TOOLS.map((t) => (
              <li key={t.name} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono text-[13px] text-ink">{t.name}</span>
                  <Chip tone={t.annotations.readOnlyHint ? 'info' : 'neutral'}>{t.annotations.readOnlyHint ? 'read' : 'write'}</Chip>
                  {t.cost === 'credits' ? <Chip tone="signal">paid · approval</Chip> : null}
                  <span className="mono text-[11px] text-ink-mute">{t.scope}</span>
                </div>
                <p className="mt-1 text-[12px] text-ink-dim">{t.description}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Local development" className="rise rise-3 p-4">
          <p className="text-[12px] text-ink-dim">
            With <code className="mono">AUTH_MODE=mock</code>, mint a bearer token with <code className="mono">pnpm dev:token</code>, or point an MCP client at the endpoint above — the local
            authorization server (PKCE + dynamic registration) walks it through a mock consent screen. Production uses WorkOS/AuthKit only.
          </p>
        </Panel>
      </div>
    </div>
  );
}
