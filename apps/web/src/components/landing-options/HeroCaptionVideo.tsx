'use client';

import { useEffect, useRef, useState } from 'react';

export function HeroCaptionVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    void video.play().catch(() => setIsPlaying(false));
  }, []);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false));
      return;
    }

    video.pause();
  };

  return (
    <div className="tg-hero-video-wrap">
      <video
        ref={videoRef}
        className="tg-hero-video"
        src="/marketing/hero-bold-pop.mp4"
        poster="/marketing/hero-bold-pop-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="A creator video demonstrating animated Bold Pop captions"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <button
        type="button"
        className="tg-hero-video-toggle"
        onClick={togglePlayback}
        aria-label={isPlaying ? 'Pause example video' : 'Play example video'}
      >
        <span aria-hidden>{isPlaying ? 'Ⅱ' : '▶'}</span>
      </button>
    </div>
  );
}
