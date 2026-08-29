'use client';

import { useEffect, useRef, useState } from 'react';
import { EDITED_WORD, OUTPUTS, SAMPLE, shortHash } from './facts';

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
      <figure className="tg-artifact" aria-label="The caption artifact, changing as it passes each gate">
        <div className="tg-frame">
          <div className="tg-frame-video" />
          <span className="tg-frame-readout lo-mono">
            v{gate >= 1 ? SAMPLE.version : SAMPLE.prevVersion} · {shortHash(gate >= 1 ? SAMPLE.hashV3 : SAMPLE.hashV2, 6, 4)}
          </span>
          <p className="tg-caption lo-cap">
            {page2.map((w) => (
              <span key={w.id} className={w.was ? 'tg-word tg-word-edited' : 'tg-word'}>
                {w.was && gate < 1 ? w.was : w.text}
              </span>
            ))}
          </p>
          <div className="tg-quote lo-mono" aria-hidden={gate !== 2}>
            <span>{SAMPLE.quoteId}</span>
            <span className="tg-quote-cost">{SAMPLE.creditCost} credits</span>
            <span>
              v{SAMPLE.version} · {SAMPLE.outputs.join(' + ')} · 1080p
            </span>
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
          <span className="tg-gate-n lo-mono">Gate 1</span>
          <h3>Words</h3>
          <p>
            The transcript heard “{EDITED_WORD.was}”. You mean “{EDITED_WORD.text}”. One explicit patch —{' '}
            <span className="lo-mono">replace_word_text</span> — bumps v{SAMPLE.prevVersion} to v{SAMPLE.version} and changes the content hash. Nothing else moves; the
            system never rewrites a spoken word on its own.
          </p>
        </li>
        <li ref={(el) => void (refs.current[1] = el)} data-gate="2" className="tg-gate">
          <span className="tg-gate-n lo-mono">Gate 2</span>
          <h3>Cost</h3>
          <p>
            The agent asks to render and gets a quote instead: version, hash, outputs, {SAMPLE.creditCost} credits, an expiry. It cannot approve.
            You echo <span className="lo-mono">approvedCreditCost: {SAMPLE.creditCost}</span> — exactly — or nothing is reserved.
          </p>
        </li>
        <li ref={(el) => void (refs.current[2] = el)} data-gate="3" className="tg-gate">
          <span className="tg-gate-n lo-mono">Gate 3</span>
          <h3>Output</h3>
          <p>
            MP4 with captions composited, a ProRes 4444 overlay with alpha, SRT, VTT. Your selection is frozen inside the quote; the render settles
            the credits once and hands back short-lived download links.
          </p>
        </li>
      </ol>
    </div>
  );
}
