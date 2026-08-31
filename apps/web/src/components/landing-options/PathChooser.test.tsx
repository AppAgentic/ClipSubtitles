// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PathChooser } from './PathChooser';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('PathChooser', () => {
  it('defaults to the browser path with a subordinate sign-in link, agent panel hidden', () => {
    render(<PathChooser />);
    expect(screen.getByRole('tab', { name: 'Use in browser' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(
      screen.getByRole('tab', { name: 'Connect your agent' }).getAttribute('aria-selected'),
    ).toBe('false');
    expect(screen.getByRole('link', { name: /Continue in browser/ }).getAttribute('href')).toBe(
      '/sign-in?returnTo=/app/new',
    );
    expect(screen.queryByRole('radio', { name: 'Claude Code' })).toBeNull();
  });

  it('swaps in the agent panel on click, reusing the verified client board', () => {
    render(<PathChooser />);
    fireEvent.click(screen.getByRole('tab', { name: 'Connect your agent' }));
    expect(
      screen.getByRole('tab', { name: 'Connect your agent' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByRole('radio', { name: 'Claude Code' })).toBeTruthy();
    expect(screen.getByText(/claude mcp add --transport http/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Full guide/ }).getAttribute('href')).toBe('#connect');
  });

  it('moves tab focus with the arrow keys and never traps focus', () => {
    render(<PathChooser />);
    const browserTab = screen.getByRole('tab', { name: 'Use in browser' });
    browserTab.focus();
    fireEvent.keyDown(browserTab, { key: 'ArrowRight' });
    const agentTab = screen.getByRole('tab', { name: 'Connect your agent' });
    expect(agentTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(agentTab);
    fireEvent.keyDown(agentTab, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Use in browser' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});
