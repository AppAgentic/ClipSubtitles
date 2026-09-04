import Image from 'next/image';

type ClipSubtitlesWordmarkProps = {
  className?: string;
};

/**
 * Shared brand lockup using the selected Caption C monogram and live type.
 */
export function ClipSubtitlesWordmark({ className = '' }: ClipSubtitlesWordmarkProps) {
  return (
    <span className={`cs-wordmark ${className}`.trim()}>
      <span className="cs-wordmark__mark" aria-hidden="true">
        <Image
          className="cs-wordmark__mark-image cs-wordmark__mark-image--light"
          src="/brand/clipsubtitles-mark-light.png"
          alt=""
          width={32}
          height={32}
        />
        <Image
          className="cs-wordmark__mark-image cs-wordmark__mark-image--dark"
          src="/brand/clipsubtitles-mark-dark.png"
          alt=""
          width={32}
          height={32}
        />
      </span>
      <span className="cs-wordmark__name">
        <span className="cs-wordmark__clip">Clip</span>
        <span className="cs-wordmark__subtitles">Subtitles</span>
      </span>
    </span>
  );
}
