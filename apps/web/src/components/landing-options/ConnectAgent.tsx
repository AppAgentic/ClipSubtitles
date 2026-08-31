'use client';

import Link from 'next/link';
import { MCP_ENDPOINT } from './facts';
import { MCP_CLIENTS, McpClientTiles, McpInstallSlot, useMcpClient } from './McpClientBoard';

const AUTOMATION_PATHS = [
  {
    title: 'From a conversation',
    body: 'Ask ChatGPT or Claude to caption a clip, correct a word, try a style and prepare the export.',
  },
  {
    title: 'From your workspace',
    body: 'Use Codex, Cursor or Claude Code to turn the videos already in your workflow into captioned deliverables.',
  },
  {
    title: 'From an automation',
    body: 'Connect through MCP or the API so your own system can prepare repeatable caption jobs for approval.',
  },
] as const;

export function ConnectAgent({ standalone = false }: { standalone?: boolean }) {
  const { activeId, choose } = useMcpClient();
  const active = MCP_CLIENTS.find((item) => item.id === activeId) ?? {
    id: 'claude',
    label: 'Claude Code',
  };
  const Heading = standalone ? 'h2' : 'h3';

  return (
    <section
      id="connect"
      className={`tg-connect${standalone ? ' tg-connect-standalone lo-wrap' : ''}`}
      aria-labelledby="tg-connect-title"
    >
      <div className="tg-connect-copy">
        <p className="lo-eyebrow tg-eyebrow">AI and automation</p>
        <Heading id="tg-connect-title">Power your captions with AI and automation.</Heading>
        <p>
          Keep the same review, style and approval flow whether you work in the browser, chat with
          an agent or run your own automation.
        </p>
        <Link href="/developers">Read the developer guide →</Link>
      </div>

      {standalone ? (
        <ol className="tg-automation-paths">
          {AUTOMATION_PATHS.map((path, index) => (
            <li key={path.title}>
              <span className="lo-mono">0{index + 1}</span>
              <div>
                <h3>{path.title}</h3>
                <p>{path.body}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="tg-connect-board">
        <McpClientTiles activeId={activeId} choose={choose} scope="guide" rail />
        <div className="tg-connect-page">
          <p className="lo-eyebrow tg-eyebrow">Install</p>
          <h3>{active.label}</h3>
          <McpInstallSlot activeId={activeId} large />
          <dl className="tg-connect-checks">
            <div>
              <dt>First use</dt>
              <dd>Sign in through your browser</dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd>
                <code className="lo-mono">{MCP_ENDPOINT}</code>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
