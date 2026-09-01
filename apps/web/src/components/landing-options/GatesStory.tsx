import Image from 'next/image';

import { EDITED_WORD, OUTPUTS } from './facts';

const STEPS = [
  {
    n: '01',
    title: 'Words',
    image: '/marketing/workflow-words.webp',
    alt: 'Audio becoming editable caption lines',
    body: `Speech becomes word-timed captions. If it hears “${EDITED_WORD.was}” when you said “${EDITED_WORD.text}”, correct that one word without rebuilding the rest.`,
  },
  {
    n: '02',
    title: 'Look',
    image: '/marketing/workflow-look.webp',
    alt: 'A vertical video with styled captions',
    body: 'Pick a readable caption style and motion, then preview the current version of your clip before you export.',
  },
  {
    n: '03',
    title: 'Download',
    image: '/marketing/workflow-download.webp',
    alt: 'A finished captioned video ready to download',
    body: 'Export a captioned video, a transparent overlay, or subtitle files — all from the same reviewed words and timing.',
  },
] as const;

/**
 * Words → Look → Download: a static, always-visible three-step strip.
 * Replaces the former sticky/IntersectionObserver scroll story — every step
 * is plain server-rendered content, so it reads identically with or without
 * JavaScript and never scroll-jacks the page.
 */
export function GatesStory() {
  return (
    <ol className="tg-steps">
      {STEPS.map((step) => (
        <li key={step.n} className="tg-step">
          <div className="tg-step-visual">
            <Image src={step.image} alt={step.alt} fill sizes="(max-width: 860px) 100vw, 33vw" />
          </div>
          <div className="tg-step-title">
            <span className="tg-step-n lo-mono">{step.n}</span>
            <h3>{step.title}</h3>
          </div>
          <p>{step.body}</p>
          {step.title === 'Download' ? (
            <ul className="tg-outputs lo-mono">
              {OUTPUTS.map((output) => (
                <li key={output.kind}>{output.label}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
