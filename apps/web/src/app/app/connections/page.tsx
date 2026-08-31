'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Connection } from '@clipsubtitles/contracts';
import { AppShell } from '@/components/shell/AppShell';
import { Button, Chip, LinkButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';

export default function ConnectionsPage() {
  return <AppShell render={() => <Connections />} />;
}

function Connections() {
  const toast = useToast();
  const [connections, setConnections] = useState<Connection[] | null>(null);

  const load = useCallback(() => {
    api
      .connections()
      .then((response) => setConnections(response.connections))
      .catch((error) => toast.push('error', errorMessage(error)));
  }, [toast]);

  useEffect(load, [load]);

  const chatGptConnection = useMemo(
    () => connections?.find((connection) => isChatGpt(connection)) ?? null,
    [connections],
  );
  const connectionState = !chatGptConnection
    ? 'not-connected'
    : chatGptConnection.revokedAt
      ? 'reconnect'
      : 'connected';

  const revoke = async (connection: Connection) => {
    if (!window.confirm('Disconnect ChatGPT from this ClipSubtitles account?')) return;
    try {
      await api.revokeConnection(connection.id);
      toast.push('ok', 'ChatGPT disconnected.');
      load();
    } catch (error) {
      toast.push('error', errorMessage(error));
    }
  };

  return (
    <div className="connections-editorial">
      <header className="rise border-b border-[#2d2822] pb-7">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-signal">
          Work naturally
        </p>
        <h1 className="editorial-serif mt-2 text-[38px] font-semibold leading-tight tracking-[-0.045em] sm:text-[50px]">
          Use ClipSubtitles with your AI
        </h1>
        <p className="mt-3 max-w-[650px] text-[14px] leading-relaxed text-ink-dim">
          Ask your favorite AI tools to caption a video, fix words, try styles, prepare a preview
          and bring an export to you for approval.
        </p>
      </header>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <main className="min-w-0 space-y-5">
          <section className="rise rise-1 overflow-hidden rounded-xl border border-[#4b4137] bg-[#eee6dc] text-[#17130f]">
            <div className="grid gap-6 p-6 sm:grid-cols-[170px_1fr] sm:items-center sm:p-8">
              <div className="flex items-center justify-center gap-4" aria-hidden>
                <span className="grid h-[82px] w-[82px] place-items-center rounded-2xl bg-[#11100f] text-[27px] font-bold text-[#f4ece2] shadow-[0_12px_28px_rgb(46_33_20/0.18)]">
                  C<span className="text-[#e88726]">S</span>
                </span>
                <span className="text-[25px] tracking-[0.2em] text-[#776d62]">•••</span>
                <span className="grid h-[82px] w-[82px] place-items-center rounded-2xl border border-[#d4c8bb] bg-[#faf7f2] text-[16px] font-semibold shadow-[0_12px_28px_rgb(46_33_20/0.12)]">
                  ChatGPT
                </span>
              </div>
              <div>
                <ConnectionBadge state={connectionState} connection={chatGptConnection} />
                <h2 className="editorial-serif mt-3 text-[28px] font-semibold tracking-[-0.035em]">
                  {connectionState === 'connected'
                    ? 'ChatGPT is connected'
                    : connectionState === 'reconnect'
                      ? 'Reconnect ChatGPT'
                      : 'Connect ChatGPT'}
                </h2>
                <p className="mt-2 max-w-[48ch] text-[13px] leading-relaxed text-[#62584f]">
                  Caption a video, correct the transcript, compare looks and prepare an export from
                  the same conversation.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {connectionState === 'connected' && chatGptConnection ? (
                    <Button
                      variant="danger"
                      onClick={() => void revoke(chatGptConnection)}
                      className="border-[#9f3d33]/35 text-[#8f3028] hover:bg-[#9f3d33]/10"
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <a
                      href="https://chatgpt.com"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-[#14110e] px-4 text-[13px] font-medium text-[#fff8ef] transition-transform active:translate-y-px"
                    >
                      {connectionState === 'reconnect'
                        ? 'Reconnect in ChatGPT'
                        : 'Connect in ChatGPT'}
                    </a>
                  )}
                  <Link href="#example-prompts" className="text-[13px] font-medium text-[#ad5f19]">
                    See example prompts <span aria-hidden>→</span>
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section className="rise rise-2 rounded-xl border border-[#342e28] bg-[#11100e] p-6">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
              Three simple steps
            </p>
            <h2 className="editorial-serif mt-1 text-[23px] font-semibold">How it works</h2>
            <ol className="mt-6 grid gap-5 md:grid-cols-3">
              <Step
                number="1"
                title="Connect"
                body="Add ClipSubtitles to ChatGPT and sign in to your account."
              />
              <Step
                number="2"
                title="Ask naturally"
                body="Attach a video and describe the captions or changes you want."
              />
              <Step
                number="3"
                title="Approve the export"
                body="Review the files and fixed credit cost before anything is rendered."
              />
            </ol>
          </section>

          <section
            id="example-prompts"
            className="rise rise-3 rounded-xl border border-[#342e28] bg-[#11100e] p-6"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
              Start a conversation
            </p>
            <h2 className="editorial-serif mt-1 text-[23px] font-semibold">Example prompts</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                'Caption this video with a bold style.',
                'Change “their” to “there” and show me the result.',
                'Make the captions calmer and move them lower.',
                'Prepare an MP4 and subtitle file for approval.',
              ].map((prompt) => (
                <div
                  key={prompt}
                  className="rounded-lg border border-[#332d27] bg-[#171411] px-4 py-3 text-[12px] leading-relaxed text-ink-dim"
                >
                  “{prompt}”
                </div>
              ))}
            </div>
          </section>

          <section className="rise rise-4">
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                Your choice of assistant
              </p>
              <h2 className="editorial-serif mt-1 text-[23px] font-semibold">Also works with</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {['Codex', 'Claude Code', 'Gemini CLI', 'Other MCP clients'].map((client) => (
                <Link
                  key={client}
                  href="/developers"
                  className="flex h-[76px] items-center justify-between rounded-lg border border-[#342e28] bg-[#11100e] px-4 text-[13px] text-ink transition-[border,transform] hover:-translate-y-0.5 hover:border-[#554a3f]"
                >
                  <span>{client}</span>
                  <span className="text-signal" aria-hidden>
                    →
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {connections && connections.filter((connection) => !isChatGpt(connection)).length > 0 ? (
            <section className="rise rise-4 rounded-xl border border-[#342e28] bg-[#11100e] p-6">
              <h2 className="editorial-serif text-[21px] font-semibold">Other connected tools</h2>
              <ul className="mt-4 divide-y divide-[#2d2822]">
                {connections
                  .filter((connection) => !isChatGpt(connection))
                  .map((connection) => (
                    <li
                      key={connection.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div>
                        <p className="text-[13px] text-ink">
                          {connection.clientName ?? 'Connected AI tool'}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-mute">
                          Last used{' '}
                          {connection.lastUsedAt ? relativeTime(connection.lastUsedAt) : 'never'}
                        </p>
                      </div>
                      <Chip tone={connection.revokedAt ? 'danger' : 'ok'}>
                        {connection.revokedAt ? 'disconnected' : 'connected'}
                      </Chip>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </main>

        <aside className="rise rise-2 space-y-5">
          <section className="overflow-hidden rounded-xl border border-[#3a332c] bg-[#11100e]">
            <div className="aspect-[4/3] bg-[url('/marketing/filmmaker-workflow.webp')] bg-cover bg-center" />
            <div className="p-6">
              <p className="text-[10px] uppercase tracking-[0.18em] text-signal">
                What your AI can do
              </p>
              <h2 className="editorial-serif mt-1 text-[22px] font-semibold">
                You stay in control
              </h2>
              <ul className="mt-5 divide-y divide-[#302a24]">
                <Permission
                  title="See your videos and styles"
                  body="Find the right project and understand the looks you have available."
                />
                <Permission
                  title="Create captions and previews"
                  body="Start projects, generate captions and prepare a visual preview."
                />
                <Permission
                  title="Edit words and looks"
                  body="Suggest corrections and apply the style or position you ask for."
                />
                <Permission
                  title="Exports need your approval"
                  body="Your AI can prepare an export, but cannot approve its credit cost for you."
                />
              </ul>
            </div>
          </section>
          <section className="rounded-xl border border-[#342e28] bg-[#11100e] p-5">
            <h2 className="editorial-serif text-[19px] font-semibold">Developer setup</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-dim">
              Use the MCP endpoint directly from your own agent or automation.
            </p>
            <div className="mt-4">
              <LinkButton href="/developers" variant="ghost">
                Open developer guide
              </LinkButton>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ConnectionBadge({
  state,
  connection,
}: {
  state: 'not-connected' | 'connected' | 'reconnect';
  connection: Connection | null;
}) {
  if (state === 'connected')
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-[#789964]/50 bg-[#e8f1df] px-3 py-1 text-[11px] font-medium text-[#315425]">
        <span className="h-2 w-2 rounded-full bg-[#4c8b37]" />
        Connected{connection?.lastUsedAt ? ` · used ${relativeTime(connection.lastUsedAt)}` : ''}
      </span>
    );
  if (state === 'reconnect')
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-[#cf8b32]/50 bg-[#fff0d6] px-3 py-1 text-[11px] font-medium text-[#864c0d]">
        <span className="h-2 w-2 rounded-full bg-[#d9881e]" />
        Reconnect needed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#aa9e91] bg-[#f6efe6] px-3 py-1 text-[11px] font-medium text-[#62584f]">
      <span className="h-2 w-2 rounded-full bg-[#8e8175]" />
      Not connected
    </span>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <li className="relative border-l border-[#433a31] pl-5">
      <span className="absolute -left-[13px] top-0 grid h-6 w-6 place-items-center rounded-full bg-signal text-[11px] font-semibold text-signal-ink">
        {number}
      </span>
      <h3 className="text-[13px] font-medium text-ink">{title}</h3>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-mute">{body}</p>
    </li>
  );
}

function Permission({ title, body }: { title: string; body: string }) {
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex gap-3">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-signal" />
        <div>
          <h3 className="text-[13px] font-medium text-ink">{title}</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">{body}</p>
        </div>
      </div>
    </li>
  );
}

function isChatGpt(connection: Connection): boolean {
  const value = `${connection.clientName ?? ''} ${connection.clientId}`.toLowerCase();
  return value.includes('chatgpt') || value.includes('openai');
}
