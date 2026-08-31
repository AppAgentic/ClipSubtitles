'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MOTION_PRESETS, SAMPLE, STYLE_PRESETS, wordsForPage } from './facts';

export type StyleId = (typeof STYLE_PRESETS)[number];
export type MotionId = (typeof MOTION_PRESETS)[number];

export const STYLE_LABELS: Record<StyleId, string> = {
  clean: 'Clean',
  'bold-pop': 'Bold Pop',
  'lower-third': 'Lower Third',
  karaoke: 'Karaoke',
  minimal: 'Minimal',
};

export const MOTION_LABELS: Record<MotionId, string> = {
  none: 'Still',
  'soft-rise': 'Soft Rise',
  'spring-pop': 'Spring Pop',
  'karaoke-slide': 'Karaoke Slide',
};

/** Motion each style preset ships with (mirrors packages/core presets). */
const DEFAULT_MOTION: Record<StyleId, MotionId> = {
  clean: 'soft-rise',
  'bold-pop': 'spring-pop',
  'lower-third': 'soft-rise',
  karaoke: 'karaoke-slide',
  minimal: 'soft-rise',
};

export interface FrameWord {
  id: string;
  text: string;
  /** The word the highlight sits on (word-highlight styles only). */
  hot?: boolean;
  /** Marks a word a human corrected; the story colours it. */
  edited?: boolean;
}

/** Page one of the sample clip, with the highlight on "shipped". */
export const PAGE_ONE: readonly FrameWord[] = wordsForPage(SAMPLE.pages[0]).map((w, i) => {
  return { id: w.id, text: w.text, hot: i === 1 };
});

/**
 * A 9:16 frame with a CSS-rendered caption. Decorative: every place it is used
 * carries the same information in real text next to it. Caption size and
 * spacing are container-query units so the same markup scales from the hero
 * to the compact mobile sticky artifact.
 */
export function CaptionFrame({
  style,
  motion,
  words,
  readout,
  runKey = 0,
  className = '',
  image = '/marketing/creator-studio.webp',
  priority = false,
  children,
}: {
  style: StyleId;
  motion: MotionId;
  words: readonly FrameWord[];
  readout?: string;
  runKey?: number;
  className?: string;
  image?: string;
  priority?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`tg-frame ${className}`.trim()} data-style={style} data-motion={motion}>
      <div className="tg-frame-video">
        <Image
          src={image}
          alt=""
          fill
          sizes="(max-width: 860px) 220px, 300px"
          priority={priority}
        />
      </div>
      {readout ? <span className="tg-frame-readout lo-mono">{readout}</span> : null}
      <p key={runKey} className="tg-cap lo-cap">
        {words.map((w, i) => (
          <span
            key={w.id}
            className={['tg-cap-word', w.hot ? 'is-hot' : '', w.edited ? 'is-edited' : '']
              .filter(Boolean)
              .join(' ')}
            style={{ ['--i' as string]: i }}
          >
            {w.text}
          </span>
        ))}
      </p>
      {children}
    </div>
  );
}

/**
 * Interactive style + motion board. Server-renders Bold Pop / Spring Pop (the
 * preset's own motion) so the default is useful without JS; buttons are real
 * toggles with aria-pressed. Motion is replayed by re-keying the caption.
 */
export function StyleBoard() {
  const [style, setStyle] = useState<StyleId>('bold-pop');
  const [motion, setMotion] = useState<MotionId>('spring-pop');
  const [reduceMotion, setReduceMotion] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const previewSrc = `/marketing/style-previews/${style}--${motion}.mp4`;
  const posterSrc = `/marketing/style-previews/${style}.jpg`;

  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (reduceMotion) {
      video.pause();
      return;
    }
    void video.play().catch(() => undefined);
  }, [previewSrc, reduceMotion]);

  const pickStyle = (next: StyleId) => {
    setStyle(next);
    setMotion(DEFAULT_MOTION[next]);
  };
  const pickMotion = (next: MotionId) => {
    setMotion(next);
  };

  const replay = () => {
    const video = videoRef.current;
    if (!video || reduceMotion) return;
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  };

  return (
    <div className="tg-board">
      <div className="tg-board-stage">
        <div className="tg-style-preview-shell">
          <video
            key={previewSrc}
            ref={videoRef}
            className="tg-style-preview-video"
            src={previewSrc}
            poster={posterSrc}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={`${STYLE_LABELS[style]} captions with ${MOTION_LABELS[motion]} motion, rendered by ClipSubtitles`}
          />
          <span className="tg-style-preview-badge lo-mono">Rendered preview</span>
        </div>
        <p className="lo-sr" aria-live="polite">
          Previewing {STYLE_LABELS[style]} with {MOTION_LABELS[motion]} motion.
        </p>
        <button type="button" className="tg-replay lo-mono" onClick={replay}>
          ↻ Replay rendered motion
        </button>
        <p className="tg-rm-note">
          Motion is shown at its end state because your system prefers reduced motion.
        </p>
      </div>

      <div className="tg-board-controls">
        <div role="group" aria-labelledby="tg-style-label">
          <p id="tg-style-label" className="lo-eyebrow tg-board-label">
            Style · {STYLE_LABELS[style]}
          </p>
          <div className="tg-pills">
            {STYLE_PRESETS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === style}
                onClick={() => pickStyle(id)}
              >
                {STYLE_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
        <div role="group" aria-labelledby="tg-motion-label">
          <p id="tg-motion-label" className="lo-eyebrow tg-board-label">
            Motion · {MOTION_LABELS[motion]}
          </p>
          <div className="tg-pills">
            {MOTION_PRESETS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === motion}
                onClick={() => pickMotion(id)}
              >
                {MOTION_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
        <p className="tg-board-foot">
          Each style comes with a matching motion; change either. In the studio you preview the
          exact current version of your own clip at low resolution before you export.
        </p>
      </div>
    </div>
  );
}
