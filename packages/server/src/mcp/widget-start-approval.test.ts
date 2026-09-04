import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { WIDGET_START_APPROVAL } from './widget-start-approval';

type Element = { disabled: boolean; isConnected: boolean; textContent: string; onclick?: () => Promise<void> };
function harness(output: unknown = {}, host: unknown = {}) {
  const elements = new Map<string, Element>();
  let html = '';
  const content = {
    get innerHTML() { return html; },
    set innerHTML(value: string) {
      html = value;
      elements.forEach((el) => { el.isConnected = false; });
      elements.clear();
      for (const match of value.matchAll(/id="([^"]+)"/g)) elements.set(match[1]!, { disabled: false, isConnected: true, textContent: '' });
    },
  };
  const callTool = vi.fn(), render = vi.fn(), followUp = vi.fn(), openExternal = vi.fn();
  const sandbox = {
    content, output, WEB: 'https://clipsubtitles.com', URL, Date, window: { openai: host },
    document: { getElementById: (id: string) => elements.get(id) },
    callTool, render, followUp, openExternal, showError: vi.fn(), setStatus: vi.fn(),
    esc: String, humanize: String, duration: String, setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(),
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(WIDGET_START_APPROVAL, ctx);
  return { ...sandbox, elements, run: (code: string) => vm.runInContext(code, ctx), html: () => html };
}
const quote = () => ({ id: 'quote_1', projectId: 'proj_1', status: 'open', creditCost: 12, expiresAt: new Date(Date.now() + 60000).toISOString(), settings: { outputs: ['mp4'], resolution: '1080p' } });

describe('widget start and export approval', () => {
  it('offers the web upload path when host file APIs are missing', async () => {
    const h = harness(); h.run('renderStart()');
    expect(h.elements.has('choose')).toBe(false);
    expect(h.elements.has('library')).toBe(false);
    await h.elements.get('web-upload')!.onclick!();
    expect(h.openExternal).toHaveBeenCalledWith('https://clipsubtitles.com/app/new');
    expect(h.callTool).not.toHaveBeenCalled();
  });
  it.each([undefined, { ...quote(), expiresAt: 'invalid' }, { ...quote(), status: 'consumed' }, { ...quote(), expiresAt: new Date(0).toISOString() }])('never offers approval for an unavailable quote', (q) => {
    const h = harness({ quote: q }); h.run('renderApproval()');
    expect(h.elements.has('approve')).toBe(false);
    expect(h.elements.has('refresh-quote')).toBe(true);
    expect(h.callTool).not.toHaveBeenCalled();
  });
  it('requires a second explicit approval after obtaining a fresh quote', async () => {
    const q = { ...quote(), status: 'expired' };
    const h = harness({ quote: q }); h.callTool.mockResolvedValue({ status: 'quote_required', quote: quote() });
    h.run('renderApproval()'); await h.elements.get('refresh-quote')!.onclick!();
    expect(h.callTool).toHaveBeenCalledExactlyOnceWith('render_caption_export', { projectId: 'proj_1', settings: q.settings });
    expect(h.render).toHaveBeenCalledOnce();
  });
  it('renders checkout without implying payment or retrying the export automatically', async () => {
    const h = harness({ status: 'checkout_required', quote: quote(), checkout: { balance: 1, shortfall: 11, pricingUrl: 'https://elsewhere.test/pay' } });
    h.run('renderApproval()');
    await h.elements.get('add-credits')!.onclick!();
    expect(h.openExternal).toHaveBeenCalledWith('https://clipsubtitles.com/pricing');
    expect(h.callTool).not.toHaveBeenCalled();
  });
  it('guards double clicks and submits only the immutable quote and exact credit amount', async () => {
    const h = harness({ quote: quote() });
    let finish!: (value: unknown) => void;
    h.callTool.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    h.run('renderApproval()');
    const click = h.elements.get('approve')!.onclick!;
    const pending = click(); await click();
    expect(h.callTool).toHaveBeenCalledExactlyOnceWith('render_caption_export', { projectId: 'proj_1', approval: { quoteId: 'quote_1', approvedCreditCost: 12 }, idempotencyKey: 'widget:quote_1' });
    finish({ status: 'render_started', task: { id: 'task_1' } }); await pending;
    expect(h.render).toHaveBeenCalledWith({ status: 'render_started', task: { id: 'task_1' } });
  });
  it('uses normalized create results and removes the filename extension correctly', async () => {
    const h = harness({}, { getFileDownloadUrl: vi.fn().mockResolvedValue({ downloadUrl: 'https://files.example.test/file' }) });
    h.callTool.mockResolvedValue({ project: { id: 'proj_1' } });
    h.run('renderStart()'); await h.run("createFromFile({fileId:'file_1',fileName:'Holiday.video.mp4',mimeType:'video/mp4'})");
    expect(h.callTool.mock.calls[0]?.[1].title).toBe('Holiday.video');
    expect(h.followUp).toHaveBeenCalledWith(expect.stringContaining('proj_1'));
  });
});
