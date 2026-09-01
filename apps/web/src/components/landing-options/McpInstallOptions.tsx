'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { MCP_ENDPOINT, MCP_INSTALL, MCP_ONE_CLICK } from './facts';
import './mcp-install-options.css';

export const MCP_DESIGNS = [
  { slug: 'prompt-bar', n: '01', name: 'Prompt Bar' },
  { slug: 'client-board', n: '02', name: 'Client Board' },
  { slug: 'one-line-menu', n: '03', name: 'One Line + Menu' },
  { slug: 'proof-dock', n: '04', name: 'Docked to Proof' },
  { slug: 'three-step', n: '05', name: 'Three-Step' },
] as const;

export type McpDesignSlug = (typeof MCP_DESIGNS)[number]['slug'];
type InstallId = (typeof MCP_INSTALL)[number]['id'] | 'cursor' | 'vscode';

const CLIENTS: ReadonlyArray<{ id: InstallId; label: string }> = [
  ...MCP_INSTALL.map(({ id, label }) => ({ id, label })),
  { id: 'cursor', label: 'Cursor' },
  { id: 'vscode', label: 'VS Code' },
];

const DESIGN_COPY: Record<McpDesignSlug, { title: string; note: string }> = {
  'prompt-bar': {
    title: 'Prompt Bar',
    note: 'A compact terminal-shaped installer with a native client picker.',
  },
  'client-board': {
    title: 'Client Board',
    note: 'Choose a client first; the correct install action appears in one consistent place.',
  },
  'one-line-menu': {
    title: 'One Line + Menu',
    note: 'The lightest hero treatment, paired with a complete accordion guide.',
  },
  'proof-dock': {
    title: 'Docked to Proof',
    note: 'The installer becomes part of the finished-video proof instead of a third call to action.',
  },
  'three-step': {
    title: 'Three-Step',
    note: 'A guided client → install → sign-in sequence, compact above and expanded below.',
  },
};

function commandFor(id: InstallId) {
  return MCP_INSTALL.find((item) => item.id === id);
}

function linkFor(id: InstallId) {
  if (id === 'cursor') return MCP_ONE_CLICK[0];
  if (id === 'vscode') return MCP_ONE_CLICK[1];
  return undefined;
}

function ClientChoices({
  active,
  setActive,
  className = '',
}: {
  active: InstallId;
  setActive: (id: InstallId) => void;
  className?: string;
}) {
  return (
    <div className={`mio-clients ${className}`} role="radiogroup" aria-label="Agent client">
      {CLIENTS.map((client) => (
        <button
          key={client.id}
          type="button"
          role="radio"
          aria-checked={active === client.id}
          onClick={() => setActive(client.id)}
        >
          {client.label}
        </button>
      ))}
    </div>
  );
}

