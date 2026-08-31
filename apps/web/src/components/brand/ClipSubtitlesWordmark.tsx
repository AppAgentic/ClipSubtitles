type ClipSubtitlesWordmarkProps = {
  className?: string;
};

/**
 * Production translation of the selected GPT Image 2 Editorial Strip concept.
 * Live type keeps the mark crisp, theme-aware and accessible at every size.
 */
export function ClipSubtitlesWordmark({ className = '' }: ClipSubtitlesWordmarkProps) {
  return (
    <span className={`cs-wordmark ${className}`.trim()}>
      <span className="cs-wordmark__clip">Clip</span>
      <span className="cs-wordmark__subtitles">Subtitles</span>
    </span>
  );
}
