import Image from 'next/image';

const FOOTAGE = [
  {
    src: '/marketing/creator-studio.webp',
    label: 'Creator updates',
    caption: 'Say it clearly',
  },
  {
    src: '/marketing/founder-workshop.webp',
    label: 'Product stories',
    caption: 'Make it land',
  },
  {
    src: '/marketing/filmmaker-workflow.webp',
    label: 'Studio workflows',
    caption: 'Ready to ship',
  },
] as const;

export function FootageReel() {
  return (
    <section className="tg-reel lo-wrap" aria-labelledby="tg-reel-title">
      <div className="tg-reel-head">
        <p className="lo-eyebrow tg-eyebrow">Captions in context</p>
        <h2 id="tg-reel-title">Made to look at home in the video.</h2>
      </div>
      <div className="tg-reel-grid">
        {FOOTAGE.map((item, index) => (
          <figure key={item.src} className="tg-reel-shot">
            <Image
              src={item.src}
              alt=""
              fill
              sizes="(max-width: 560px) 72vw, (max-width: 960px) 33vw, 360px"
            />
            <span className="tg-reel-code lo-mono" aria-hidden>
              0{index + 1} · 00:0{index + 2}
            </span>
            <span className="tg-reel-caption lo-cap" aria-hidden>{item.caption}</span>
            <figcaption>{item.label}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

