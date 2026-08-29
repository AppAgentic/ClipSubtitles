import { Composition, registerRoot } from 'remotion';
import { defaultStyle } from '@clipsubtitles/core';
import { CaptionVideo, type CaptionVideoProps } from './composition/CaptionVideo';
import { durationInFrames } from './frame';
import { COMPOSITION_ID } from './root-id';

const defaultProps: CaptionVideoProps = {
  sourceUrl: null,
  words: [],
  pages: [],
  style: defaultStyle(),
  startMs: 0,
  durationMs: 1000,
  fps: 30,
  width: 1080,
  height: 1920,
};

function Root() {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={CaptionVideo}
      defaultProps={defaultProps}
      durationInFrames={30}
      fps={30}
      width={1080}
      height={1920}
      calculateMetadata={({ props }) => ({
        durationInFrames: durationInFrames(props.durationMs, props.fps),
        fps: props.fps,
        width: props.width,
        height: props.height,
      })}
    />
  );
}

registerRoot(Root);