function InstallAction({ active, compact = false }: { active: InstallId; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const install = commandFor(active);
  const oneClick = linkFor(active);

  async function copy() {
    if (!install) return;
    if (timer.current) clearTimeout(timer.current);
    await navigator.clipboard.writeText(install.command);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  if (active === 'codex') {
    return (
      <div className={`mio-action mio-action-link${compact ? ' is-compact' : ''}`}>
        <span>Use ClipSubtitles in ChatGPT</span>
        <a href="/app/connections">
          Connect ChatGPT
          <span aria-hidden> →</span>
        </a>
      </div>
    );
  }

  if (oneClick) {
    return (
      <div className={`mio-action mio-action-link${compact ? ' is-compact' : ''}`}>
        <span>Verified editor install link</span>
        <a href={oneClick.href}>
          {oneClick.label}
          <span aria-hidden> ↗</span>
        </a>
      </div>
    );
  }

  if (!install) return null;
  return (
    <div className={`mio-action${compact ? ' is-compact' : ''}`}>
      <code>{install.command}</code>
      <button type="button" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="lo-sr" aria-live="polite">
        {copied ? `${install.label} setup copied.` : ''}
      </span>
    </div>
  );
}

function DesignSwitcher({ current }: { current: McpDesignSlug }) {
  return (
    <nav className="mio-switcher" aria-label="MCP installer design options">
      <span>Install UI</span>
      {MCP_DESIGNS.map((design) => (
        <Link
          key={design.slug}
          href={`/landing-options/mcp-install/${design.slug}`}
          aria-current={current === design.slug ? 'page' : undefined}
        >
          <span>{design.n}</span> {design.name}
        </Link>
      ))}
    </nav>
  );
}

function PromptBar({
  active,
  setActive,
}: {
  active: InstallId;
  setActive: (id: InstallId) => void;
}) {
  return (
    <div className="mio-prompt-wrap">
      <div className="mio-prompt">
        <label>
          <span className="lo-sr">Agent client</span>
          <select value={active} onChange={(event) => setActive(event.target.value as InstallId)}>
            {CLIENTS.map((client) => (
              <option key={client.id} value={client.id}>
                {client.label}
              </option>
            ))}
          </select>
        </label>
        <InstallAction active={active} compact />
      </div>
      <p>
        First use opens a browser tab to sign in. <a href="#mio-guide">Full setup guide ↓</a>
      </p>
    </div>
  );
}

function HeroInstaller({
  variant,
  active,
  setActive,
}: {
  variant: McpDesignSlug;
  active: InstallId;
  setActive: (id: InstallId) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(2);

  if (variant === 'prompt-bar') return <PromptBar active={active} setActive={setActive} />;
  if (variant === 'client-board') {
    return (
      <div className="mio-board">
        <ClientChoices active={active} setActive={setActive} />
        <InstallAction active={active} compact />
        <p>
          First use opens a browser tab to sign in. <a href="#mio-guide">Full guide ↓</a>
        </p>
      </div>
    );
  }
  if (variant === 'one-line-menu') {
    return (
      <div className="mio-line">
        <span className="mio-inline-label">Connect your agent</span>
        <InstallAction active={active} compact />
        <button
          type="button"
          className="mio-menu-trigger"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          Other AI tools <span aria-hidden>↓</span>
        </button>
        {menuOpen && (
          <div className="mio-menu">
            <ClientChoices
              active={active}
              setActive={(id) => {
                setActive(id);
                setMenuOpen(false);
              }}
            />
          </div>
        )}
      </div>
    );
  }
  if (variant === 'proof-dock') {
    return (
      <div className="mio-dock">
        <div className="mio-dock-head">
          <span>Connect your agent</span>
          <a href="#mio-guide">Guide ↓</a>
        </div>
        <ClientChoices active={active} setActive={setActive} />
        <InstallAction active={active} compact />
      </div>
    );
  }
  return (
    <div className="mio-wizard">
      <div className="mio-step-tabs" role="tablist" aria-label="Setup steps">
        {([1, 2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={step === n}
            onClick={() => setStep(n)}
          >
            {n} {n === 1 ? 'Client' : n === 2 ? 'Install' : 'Sign in'}
          </button>
        ))}
      </div>
      <div className="mio-step-panel" role="tabpanel">
        {step === 1 && (
          <ClientChoices
            active={active}
            setActive={(id) => {
              setActive(id);
              setStep(2);
            }}
          />
        )}
        {step === 2 && <InstallAction active={active} compact />}
        {step === 3 && (
          <p>
            Your agent opens a browser tab to sign in the first time.{' '}
            <a href="#mio-guide">Open full guide ↓</a>
          </p>
        )}
      </div>
    </div>
  );
}

function Guide({
  variant,
  active,
  setActive,
}: {
  variant: McpDesignSlug;
  active: InstallId;
  setActive: (id: InstallId) => void;
}) {
  if (variant === 'prompt-bar') {
    return (
      <ol className="mio-transcript">
        <li>
          <span>01</span>
          <div>
            <h3>Add the server</h3>
            <PromptBar active={active} setActive={setActive} />
          </div>
        </li>
        <li>
          <span>02</span>
          <div>
            <h3>Sign in</h3>
            <p>Your agent opens a browser tab the first time.</p>
          </div>
        </li>
        <li>
          <span>03</span>
          <div>
            <h3>Use ClipSubtitles</h3>
            <p>
              Ask your agent to caption a video, refine the words and preview the finished style.
            </p>
          </div>
        </li>
      </ol>
    );
  }
  if (variant === 'client-board') {
    return (
      <div className="mio-rail-layout">
        <ClientChoices active={active} setActive={setActive} className="mio-rail" />
        <div className="mio-client-page">
          <p className="mio-kicker">Install</p>
          <h3>{CLIENTS.find((item) => item.id === active)?.label}</h3>
          <InstallAction active={active} />
          <div className="mio-verify">
            <span>First use</span>
            <strong>Sign in through your browser</strong>
          </div>
          <div className="mio-verify">
            <span>Endpoint</span>
            <code>{MCP_ENDPOINT}</code>
          </div>
        </div>
      </div>
    );
  }
  if (variant === 'one-line-menu') {
    return (
      <div className="mio-accordion">
        {CLIENTS.map((client, index) => (
          <details key={client.id} open={index === 0}>
            <summary>
              {client.label}
              <span aria-hidden>+</span>
            </summary>
            <div>
              <InstallAction active={client.id} />
              <p>Your agent opens a browser tab to sign in the first time.</p>
            </div>
          </details>
        ))}
      </div>
    );
  }
  if (variant === 'proof-dock') {
    return (
      <div className="mio-panes">
        <div>
          <p className="mio-kicker">Universal config</p>
          <h3>Any MCP client</h3>
          <InstallAction active="other" />
        </div>
        <div>
          <p className="mio-kicker">Client shortcut</p>
          <ClientChoices active={active} setActive={setActive} />
          <InstallAction active={active} />
        </div>
      </div>
    );
  }
  return (
    <div className="mio-wide-steps">
      <div>
        <span>01</span>
        <h3>Choose a client</h3>
        <ClientChoices active={active} setActive={setActive} />
      </div>
      <div>
        <span>02</span>
        <h3>Install</h3>
        <InstallAction active={active} />
      </div>
      <div>
        <span>03</span>
        <h3>Sign in</h3>
        <p>Your agent opens a browser tab the first time. No API key to manage.</p>
        <code className="mio-endpoint">{MCP_ENDPOINT}</code>
      </div>
    </div>
  );
}

export function McpInstallOptions({ variant }: { variant: McpDesignSlug }) {
  const [active, setActive] = useState<InstallId>('claude');
  const copy = DESIGN_COPY[variant];
  const docked = variant === 'proof-dock';

  return (
    <div data-lo="mcp-install" data-variant={variant} className="mio">
      <header className="mio-top mio-wrap">
        <Link href="/landing-options/three-gates">ClipSubtitles</Link>
        <span>Installer design study</span>
      </header>
      <main>
        <section className="mio-hero mio-wrap" aria-labelledby="mio-title">
          <div className="mio-hero-copy">
            <p className="mio-kicker">AI video caption generator</p>
            <h1 id="mio-title">
              Create styled video captions <em>with your AI agent.</em>
            </h1>
            <p className="mio-lede">
              Upload a short video, generate accurate captions, choose a look and preview the result
              before you export.
            </p>
            <div className="mio-ctas">
              <Link href="/sign-in">Caption a video</Link>
              <a href="#mio-guide">See how it works</a>
            </div>
            {!docked && <HeroInstaller variant={variant} active={active} setActive={setActive} />}
          </div>
          <div className="mio-proof" aria-label="Styled caption preview">
            <div className="mio-phone">
              <div className="mio-time">00:12</div>
              <div className="mio-caption">
                SHIP THE <mark>UPDATE</mark>
                <br />
                TO THEIR INBOX
              </div>
              <div className="mio-scrub">
                <i />
              </div>
            </div>
            {docked && <HeroInstaller variant={variant} active={active} setActive={setActive} />}
          </div>
        </section>

        <section id="mio-guide" className="mio-guide mio-wrap" aria-labelledby="mio-guide-title">
          <div className="mio-guide-head">
            <div>
              <p className="mio-kicker">Below the fold · {copy.title}</p>
              <h2 id="mio-guide-title">Add ClipSubtitles to your agent.</h2>
            </div>
            <p>{copy.note} Choose a client, install the server and sign in through your browser.</p>
          </div>
          <Guide variant={variant} active={active} setActive={setActive} />
          <Link className="mio-docs" href="/developers">
            Read the MCP docs <span aria-hidden>↗</span>
          </Link>
        </section>
      </main>
      <DesignSwitcher current={variant} />
    </div>
  );
}
