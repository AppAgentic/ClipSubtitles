'use client';

import Link from 'next/link';
import { MCP_ENDPOINT } from './facts';
import { MCP_CLIENTS, McpClientTiles, McpInstallSlot, useMcpClient } from './McpClientBoard';

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
        <p className="lo-eyebrow tg-eyebrow">Works with your agent</p>
        <Heading id="tg-connect-title">Add ClipSubtitles to your agent.</Heading>
        <p>
          Choose your client, install the server and sign in through your browser. No API key to
          manage.
        </p>
        <Link href="/developers">Read the developer guide →</Link>
      </div>

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
