'use client';

import { useEffect, useRef } from 'react';

/**
 * Frame-grid playhead + frame counter. Runs a requestAnimationFrame clock at the
 * clip's fps; static (frame 0) when the user prefers reduced motion or the tab
 * is hidden. Renders complete markup on the server.
 */
export function FrameCounter({ frames, fps, startFrame = 0 }: { frames: number; fps: number; startFrame?: number }) {
  const counterRef = useRef<HTMLSpanElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const counter = counterRef.current;
    const head = headRef.current;
    if (!counter || !head) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches) return;

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const frame = (startFrame + Math.floor(((now - t0) / 1000) * fps)) % frames;
      counter.textContent = String(frame).padStart(5, '0');
      head.style.left = `${(frame / frames) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [frames, fps, startFrame]);

  return (
    <div className="fx-grid" role="img" aria-label={`Frame grid, ${frames} frames at ${fps} frames per second`}>
      <span className="fx-grid-track" aria-hidden>
        <span ref={headRef} className="fx-grid-head" style={{ left: `${(startFrame / frames) * 100}%` }} />
      </span>
      <span className="fx-grid-readout lo-mono" aria-hidden>
        f <span ref={counterRef}>{String(startFrame).padStart(5, '0')}</span> / {String(frames).padStart(5, '0')} · {fps} fps
      </span>
    </div>
  );
}
