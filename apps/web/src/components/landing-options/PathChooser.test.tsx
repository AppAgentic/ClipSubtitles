// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PathChooser } from './PathChooser';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('PathChooser', () => {
  it('defaults to the first agent path and exposes the verified client board', () => {
    render(<PathChooser />);
    expect(
      screen.getByRole('tab', { name: 'Connect your agent' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByRole('tab', { name: 'Use in browser' }).getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(screen.getByRole('radio', { name: 'Claude Code' })).toBeTruthy();
    expect(screen.getByText(/claude mcp add --transport http/)).toBeTruthy();
  });

  it('swaps to the browser panel on click and keeps its subordinate sign-in link', () => {
    render(<PathChooser />);
    fireEvent.click(screen.getByRole('tab', { name: 'Use in browser' }));
    expect(screen.getByRole('tab', { name: 'Use in browser' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('link', { name: /Continue in browser/ }).getAttribute('href')).toBe(
      '/sign-in?returnTo=/app/new',
    );
    expect(screen.queryByRole('radio', { name: 'Claude Code' })).toBeNull();
  });

  it('moves tab focus with the arrow keys and never traps focus', () => {
    render(<PathChooser />);
    const agentTab = screen.getByRole('tab', { name: 'Connect your agent' });
    agentTab.focus();
    fireEvent.keyDown(agentTab, { key: 'ArrowRight' });
    const browserTab = screen.getByRole('tab', { name: 'Use in browser' });
    expect(screen.getByRole('tab', { name: 'Use in browser' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(document.activeElement).toBe(browserTab);
    fireEvent.keyDown(browserTab, { key: 'ArrowLeft' });
    expect(agentTab.getAttribute('aria-selected')).toBe('true');
  });
});
