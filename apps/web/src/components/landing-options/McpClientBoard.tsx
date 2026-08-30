'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MCP_INSTALL, MCP_ONE_CLICK } from './facts';

export type McpClientId = (typeof MCP_INSTALL)[number]['id'] | 'cursor' | 'vscode';

export const MCP_CLIENTS: ReadonlyArray<{ id: McpClientId; label: string }> = [
  ...MCP_INSTALL.map(({ id, label }) => ({ id, label })),
  { id: 'cursor', label: 'Cursor' },
  { id: 'vscode', label: 'VS Code' },
];

const STORAGE_KEY = 'clipsubtitles-mcp-client';
const CHANGE_EVENT = 'clipsubtitles:mcp-client';

function isClientId(value: string | null): value is McpClientId {
  return MCP_CLIENTS.some(({ id }) => id === value);
}

export function useMcpClient() {
  const [activeId, setActiveId] = useState<McpClientId>('claude');

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (isClientId(stored)) setActiveId(stored);
    } catch {
      // Storage is an enhancement; the installer remains fully usable without it.
    }

    function sync(event: Event) {
      const id = (event as CustomEvent<McpClientId>).detail;
      if (isClientId(id)) setActiveId(id);
    }

    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  function choose(id: McpClientId) {
    setActiveId(id);
    try {
      sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      // The shared in-page event still synchronizes both installers.
    }
    window.dispatchEvent(new CustomEvent<McpClientId>(CHANGE_EVENT, { detail: id }));
  }

  return { activeId, choose };
}

export function McpClientTiles({ activeId, choose, scope, rail = false }: {
  activeId: McpClientId;
  choose: (id: McpClientId) => void;
  scope: string;
  rail?: boolean;
}) {
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? MCP_CLIENTS.length - 1
        : (index + delta + MCP_CLIENTS.length) % MCP_CLIENTS.length;
    const next = MCP_CLIENTS[nextIndex] ?? { id: 'claude', label: 'Claude Code' };
    choose(next.id);
    document.querySelector<HTMLButtonElement>(`[data-mcp-scope="${scope}"][data-mcp-client="${next.id}"]`)?.focus();
  }

  return (
    <div className={`tg-client-tiles${rail ? ' tg-client-rail' : ''}`} role="radiogroup" aria-label="Agent client">
      {MCP_CLIENTS.map((client, index) => (
        <button
          key={client.id}
          type="button"
          role="radio"
          aria-checked={activeId === client.id}
          tabIndex={activeId === client.id ? 0 : -1}
          data-mcp-scope={scope}
          data-mcp-client={client.id}
          onClick={() => choose(client.id)}
          onKeyDown={(event) => move(event, index)}
        >
          {client.label}
        </button>
      ))}
    </div>
  );
}

export function McpInstallSlot({ activeId, large = false }: { activeId: McpClientId; large?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const install = MCP_INSTALL.find((item) => item.id === activeId);
  const oneClick = activeId === 'cursor' ? MCP_ONE_CLICK[0] : activeId === 'vscode' ? MCP_ONE_CLICK[1] : undefined;

  async function copyCommand() {
    if (!install) return;
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(install.command);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      document.getElementById('connect')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  if (oneClick) {
    return (
      <div className={`tg-install-slot tg-install-link${large ? ' is-large' : ''}`} role="region" aria-live="polite">
        <span>Verified editor install link</span>
        <a href={oneClick.href}>{oneClick.label}<span aria-hidden> ↗</span></a>
      </div>
    );
  }

  if (!install) return null;
  return (
    <div className={`tg-install-slot${large ? ' is-large' : ''}`} role="region" aria-live="polite">
      <code className="lo-mono">{install.command}</code>
      <button type="button" onClick={copyCommand}>{copied ? 'Copied' : 'Copy'}</button>
      <span className="lo-sr">{copied ? `${install.label} setup copied.` : ''}</span>
    </div>
  );
}
