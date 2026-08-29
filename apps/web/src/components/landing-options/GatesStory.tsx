'use client';

import { useEffect, useRef, useState } from 'react';
import { EDITED_WORD, OUTPUTS, SAMPLE } from './facts';

type Gate = 0 | 1 | 2 | 3;

const page2 = SAMPLE.pages[1].wordIds.map((id) => SAMPLE.words.find((w) => w.id === id)!);

/**
 * The scroll story: a sticky caption artifact travels past three gates.
 * IntersectionObserver picks the active gate; the artifact re-renders its
 * state. All content is server-rendered; JS only changes which state shows.
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
            const g = Number(e.target.getAttribute('data-gate')) as Gate;
            setGate(g);
            e.target.setAttribute('data-charged', 'true');
          }
        }
      },
      { threshold: 0.5 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="tg-story" data-gate={gate}>
      <figure className="tg-artifact" aria-label="A captioned video moving from words to style to finished files">
        <div className="tg-frame">
          <div className="tg-frame-video" />
          <span className="tg-frame-readout lo-mono">
            00:12 · {gate >= 1 ? '1 word corrected' : 'reviewing captions'}
          </span>
          <p className="tg-caption lo-cap">
            {page2.map((w) => (
              <span key={w.id} className={w.was ? 'tg-word tg-word-edited' : 'tg-word'}>
                {w.was && gate < 1 ? w.was : w.text}
              </span>
            ))}
          </p>
          <div className="tg-quote" aria-hidden={gate !== 2}>
            <span className="lo-mono">Your look</span>
            <span className="tg-quote-cost">Bold Pop</span>
            <span>Spring motion · 1080p preview</span>
          </div>
        </div>
        <ul className="tg-outputs lo-mono" aria-hidden={gate !== 3}>
          {OUTPUTS.map((o, i) => (
            <li key={o.kind} style={{ ['--i' as string]: i }}>
              {o.label}
            </li>
          ))}
        </ul>
      </figure>

      <ol className="tg-gates">
        <li ref={(el) => void (refs.current[0] = el)} data-gate="1" className="tg-gate">
          <span className="tg-gate-n lo-mono">01 · Words</span>
          <h3>Fix any word.</h3>
          <p>
            Captions arrive timed to your speech and ready to review. If the transcript hears “{EDITED_WORD.was}” when you said “{EDITED_WORD.text}”,
            correct that word and carry on. The rest stays exactly where it was.
          </p>
        </li>
        <li ref={(el) => void (refs.current[1] = el)} data-gate="2" className="tg-gate">
          <span className="tg-gate-n lo-mono">02 · Look</span>
          <h3>Make it yours.</h3>
          <p>
            Choose one of five caption styles and four motion options. Preview the finished look before you export—without keyframes, timelines or
            rebuilding the effect for every clip.
          </p>
        </li>
        <li ref={(el) => void (refs.current[2] = el)} data-gate="3" className="tg-gate">
          <span className="tg-gate-n lo-mono">03 · Files</span>
          <h3>Export your way.</h3>
          <p>
            Download a ready-to-post captioned MP4, a transparent caption layer for your own edit, or subtitle files for any platform. One edit keeps
            every format in sync.
          </p>
        </li>
      </ol>
    </div>
  );
}
