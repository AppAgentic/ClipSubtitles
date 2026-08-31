'use client';

import { useEffect, useRef } from 'react';
import type { StylePresetId } from '@clipsubtitles/contracts';

export const PRESET_BLURBS: Record<StylePresetId, string> = {
  clean: 'Bold, centred, soft shadow',
  'bold-pop': 'Punchy highlight, lower third',
  'lower-third': 'Left-aligned on a plate',
  karaoke: 'Word-by-word highlight',
  minimal: 'Small, single line, plate',
  'viral-beast': 'Condensed, fast, high-energy',
  'submagic-pop': 'Rounded pop with lime focus',
  'smooth-pill': 'Fluid purple active pill',
  'editorial-serif': 'Warm premium serif',
  'neon-box': 'Cyan monospace glow',
  'kinetic-flow': 'Top-led flowing highlight',
  'retro-arcade': 'Pixel-like green terminal',
  documentary: 'Quiet cinematic lower third',
};

export function stylePreviewVideoPath(preset: StylePresetId): string {
  return `/marketing/style-previews/ui-${preset}.mp4`;
}

export function stylePreviewPosterPath(preset: StylePresetId): string {
  return `/marketing/style-previews/ui-${preset}.jpg`;
}

/**
 * A real renderer output. Only the selected card autoplays; the rest stay on
 * their lightweight poster and play on hover, avoiding a grid of decoders.
 */
export function StylePresetVideo({
  preset,
  active,
  className = '',
}: {
  preset: StylePresetId;
  active: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!active || reduceMotion) {
      video.pause();
      video.currentTime = 0;
      return;
    }
    void video.play().catch(() => undefined);
  }, [active]);

  const playHover = () => {
    const video = videoRef.current;
    if (!video || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    void video.play().catch(() => undefined);
  };

  const stopHover = () => {
    const video = videoRef.current;
    if (!video || active) return;
    video.pause();
    video.currentTime = 0;
  };

  return (
    <span
      className={`relative grid overflow-hidden bg-black ${className}`.trim()}
      onMouseEnter={playHover}
      onMouseLeave={stopHover}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-contain"
        src={stylePreviewVideoPath(preset)}
        poster={stylePreviewPosterPath(preset)}
        autoPlay={active}
        muted
        loop
        playsInline
        preload={active ? 'metadata' : 'none'}
        tabIndex={-1}
      />
    </span>
  );
}
