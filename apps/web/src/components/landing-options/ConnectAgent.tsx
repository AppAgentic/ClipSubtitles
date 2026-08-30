'use client';

import Link from 'next/link';
import { useRef, useState, type KeyboardEvent } from 'react';
import { MCP_ENDPOINT, MCP_INSTALL, MCP_ONE_CLICK } from './facts';

type InstallId = (typeof MCP_INSTALL)[number]['id'];

export function ConnectAgent({ standalone = false }: { standalone?: boolean }) {
  const [activeId, setActiveId] = useState<InstallId>('claude');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'selected'>('idle');
  const codeRef = useRef<HTMLElement>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = MCP_INSTALL.find((item) => item.id === activeId) ?? MCP_INSTALL[0];
  const Heading = standalone ? 'h2' : 'h3';

  function choose(id: InstallId) {
    setActiveId(id);
    setCopyState('idle');
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? MCP_INSTALL.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + MCP_INSTALL.length) % MCP_INSTALL.length;
    const next = MCP_INSTALL[nextIndex] ?? MCP_INSTALL[0];
    choose(next.id);
    document.getElementById(`mcp-tab-${next.id}`)?.focus();
  }

  async function copyCommand() {
    if (resetRef.current) clearTimeout(resetRef.current);
    try {
      await navigator.clipboard.writeText(active.command);
      setCopyState('copied');
    } catch {
      const selection = window.getSelection();
      if (selection && codeRef.current) {
        const range = document.createRange();
        range.selectNodeContents(codeRef.current);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setCopyState('selected');
    }
    resetRef.current = setTimeout(() => setCopyState('idle'), 1600);
  }

  return (
    <section
      id="connect"
      className={`tg-connect${standalone ? ' tg-connect-standalone lo-wrap' : ''}`}
      aria-labelledby="tg-connect-title"
    >
      <div className="tg-connect-copy">
        <p className="lo-eyebrow tg-eyebrow">Works with your agent</p>
        <Heading id="tg-connect-title">Add ClipSubtitles to your agent in a minute.</Heading>
        <p>Choose your client. Paste a command or use one-click setup, then sign in through your browser—no API key to manage.</p>
        <Link href="/docs">Read the MCP docs →</Link>
      </div>

      <div className="tg-connect-panel">
        <div className="tg-connect-tabs" role="tablist" aria-label="Choose your agent client">
          {MCP_INSTALL.map((item, index) => (
            <button
              key={item.id}
              id={`mcp-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={activeId === item.id}
              aria-controls="mcp-install-panel"
              tabIndex={activeId === item.id ? 0 : -1}
              onClick={() => choose(item.id)}
              onKeyDown={(event) => moveTab(event, index)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div id="mcp-install-panel" role="tabpanel" aria-labelledby={`mcp-tab-${active.id}`}>
          <div className="tg-connect-instruction">
            <span>{active.instruction}</span>
            <button type="button" onClick={copyCommand}>
              {copyState === 'copied' ? 'Copied' : copyState === 'selected' ? 'Selected' : 'Copy'}
            </button>
          </div>
          <pre className="tg-connect-code lo-mono"><code ref={codeRef}>{active.command}</code></pre>
        </div>

        <p className="lo-sr" aria-live="polite">
          {copyState === 'copied' ? `${active.label} setup copied.` : copyState === 'selected' ? 'Setup selected. Copy it from the page.' : ''}
        </p>
        <p className="tg-connect-helper">Your agent will open a browser tab to sign in the first time.</p>

        <div className="tg-connect-oneclick">
          <span>Prefer one click?</span>
          <div>
            {MCP_ONE_CLICK.map((item) => (
              <a key={item.label} href={item.href}>{item.label}<span aria-hidden> ↗</span></a>
            ))}
          </div>
          <small>Cursor and VS Code support verified install links. Use the commands above for Claude Code, Codex and Gemini CLI.</small>
        </div>

        <p className="tg-connect-endpoint lo-mono">{MCP_ENDPOINT}</p>
      </div>
    </section>
  );
}
