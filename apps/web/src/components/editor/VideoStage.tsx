'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptionPage, SourceAsset, StyleConfig, TranscriptWord } from '@clipsubtitles/contracts';
import { timecode } from '@/lib/format';
import { CaptionOverlay } from './CaptionOverlay';

export interface StageHandle {
  seek(ms: number): void;
}

export function VideoStage({
  source,
  words,
  pages,
  style,
  timeMs,
  onTime,
  handleRef,
}: {
  source: SourceAsset;
  words: readonly TranscriptWord[];
  pages: readonly CaptionPage[];
  style: StyleConfig;
  timeMs: number;
  onTime: (ms: number) => void;
  handleRef: React.MutableRefObject<StageHandle | null>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [playing, setPlaying] = useState(false);
  const durationMs = source.durationMs ?? 0;
  const srcW = source.width ?? 1080;
  const srcH = source.height ?? 1920;

  // Fit the frame into the stage box, preserving the source aspect ratio.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(box.width / srcW, box.height / srcH) || 0;
  const frame = { width: Math.floor(srcW * scale), height: Math.floor(srcH * scale) };

  // Time source: rAF while playing, events otherwise.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      onTime(Math.round(v.currentTime * 1000));
      if (!v.paused && !v.ended) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      onTime(Math.round(v.currentTime * 1000));
    };
    const onSeek = () => onTime(Math.round(v.currentTime * 1000));
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onPause);
    v.addEventListener('seeked', onSeek);
    v.addEventListener('timeupdate', onSeek);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onPause);
      v.removeEventListener('seeked', onSeek);
      v.removeEventListener('timeupdate', onSeek);
    };
  }, [onTime]);

  const seek = useCallback(
    (ms: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(durationMs, ms)) / 1000;
      onTime(Math.round(v.currentTime * 1000));
    },
    [durationMs, onTime],
  );
  useEffect(() => {
    handleRef.current = { seek };
  }, [handleRef, seek]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seek(timeMs - (e.shiftKey ? 1000 : 100));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seek(timeMs + (e.shiftKey ? 1000 : 100));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seek, timeMs]);

  const activePage = pages.find((p) => timeMs >= p.startMs && timeMs < p.endMs);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={boxRef} className="relative grid min-h-0 flex-1 place-items-center">
        <div className="relative overflow-hidden rounded-[10px] bg-black shadow-[var(--shadow-float)]" style={{ width: frame.width, height: frame.height }}>
          {source.playbackUrl ? (
            <video ref={videoRef} src={source.playbackUrl} playsInline preload="metadata" className="absolute inset-0 h-full w-full" style={{ objectFit: 'contain' }} />
          ) : (
            <div className="grid h-full w-full place-items-center text-[12px] text-ink-mute">No playable source.</div>
          )}
          <CaptionOverlay words={words} pages={pages} style={style} frame={frame} timeMs={timeMs} />
          {/* Safe-area guides */}
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/10" style={{ top: `${style.safeMarginPct * 100}%` }} />
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/10" style={{ bottom: `${style.safeMarginPct * 100}%` }} />
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-line bg-panel/80 px-3 py-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? 'Pause' : 'Play'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line-strong bg-bg-elev text-ink hover:border-signal hover:text-signal"
          >
            {playing ? (
              <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor" aria-hidden>
                <rect x="0" y="0" width="4" height="12" rx="1" />
                <rect x="7" y="0" width="4" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor" aria-hidden>
                <path d="M1 1.2v9.6a1 1 0 0 0 1.5.86l8-4.8a1 1 0 0 0 0-1.72l-8-4.8A1 1 0 0 0 1 1.2z" />
              </svg>
            )}
          </button>
          <span className="mono w-[66px] text-[12px] text-ink">{timecode(timeMs)}</span>
          <div className="relative flex-1">
            <input
              type="range"
              min={0}
              max={Math.max(1, durationMs)}
              step={10}
              value={Math.min(timeMs, durationMs)}
              style={{ ['--fill' as string]: `${durationMs ? (timeMs / durationMs) * 100 : 0}%` }}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Scrub"
            />
          </div>
          <span className="mono w-[66px] text-right text-[12px] text-ink-mute">{timecode(durationMs)}</span>
        </div>
        <div className="relative mt-1 h-6 w-full overflow-hidden rounded-md bg-bg-elev" title="Caption pages — click to jump">
          {pages.map((p) => {
            const left = durationMs ? (p.startMs / durationMs) * 100 : 0;
            const width = durationMs ? ((p.endMs - p.startMs) / durationMs) * 100 : 0;
            const active = activePage?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => seek(p.startMs + 1)}
                title={p.text}
                className={`absolute top-1 h-4 rounded-[3px] border transition-colors ${active ? 'border-signal bg-signal/50' : 'border-line-strong bg-line hover:bg-line-strong'}`}
                style={{ left: `${left}%`, width: `max(2px, ${width}%)` }}
              />
            );
          })}
          <div className="pointer-events-none absolute top-0 h-full w-px bg-ink" style={{ left: `${durationMs ? (timeMs / durationMs) * 100 : 0}%` }} />
        </div>
      </div>
    </div>
  );
}
