// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StylePresetVideo,
  stylePreviewPosterPath,
  stylePreviewVideoPath,
} from './StylePresetVideo';

describe('StylePresetVideo', () => {
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the preset default motion and lightweight poster contract', () => {
    const { container } = render(<StylePresetVideo preset="bold-pop" active={false} />);
    const video = container.querySelector('video');

    expect(video?.getAttribute('src')).toBe(stylePreviewVideoPath('bold-pop'));
    expect(video?.getAttribute('poster')).toBe(stylePreviewPosterPath('bold-pop'));
    expect(video?.getAttribute('preload')).toBe('none');
    expect(pause).toHaveBeenCalled();
  });

  it('only autoplays an active or hovered preview', () => {
    const { container, rerender } = render(<StylePresetVideo preset="clean" active={false} />);
    const shell = container.firstElementChild as HTMLElement;

    fireEvent.mouseEnter(shell);
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.mouseLeave(shell);
    expect(pause).toHaveBeenCalled();

    rerender(<StylePresetVideo preset="clean" active />);
    expect(container.querySelector('video')?.getAttribute('preload')).toBe('metadata');
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('does not autoplay when reduced motion is requested', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    render(<StylePresetVideo preset="clean" active />);

    expect(play).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
  });
});
