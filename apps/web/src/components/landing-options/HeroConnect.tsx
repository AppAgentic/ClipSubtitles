'use client';

import { McpClientTiles, McpGuidedSetup, useMcpClient } from './McpClientBoard';

export function HeroConnect() {
  const { activeId, choose } = useMcpClient();

  return (
    <section className="tg-hero-connect" aria-label="Connect ClipSubtitles to your agent">
      <p className="tg-connect-step">
        <span>1</span> Choose your AI
      </p>
      <McpClientTiles activeId={activeId} choose={choose} scope="hero" />
      <McpGuidedSetup activeId={activeId} />
      <p className="tg-connect-first-use">
        Paste once. Your AI adds the connection if needed, then starts your clip.{' '}
        <a href="#connect">Full guide ↓</a>
      </p>
    </section>
  );
}
