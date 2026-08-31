// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectAgent } from './ConnectAgent';
import { HeroConnect } from './HeroConnect';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('HeroConnect', () => {
  it('keeps the primary client commands and one-click links above the fold', () => {
    render(<HeroConnect />);
    expect(screen.getByRole('radio', { name: 'Claude Code' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/claude mcp add --transport http/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Full guide/ }).getAttribute('href')).toBe('#connect');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Claude Code' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Codex' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Cursor' }));
    expect(screen.getByRole('link', { name: /Add to Cursor/ })).toBeTruthy();
  });
});

describe('ConnectAgent', () => {
  it('explains the conversation, workspace and automation paths on the landing page', () => {
    render(<ConnectAgent standalone />);
    expect(
      screen.getByRole('heading', { name: 'Power your captions with AI and automation.' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'From a conversation' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'From your workspace' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'From an automation' })).toBeTruthy();
  });

  it('exposes an accessible client board and changes commands', () => {
    render(<ConnectAgent />);
    expect(screen.getByRole('radio', { name: 'Claude Code' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Codex' }));
    expect(screen.getByRole('radio', { name: 'Codex' }).getAttribute('aria-checked')).toBe('true');
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
    fireEvent.click(screen.getByRole('radio', { name: 'Cursor' }));
    expect(screen.getByRole('link', { name: /Add to Cursor/ }).getAttribute('href')).toContain('cursor.com/link/mcp/install');
    fireEvent.click(screen.getByRole('radio', { name: 'VS Code' }));
    expect(screen.getByRole('link', { name: /Add to VS Code/ }).getAttribute('href')).toContain('vscode:mcp/install');
  });

  it('synchronizes the hero and guide client choice', () => {
    render(<><HeroConnect /><ConnectAgent /></>);
    const codexChoices = screen.getAllByRole('radio', { name: 'Codex' });
    fireEvent.click(codexChoices[0]!);
    expect(codexChoices.every((choice) => choice.getAttribute('aria-checked') === 'true')).toBe(true);
  });
});
