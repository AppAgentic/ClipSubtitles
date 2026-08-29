'use client';

import { useEffect, useRef } from 'react';
import type { CaptionPage, CaptionQaSummary } from '@clipsubtitles/contracts';
import { timecode } from '@/lib/format';

export function PageList({
  pages,
  qa,
  activePageId,
  selectedPageId,
  onSelect,
  onMergeNext,
  busy,
}: {
  pages: readonly CaptionPage[];
  qa: CaptionQaSummary | null;
  activePageId: string | null;
  selectedPageId: string | null;
  onSelect: (page: CaptionPage) => void;
  onMergeNext: (page: CaptionPage) => void;
  busy: boolean;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!activePageId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-page="${activePageId}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activePageId]);

  const issuesByPage = new Map<string, Array<{ severity: string; message: string }>>();
  for (const issue of qa?.issues ?? []) {
    const arr = issuesByPage.get(issue.pageId) ?? [];
    arr.push(issue);
    issuesByPage.set(issue.pageId, arr);
  }

  if (pages.length === 0) {
    return <div className="px-4 py-6 text-[12px] text-ink-mute">No caption pages yet. Generate captions to populate this list.</div>;
  }

  return (
    <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto" aria-label="Caption pages">
      {pages.map((p, i) => {
        const issues = issuesByPage.get(p.id) ?? [];
        const worst = issues.some((x) => x.severity === 'error') ? 'error' : issues.length ? 'warning' : null;
        const durationS = Math.max(0.001, (p.endMs - p.startMs) / 1000);
        const cps = p.text.length / durationS;
        const active = p.id === activePageId;
        const selected = p.id === selectedPageId;
        return (
          <li key={p.id} data-page={p.id} className={`group relative border-b border-line/60 transition-colors ${selected ? 'bg-panel-2' : 'hover:bg-panel-2/60'}`}>
            <div className={`absolute left-0 top-0 h-full w-[2px] transition-colors ${active ? 'bg-signal' : 'bg-transparent'}`} />
            <button type="button" onClick={() => onSelect(p)} aria-current={selected ? 'true' : undefined} className="w-full px-4 py-2.5 text-left outline-none focus-visible:bg-panel-2">
              <span className="flex items-center justify-between gap-2">
                <span className="mono text-[11px] text-ink-mute">
                  {String(i + 1).padStart(2, '0')} · {timecode(p.startMs)}–{timecode(p.endMs)}
                </span>
                <span className="flex items-center gap-1.5">
                  {p.manual ? <span className="mono text-[9px] uppercase tracking-[0.12em] text-info">manual</span> : null}
                  <span className={`mono text-[10px] ${worst === 'error' ? 'text-danger' : worst === 'warning' ? 'text-warn' : 'text-ink-mute'}`} title={issues.map((x) => x.message).join('\n') || `${cps.toFixed(1)} chars/s`}>
                    {cps.toFixed(0)} cps
                  </span>
                </span>
              </span>
              <span className={`mt-1 block whitespace-pre-line pr-16 text-[13px] leading-snug ${active ? 'text-ink' : 'text-ink-dim'}`}>{p.lines.map((l) => l.text).join('\n')}</span>
            </button>
            {i < pages.length - 1 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onMergeNext(p)}
                aria-label={`Merge page ${i + 1} with page ${i + 2}`}
                className="absolute right-3 bottom-2 rounded border border-line-strong bg-bg-elev px-1.5 py-[1px] text-[10px] text-ink-mute opacity-0 transition-opacity hover:border-signal hover:text-signal focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                merge ↓
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
