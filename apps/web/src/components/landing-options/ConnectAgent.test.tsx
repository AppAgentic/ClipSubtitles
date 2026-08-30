// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectAgent } from './ConnectAgent';
import { HeroConnect } from './HeroConnect';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HeroConnect', () => {
  it('keeps the primary client commands and one-click links above the fold', () => {
    render(<HeroConnect />);
    expect(screen.getByRole('tab', { name: 'Claude Code' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/claude mcp add --transport http/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cursor' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'VS Code' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Full setup guide/ }).getAttribute('href')).toBe('#connect');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Claude Code' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Codex' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('ConnectAgent', () => {
  it('exposes an accessible tabbed installer and changes commands', () => {
    render(<ConnectAgent />);
    expect(screen.getByRole('tab', { name: 'Claude Code' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Codex' }));
    expect(screen.getByRole('tab', { name: 'Codex' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/codex mcp login clipsubtitles/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('copies the complete active setup and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ConnectAgent />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('claude mcp add --transport http'));
    expect(await screen.findByText('Claude Code setup copied.')).toBeTruthy();
  });

  it('offers verified one-click install links for compatible editors', () => {
    render(<ConnectAgent />);
    expect(screen.getByRole('link', { name: /Add to Cursor/ }).getAttribute('href')).toContain('cursor.com/link/mcp/install');
    expect(screen.getByRole('link', { name: /Add to VS Code/ }).getAttribute('href')).toContain('vscode:mcp/install');
  });
});
