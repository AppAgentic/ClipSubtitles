'use client';

import { McpClientTiles, McpInstallSlot, useMcpClient } from './McpClientBoard';

export function HeroConnect() {
  const { activeId, choose } = useMcpClient();

  return (
    <section className="tg-hero-connect" aria-label="Connect ClipSubtitles to your agent">
      <McpClientTiles activeId={activeId} choose={choose} scope="hero" />
      <McpInstallSlot activeId={activeId} />
      <p className="tg-connect-first-use">
        First use opens a browser tab to sign in. <a href="#connect">Full guide ↓</a>
      </p>
    </section>
  );
}
