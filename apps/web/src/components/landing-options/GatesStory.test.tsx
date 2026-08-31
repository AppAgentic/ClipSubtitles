// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GatesStory } from './GatesStory';

afterEach(() => {
  cleanup();
});

describe('GatesStory', () => {
  it('renders three static Words → Look → Download steps with no data-gate state', () => {
    const { container } = render(<GatesStory />);
    expect(screen.getByRole('heading', { name: 'Words', level: 3 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Look', level: 3 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Download', level: 3 })).toBeTruthy();
    expect(container.querySelector('[data-gate]')).toBeNull();
  });

  it('lists the real export outputs under the Download step, truthfully', () => {
    render(<GatesStory />);
    expect(screen.getByText('MP4')).toBeTruthy();
    expect(screen.getByText('OVERLAY')).toBeTruthy();
    expect(screen.getByText('SRT')).toBeTruthy();
    expect(screen.getByText('VTT')).toBeTruthy();
  });
});
