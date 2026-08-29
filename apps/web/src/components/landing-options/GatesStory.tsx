'use client';

import { useEffect, useRef, useState } from 'react';
import { EDITED_WORD, OUTPUTS, SAMPLE, wordsForPage } from './facts';
import { CaptionFrame, type FrameWord } from './StyleBoard';

type Gate = 0 | 1 | 2 | 3;

const page2 = wordsForPage(SAMPLE.pages[1]);

const STATUS: Record<Gate, string> = {
  0: 'reviewing captions',
  1: '1 word corrected',
  2: 'Bold Pop · Spring Pop',
  3: 'files ready',
};

/**
 * The scroll story: a sticky caption artifact travels past three gates.
 * IntersectionObserver picks the active gate; the artifact re-renders its
 * state. All content is server-rendered; JS only changes which state shows.
 * The figure is decorative — each gate's text carries the meaning.
 */
export function GatesStory() {
  const [gate, setGate] = useState<Gate>(0);
  const refs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const els = refs.current.filter(Boolean) as HTMLElement[];
    if (typeof IntersectionObserver === 'undefined' || els.length === 0) {
      setGate(1);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setGate(Number(e.target.getAttribute('data-gate')) as Gate);
            e.target.setAttribute('data-charged', 'true');
          }
        }
      },
      // A band between 30 % and 55 % of the viewport: a gate activates as soon
      // as it crosses it, so the artifact changes before the copy is read.
      { threshold: 0, rootMargin: '-30% 0px -45% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const words: FrameWord[] = page2.map((w) => ({
    id: w.id,
    text: w.was && gate < 1 ? w.was : w.text,
    edited: Boolean(w.was),
  }));

  return (
    <div className="tg-story" data-gate={gate}>
      <figure className="tg-artifact" aria-hidden="true">
        <CaptionFrame
          style="bold-pop"
          motion="none"
          words={words}
          readout={`00:12 · ${STATUS[gate]}`}
          className="tg-frame-story"
        >
          <div className="tg-look-sheet">
            <span className="lo-mono">Your look</span>
            <span className="tg-look-name">Bold Pop</span>
            <span>Spring Pop · low-res preview</span>
          </div>
        </CaptionFrame>
        <div className="tg-artifact-side">
          <span className="tg-artifact-status lo-mono">
            {String(Math.max(gate, 1)).padStart(2, '0')} · {STATUS[gate]}
          </span>
          <ul className="tg-outputs lo-mono">
            {OUTPUTS.map((o, i) => (
              <li key={o.kind} style={{ ['--i' as string]: i }}>
                {o.label}
              </li>
            ))}
          </ul>
        </div>
      </figure>

      <ol className="tg-gates">
        <li ref={(el) => void (refs.current[0] = el)} data-gate="1" className="tg-gate">
          <span className="tg-gate-n lo-mono">01 · Automatic captions</span>
          <h3>Generate timed captions.</h3>
          <p>
            ClipSubtitles turns the speech in your video into word-timed captions. If it hears
            “{EDITED_WORD.was}” when you said “{EDITED_WORD.text}”, correct that word without
            rebuilding the rest of the transcript.
          </p>
        </li>
        <li ref={(el) => void (refs.current[1] = el)} data-gate="2" className="tg-gate">
          <span className="tg-gate-n lo-mono">02 · Edit and style</span>
          <h3>Choose how captions look.</h3>
          <p>
            Pick a readable caption style and motion, then preview the current version of your
            video before you export.
          </p>
        </li>
        <li ref={(el) => void (refs.current[2] = el)} data-gate="3" className="tg-gate">
          <span className="tg-gate-n lo-mono">03 · Export</span>
          <h3>Download your captioned video.</h3>
          <p>
            Download a captioned MP4, a transparent overlay for your own edit, or SRT and VTT
            subtitle files. One edit keeps every file in sync.
          </p>
        </li>
      </ol>
    </div>
  );
}
