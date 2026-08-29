import type { CaptionPage, StyleConfig, TranscriptWord } from '@clipsubtitles/contracts';

/**
 * Input props of the CaptionVideo composition. Lives in a plain .ts module so
 * non-JSX consumers (the renderer, the server worker) can import the type
 * without needing a `jsx` compiler setting.
 *
 * Type alias (not interface) so it satisfies Remotion's Record<string, unknown> props constraint.
 */
export type CaptionVideoProps = {
  /** HTTP URL of the source media; null renders a transparent caption-only overlay. */
  sourceUrl: string | null;
  words: TranscriptWord[];
  pages: CaptionPage[];
  style: StyleConfig;
  /** Media time at composition frame 0. */
  startMs: number;
  durationMs: number;
  fps: number;
  width: number;
  height: number;
};
