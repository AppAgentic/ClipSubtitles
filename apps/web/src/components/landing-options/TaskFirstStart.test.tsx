// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TaskFirstStart } from './TaskFirstStart';

afterEach(cleanup);

describe('TaskFirstStart', () => {
  it('leads with the upload task and offers a real sample path', () => {
    render(<TaskFirstStart />);

    expect(screen.getByRole('button', { name: /upload a video/i })).toBeTruthy();
    const sample = screen.getByRole('link', { name: /try a real sample/i });
    expect(sample.getAttribute('href')).toContain('demo%3D1');
    expect(screen.getByText(/first clip free/i)).toBeTruthy();
  });
});
