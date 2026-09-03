'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { HeroConnect } from './HeroConnect';
import { TaskFirstStart } from './TaskFirstStart';

type PathId = 'browser' | 'agent';

const PATHS: ReadonlyArray<{ id: PathId; label: string }> = [
  { id: 'agent', label: 'Connect your agent' },
  { id: 'browser', label: 'Use in browser' },
];

/**
 * Compact browser-vs-agent path chooser for the hero. A single tabbed
 * control swaps one panel in place — never two competing cards next to the
 * primary CTA — and the same markup works unchanged from mobile up to
 * desktop. Reuses HeroConnect (verified client tiles, install command, Copy
 * behavior, #connect link) rather than a parallel agent installer.
 */
export function PathChooser() {
  const [active, setActive] = useState<PathId>('agent');
  const panelId = useId();

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? PATHS.length - 1
          : (index + delta + PATHS.length) % PATHS.length;
    const next = PATHS[nextIndex] ?? { id: 'agent' as const, label: 'Connect your agent' };
    setActive(next.id);
    document.getElementById(`tg-path-tab-${next.id}`)?.focus();
  }

  return (
    <div className="tg-path">
      <div className="tg-path-tabs" role="tablist" aria-label="Start captioning">
        {PATHS.map((path, index) => (
          <button
            key={path.id}
            id={`tg-path-tab-${path.id}`}
            type="button"
            role="tab"
            aria-selected={active === path.id}
            aria-controls={`${panelId}-${path.id}`}
            tabIndex={active === path.id ? 0 : -1}
            onClick={() => setActive(path.id)}
            onKeyDown={(event) => move(event, index)}
          >
            {path.label}
          </button>
        ))}
      </div>

      <div
        id={`${panelId}-browser`}
        role="tabpanel"
        aria-labelledby="tg-path-tab-browser"
        hidden={active !== 'browser'}
        className="tg-path-panel"
      >
        <TaskFirstStart />
      </div>

      <div
        id={`${panelId}-agent`}
        role="tabpanel"
        aria-labelledby="tg-path-tab-agent"
        hidden={active !== 'agent'}
        className="tg-path-panel"
      >
        <HeroConnect />
      </div>
    </div>
  );
}
