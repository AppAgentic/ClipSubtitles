// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectAgent } from './ConnectAgent';
import { HeroConnect } from './HeroConnect';
import { mcpGuidedSetupPrompt } from './McpClientBoard';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('HeroConnect', () => {
  it('keeps the guided setup prompt above the fold', () => {
    render(<HeroConnect />);
    expect(screen.getByRole('radio', { name: 'Claude' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Copy setup prompt' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Full guide/ }).getAttribute('href')).toBe('#connect');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Claude' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'ChatGPT' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('copies one prompt that connects, verifies, and starts the caption workflow', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<HeroConnect />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy setup prompt' }));
    expect(writeText).toHaveBeenCalledWith(mcpGuidedSetupPrompt('claude'));
    expect(writeText.mock.calls[0]?.[0]).toContain('Do not claim it is connected');
    expect(writeText.mock.calls[0]?.[0]).toContain('continue automatically');
    expect(await screen.findByText('Claude setup prompt copied.')).toBeTruthy();
  });

  it('falls back to a temporary text selection when clipboard permission is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    render(<HeroConnect />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy setup prompt' }));
    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
    expect(await screen.findByText('Claude setup prompt copied.')).toBeTruthy();
  });

  it('uses agent-specific setup instructions inside the shared prompt', () => {
    const prompts = {
      claude: mcpGuidedSetupPrompt('claude'),
      chatgpt: mcpGuidedSetupPrompt('chatgpt'),
      codex: mcpGuidedSetupPrompt('codex'),
      gemini: mcpGuidedSetupPrompt('gemini'),
      other: mcpGuidedSetupPrompt('other'),
      cursor: mcpGuidedSetupPrompt('cursor'),
      vscode: mcpGuidedSetupPrompt('vscode'),
    };
    expect(prompts.chatgpt).toContain('ADD COMMAND: Add the remote MCP server');
    expect(prompts.chatgpt).toContain("ChatGPT Work's Plugins or Apps setup");
    expect(prompts.claude).toContain('claude mcp add --transport http clipsubtitles');
    expect(prompts.codex).toContain('codex mcp add clipsubtitles');
    expect(prompts.gemini).toContain('gemini mcp add clipsubtitles');
    expect(prompts.other).toContain('"mcpServers"');
    expect(prompts.cursor).toContain('~/.cursor/mcp.json');
    expect(prompts.vscode).toContain('code --add-mcp');
    Object.values(prompts).forEach((prompt) => {
      expect(prompt).toContain('https://api.clipsubtitles.com/api/mcp');
    });
  });

  it('changes the selected client', () => {
    render(<HeroConnect />);
    fireEvent.click(screen.getByRole('radio', { name: 'ChatGPT' }));
    expect(screen.getByRole('radio', { name: 'ChatGPT' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Codex' }));
    expect(screen.getByRole('radio', { name: 'Codex' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'MCP' }));
    expect(screen.getByRole('radio', { name: 'MCP' }).getAttribute('aria-checked')).toBe('true');
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
    expect(container.querySelectorAll('.tg-client-icon[aria-hidden="true"]')).toHaveLength(7);
    expect(screen.getByRole('radio', { name: 'Claude' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'ChatGPT' }));
    expect(screen.getAllByText('https://api.clipsubtitles.com/api/mcp')).toHaveLength(2);
    fireEvent.click(screen.getByRole('radio', { name: 'Codex' }));
    expect(screen.getByText(/codex mcp add clipsubtitles/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'MCP' }));
    expect(screen.getByRole('radio', { name: 'MCP' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/"mcpServers"/)).toBeTruthy();
    expect(screen.getByText('https://api.clipsubtitles.com/api/mcp')).toBeTruthy();
  });

  it('copies the complete guided setup and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ConnectAgent />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy setup prompt' }));
    expect(writeText).toHaveBeenCalledWith(mcpGuidedSetupPrompt('claude'));
    expect(await screen.findByText('Claude setup prompt copied.')).toBeTruthy();
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
    const mcpChoices = screen.getAllByRole('radio', { name: 'MCP' });
    fireEvent.click(mcpChoices[0]!);
    expect(mcpChoices.every((choice) => choice.getAttribute('aria-checked') === 'true')).toBe(true);
  });
});
