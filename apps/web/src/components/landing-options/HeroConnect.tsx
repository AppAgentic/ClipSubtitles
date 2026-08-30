'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { MCP_INSTALL, MCP_ONE_CLICK } from './facts';

const HERO_CLIENTS = [MCP_INSTALL[0], MCP_INSTALL[1], MCP_INSTALL[2]] as const;
type HeroClientId = (typeof HERO_CLIENTS)[number]['id'];

export function HeroConnect() {
  const [activeId, setActiveId] = useState<HeroClientId>('claude');
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = HERO_CLIENTS.find((item) => item.id === activeId) ?? HERO_CLIENTS[0];

  async function copyCommand() {
    if (resetRef.current) clearTimeout(resetRef.current);
    try {
      await navigator.clipboard.writeText(active.command);
      setCopied(true);
      resetRef.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      document.getElementById('connect')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? HERO_CLIENTS.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + HERO_CLIENTS.length) % HERO_CLIENTS.length;
    const next = HERO_CLIENTS[nextIndex] ?? HERO_CLIENTS[0];
    setActiveId(next.id);
    setCopied(false);
    document.getElementById(`hero-mcp-tab-${next.id}`)?.focus();
  }

  return (
    <div className="tg-hero-connect" aria-label="Connect ClipSubtitles to your agent">
      <div className="tg-hero-connect-head">
        <span className="lo-eyebrow">Connect your agent</span>
        <a href="#connect">Full setup guide ↓</a>
      </div>
      <div className="tg-hero-connect-tabs" role="tablist" aria-label="Choose a command">
        {HERO_CLIENTS.map((item, index) => (
          <button
            key={item.id}
            id={`hero-mcp-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={activeId === item.id}
            aria-controls="hero-mcp-command"
            tabIndex={activeId === item.id ? 0 : -1}
            onClick={() => {
              setActiveId(item.id);
              setCopied(false);
            }}
            onKeyDown={(event) => moveTab(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id="hero-mcp-command"
        className="tg-hero-connect-command"
        role="tabpanel"
        aria-labelledby={`hero-mcp-tab-${active.id}`}
      >
        <code className="lo-mono">{active.command}</code>
        <button type="button" onClick={copyCommand}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className="tg-hero-connect-links">
        <span>One click:</span>
        {MCP_ONE_CLICK.map((item) => <a key={item.label} href={item.href}>{item.label.replace('Add to ', '')}</a>)}
      </div>
      <span className="lo-sr" aria-live="polite">{copied ? `${active.label} setup copied.` : ''}</span>
    </div>
  );
}
