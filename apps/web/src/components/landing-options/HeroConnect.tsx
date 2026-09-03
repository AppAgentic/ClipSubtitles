'use client';

import { useRef, useState } from 'react';
import { McpClientTiles, McpInstallSlot, useMcpClient } from './McpClientBoard';

export const FIRST_AGENT_PROMPT =
  'Caption this video with readable animated captions. Let me review the words and style before you prepare the export.';

export function HeroConnect() {
  const { activeId, choose } = useMcpClient();
  const [promptCopied, setPromptCopied] = useState(false);
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copyPrompt() {
    if (promptTimer.current) clearTimeout(promptTimer.current);
    try {
      await navigator.clipboard.writeText(FIRST_AGENT_PROMPT);
      setPromptCopied(true);
      promptTimer.current = setTimeout(() => setPromptCopied(false), 1600);
    } catch {
      document.getElementById('connect')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  return (
    <section className="tg-hero-connect" aria-label="Connect ClipSubtitles to your agent">
      <p className="tg-connect-step">
        <span>1</span> Choose where you work
      </p>
      <McpClientTiles activeId={activeId} choose={choose} scope="hero" />
      <McpInstallSlot activeId={activeId} />
      <p className="tg-connect-first-use">
        {activeId === 'codex'
          ? 'Connect your account, then choose ClipSubtitles in ChatGPT. '
          : 'First use opens a browser tab to sign in. '}
        <a href="#connect">Full guide ↓</a>
      </p>
      <div className="tg-first-prompt">
        <p className="tg-connect-step">
          <span>2</span> Send your first request
        </p>
        <div>
          <p>{FIRST_AGENT_PROMPT}</p>
          <button type="button" onClick={copyPrompt}>
            {promptCopied ? 'Copied' : 'Copy prompt'}
          </button>
        </div>
        <span className="lo-sr" aria-live="polite">
          {promptCopied ? 'First agent prompt copied.' : ''}
        </span>
      </div>
    </section>
  );
}
