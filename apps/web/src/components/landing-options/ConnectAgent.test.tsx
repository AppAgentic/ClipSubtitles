// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectAgent } from './ConnectAgent';
import { FIRST_AGENT_PROMPT, HeroConnect } from './HeroConnect';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('HeroConnect', () => {
  it('keeps the primary client commands and one-click links above the fold', () => {
    render(<HeroConnect />);
    expect(screen.getByRole('radio', { name: 'Claude' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/claude mcp add --transport http/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Full guide/ }).getAttribute('href')).toBe('#connect');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Claude' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'ChatGPT' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('link', { name: /Connect ChatGPT/ }).getAttribute('href')).toBe(
      '/app/connections',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Cursor' }));
    expect(screen.getByRole('link', { name: /Add to Cursor/ })).toBeTruthy();
  });

  it('gives users a copyable first MCP request', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<HeroConnect />);
    expect(screen.getByText(FIRST_AGENT_PROMPT)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    expect(writeText).toHaveBeenCalledWith(FIRST_AGENT_PROMPT);
    expect(await screen.findByText('First agent prompt copied.')).toBeTruthy();
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
    const { container } = render(<ConnectAgent />);
    expect(container.querySelectorAll('.tg-client-icon[aria-hidden="true"]')).toHaveLength(6);
    expect(screen.getByRole('radio', { name: 'Claude' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'ChatGPT' }));
    expect(screen.getByRole('radio', { name: 'ChatGPT' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('link', { name: /Connect ChatGPT/ }).getAttribute('href')).toBe(
      '/app/connections',
    );
    expect(screen.getByText('Choose ClipSubtitles in ChatGPT')).toBeTruthy();
    expect(screen.queryByText('https://api.clipsubtitles.com/api/mcp')).toBeNull();
  });

  it('copies the complete active setup and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ConnectAgent />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('claude mcp add --transport http'),
    );
    expect(await screen.findByText('Claude setup copied.')).toBeTruthy();
  });

  it('offers verified one-click install links for compatible editors', () => {
    render(<ConnectAgent />);
    fireEvent.click(screen.getByRole('radio', { name: 'Cursor' }));
    expect(screen.getByRole('link', { name: /Add to Cursor/ }).getAttribute('href')).toContain(
      'cursor.com/link/mcp/install',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'VS Code' }));
    expect(screen.getByRole('link', { name: /Add to VS Code/ }).getAttribute('href')).toContain(
      'vscode:mcp/install',
    );
  });

  it('synchronizes the hero and guide client choice', () => {
    render(
      <>
        <HeroConnect />
        <ConnectAgent />
      </>,
    );
    const chatGptChoices = screen.getAllByRole('radio', { name: 'ChatGPT' });
    fireEvent.click(chatGptChoices[0]!);
    expect(chatGptChoices.every((choice) => choice.getAttribute('aria-checked') === 'true')).toBe(
      true,
    );
  });
});
