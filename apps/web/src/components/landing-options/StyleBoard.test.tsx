// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StyleBoard } from './StyleBoard';

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('StyleBoard', () => {
  it('starts on the real Bold Pop render and swaps to each style default motion', () => {
    render(<StyleBoard />);
    const initial = screen.getByLabelText(/Bold Pop captions with Spring Pop motion/);
    expect(initial.getAttribute('src')).toBe('/marketing/style-previews/bold-pop--spring-pop.mp4');

    fireEvent.click(screen.getByRole('button', { name: 'Karaoke' }));
    const karaoke = screen.getByLabelText(/Karaoke captions with Karaoke Slide motion/);
    expect(karaoke.getAttribute('src')).toBe(
      '/marketing/style-previews/karaoke--karaoke-slide.mp4',
    );
    expect(screen.getByRole('button', { name: 'Karaoke' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('loads a real style and motion combination when the motion changes', () => {
    render(<StyleBoard />);
    fireEvent.click(screen.getByRole('button', { name: 'Minimal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Still' }));
    expect(screen.getByLabelText(/Minimal captions with Still motion/).getAttribute('src')).toBe(
      '/marketing/style-previews/minimal--none.mp4',
    );
  });
});
