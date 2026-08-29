'use client';

import { useEffect, useState } from 'react';
import type { CaptionPage, PatchOp, TranscriptWord } from '@clipsubtitles/contracts';
import { timecode } from '@/lib/format';

const NUDGE_MS = 40;

export function WordEditor({
  page,
  words,
  onOps,
  onSeek,
  busy,
}: {
  page: CaptionPage | null;
  words: readonly TranscriptWord[];
  onOps: (ops: PatchOp[]) => void;
  onSeek: (ms: number) => void;
  busy: boolean;
}) {
  if (!page) return <div className="px-4 py-6 text-[12px] text-ink-mute">Select a caption page to edit its words.</div>;
  const slice = words.slice(page.startWordIndex, page.endWordIndex + 1);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-line px-4 py-2 text-[11px] text-ink-mute">
        Page {page.index + 1} · {slice.length} words · edits are explicit and recorded as a new transcript revision.
      </div>
      <ul>
        {slice.map((w, i) => {
          const index = page.startWordIndex + i;
          const prev = words[index - 1];
          const next = words[index + 1];
          return (
            <WordRow
              key={w.id}
              word={w}
              prev={prev}
              next={next}
              canSplit={i > 0}
              busy={busy}
              onSeek={onSeek}
              onOps={onOps}
              pageId={page.id}
            />
          );
        })}
      </ul>
    </div>
  );
}

function WordRow({
  word,
  prev,
  next,
  canSplit,
  busy,
  onSeek,
  onOps,
  pageId,
}: {
  word: TranscriptWord;
  prev: TranscriptWord | undefined;
  next: TranscriptWord | undefined;
  canSplit: boolean;
  busy: boolean;
  onSeek: (ms: number) => void;
  onOps: (ops: PatchOp[]) => void;
  pageId: string;
}) {
  const [text, setText] = useState(word.text);
  // Keep the draft in sync when the word changes underneath us (reload, conflict resolution, agent edit).
  useEffect(() => {
    setText(word.text);
  }, [word.text]);
  const commitText = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setText(word.text);
      return;
    }
    if (trimmed !== word.text) onOps([{ op: 'replace_word_text', wordId: word.id, text: trimmed }]);
  };
  const timing = (startDelta: number, endDelta: number) => {
    const startMs = Math.max(prev ? prev.endMs : 0, word.startMs + startDelta);
    const endMs = Math.min(next ? next.startMs : Number.MAX_SAFE_INTEGER, word.endMs + endDelta);
    if (endMs <= startMs) return;
    onOps([{ op: 'set_word_timing', wordId: word.id, startMs, endMs }]);
  };
  return (
    <li className="group border-b border-line/60 px-3 py-2">
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setText(word.text);
          }}
          disabled={busy}
          aria-label="Word text"
          className={`min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-ink hover:border-line-strong focus:border-signal focus:bg-bg-elev ${word.edited ? 'italic text-signal-soft' : ''}`}
        />
        <button type="button" onClick={() => onSeek(word.startMs)} className="mono text-[11px] text-ink-mute hover:text-ink" title="Jump to word">
          {timecode(word.startMs)}
        </button>
      </div>
      <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Nudge label="in" onMinus={() => timing(-NUDGE_MS, 0)} onPlus={() => timing(NUDGE_MS, 0)} value={word.startMs} disabled={busy} />
        <Nudge label="out" onMinus={() => timing(0, -NUDGE_MS)} onPlus={() => timing(0, NUDGE_MS)} value={word.endMs} disabled={busy} />
        <span className="flex-1" />
        {canSplit ? (
          <button type="button" disabled={busy} onClick={() => onOps([{ op: 'split_page', pageId, beforeWordId: word.id }])} className="rounded border border-line-strong px-1.5 py-[1px] text-[10px] text-ink-mute hover:border-signal hover:text-signal" title="Start a new page at this word">
            split ↑
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => onOps([{ op: 'delete_word', wordId: word.id }])} className="rounded border border-line-strong px-1.5 py-[1px] text-[10px] text-ink-mute hover:border-danger hover:text-danger" title="Remove this word">
          delete
        </button>
      </div>
    </li>
  );
}

function Nudge({ label, value, onMinus, onPlus, disabled }: { label: string; value: number; onMinus: () => void; onPlus: () => void; disabled: boolean }) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded border border-line-strong text-[10px]">
      <span className="mono bg-bg-elev px-1.5 py-[2px] text-ink-mute">{label}</span>
      <button type="button" disabled={disabled} onClick={onMinus} className="px-1.5 py-[2px] text-ink-dim hover:bg-panel-2 hover:text-ink">
        −
      </button>
      <span className="mono px-1 text-ink-dim">{(value / 1000).toFixed(2)}</span>
      <button type="button" disabled={disabled} onClick={onPlus} className="px-1.5 py-[2px] text-ink-dim hover:bg-panel-2 hover:text-ink">
        +
      </button>
    </span>
  );
}
