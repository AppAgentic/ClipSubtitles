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
  const callTool = vi.fn(), preparePrivateUpload = vi.fn(), fetch = vi.fn(), render = vi.fn(), followUp = vi.fn(), openExternal = vi.fn();
  const sandbox = {
    content, output, WEB: 'https://clipsubtitles.com', API: 'https://api.clipsubtitles.com', URL, Date, AbortController, crypto: { randomUUID: () => 'upload-1' }, window: { openai: host },
    document: { getElementById: (id: string) => elements.get(id) },
    callTool, preparePrivateUpload, fetch, render, followUp, openExternal, showError: vi.fn(), setStatus: vi.fn(),
    esc: String, humanize: String, duration: String, setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(),
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(WIDGET_START_APPROVAL, ctx);
  return { ...sandbox, elements, run: (code: string) => vm.runInContext(code, ctx), html: () => html };
}
const quote = () => ({ id: 'quote_1', projectId: 'proj_1', status: 'open', creditCost: 12, expiresAt: new Date(Date.now() + 60000).toISOString(), settings: { outputs: ['mp4'], resolution: '1080p' } });

describe('widget start and export approval', () => {
  it('offers native and web upload when host file APIs are missing', async () => {
    const h = harness(); h.run('renderStart()');
    expect(h.elements.has('choose')).toBe(true);
    expect(h.elements.has('library')).toBe(false);
    await h.elements.get('web-upload')!.onclick!();
    expect(h.openExternal).toHaveBeenCalledWith('https://clipsubtitles.com/app/new');
    expect(h.callTool).not.toHaveBeenCalled();
  });
  const nativeFile = { name: 'Holiday.video.mp4', type: 'video/mp4', size: 1000 };
  const upload = () => ({ data: { project: { id: 'proj_1' } }, target: { projectId: 'proj_1', url: 'https://api.clipsubtitles.com/v1/uploads/private-token?signature=private', method: 'PUT', maxBytes: 31457280, expiresAt: new Date(Date.now() + 60000).toISOString() } });
  it('uploads video directly without the host helper, then starts captions', async () => {
    const uploadFile = vi.fn(); const h = harness({}, { uploadFile });
    h.preparePrivateUpload.mockResolvedValue(upload()); h.fetch.mockResolvedValue({ ok: true });
    h.callTool.mockResolvedValue({ task: { id: 'task_1' } }); h.run('renderStart()');
    await h.run(`uploadNativeVideo(${JSON.stringify(nativeFile)})`);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(h.preparePrivateUpload.mock.calls[0]?.[0].title).toBe('Holiday.video');
    expect(h.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'PUT', credentials: 'omit', redirect: 'error', body: nativeFile }));
    expect(h.callTool).toHaveBeenCalledWith('generate_captions', { projectId: 'proj_1', idempotencyKey: 'widget-upload:upload-1:captions' });
    expect(h.render).toHaveBeenCalledWith({ task: { id: 'task_1', projectId: 'proj_1', kind: 'generate_captions' } });
    expect(h.followUp).not.toHaveBeenCalled();
  });
  it('rejects oversized files before creating a project', async () => {
    const h = harness(); h.run('renderStart()');
    await expect(h.run(`uploadNativeVideo(${JSON.stringify({ ...nativeFile, size: 31457281 })})`)).rejects.toThrow('30 MB');
    expect(h.preparePrivateUpload).not.toHaveBeenCalled();
  });
  it('retains the project for retry and does not expose a failing signed URL', async () => {
    const h = harness(); h.run('renderStart()'); h.preparePrivateUpload.mockResolvedValue(upload());
    h.fetch.mockRejectedValue(new Error('failed https://api.clipsubtitles.com/v1/uploads/private-token?signature=private'));
    await expect(h.run(`uploadNativeVideo(${JSON.stringify(nativeFile)})`)).rejects.toThrow('interrupted');
    h.fetch.mockResolvedValue({ ok: true }); h.callTool.mockResolvedValue({ task: { id: 'task_1' } });
    await h.run(`uploadNativeVideo(${JSON.stringify(nativeFile)})`);
    expect(h.preparePrivateUpload.mock.calls[1]?.[0].projectId).toBe('proj_1');
  });
  it('prepares a new project if a different file is chosen after an interrupted upload', async () => {
    const h = harness(); h.run('renderStart()'); h.preparePrivateUpload.mockResolvedValue(upload());
    h.fetch.mockRejectedValueOnce(new Error('response lost')).mockResolvedValue({ ok: true });
    await expect(h.run(`uploadNativeVideo(${JSON.stringify(nativeFile)})`)).rejects.toThrow('interrupted');
    h.callTool.mockResolvedValue({ task: { id: 'task_1' } });
    await h.run(`uploadNativeVideo(${JSON.stringify({ ...nativeFile, name: 'Different.mp4' })})`);
    expect(h.preparePrivateUpload.mock.calls[1]?.[0].projectId).toBeUndefined();
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });
  it('rejects missing or cross-origin private targets and offers this project on the web', async () => {
    const h = harness(); h.run('renderStart()'); h.preparePrivateUpload.mockResolvedValue({ ...upload(), target: undefined });
    await expect(h.run(`uploadNativeVideo(${JSON.stringify(nativeFile)})`)).rejects.toThrow('secure upload connection');
    await h.elements.get('web-upload')!.onclick!();
    expect(h.openExternal).toHaveBeenCalledWith('https://clipsubtitles.com/studio/proj_1/upload');
    h.preparePrivateUpload.mockResolvedValue({ ...upload(), target: { ...upload().target, url: 'https://elsewhere.test/v1/uploads/private-token' } });
    await expect(h.run(`uploadNativeVideo(${JSON.stringify(nativeFile)})`)).rejects.toThrow('unavailable');
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it('resumes captions after a successful upload response was lost', async () => {
    const h = harness(); h.run('renderStart()');
    h.preparePrivateUpload.mockResolvedValue({ data: { status: 'already_uploaded', project: { id: 'proj_1' } } });
    h.callTool.mockResolvedValue({ task: { id: 'task_1' } });
    await h.run(`uploadNativeVideo(${JSON.stringify(nativeFile)})`);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.callTool).toHaveBeenCalledWith('generate_captions', expect.objectContaining({ projectId: 'proj_1' }));
  });
  it('retries caption generation without uploading the video again', async () => {
    const h = harness(); h.run('renderStart()'); h.preparePrivateUpload.mockResolvedValue(upload());
    h.fetch.mockResolvedValue({ ok: true }); h.callTool.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValue({ task: { id: 'task_1' } });
    await expect(h.run(`uploadNativeVideo(${JSON.stringify(nativeFile)})`)).rejects.toThrow('temporary failure');
    await h.elements.get('choose')!.onclick!();
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.callTool).toHaveBeenCalledTimes(2);
    expect(h.callTool.mock.calls[0]).toEqual(h.callTool.mock.calls[1]);
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
  it('shows insufficient existing credits without purchase links or automatic export retries', async () => {
    const h = harness({ status: 'insufficient_credits', quote: quote(), creditAvailability: { balance: 1, required: 12, shortfall: 11 } });
    h.run('renderApproval()');
    expect(h.html()).toContain('No credits were reserved or charged');
    expect(h.html()).toContain('Available: 1. Shortfall: 11.');
    expect(h.html()).not.toMatch(/pricing|checkout|add-credits|View credit options|href=/i);
    expect(h.elements.has('approve')).toBe(false);
    expect(h.callTool).not.toHaveBeenCalled();
    await h.elements.get('change')!.onclick!();
    expect(h.followUp).toHaveBeenCalledWith(expect.stringContaining('create a new quote'));
    await h.elements.get('edit-project')!.onclick!();
    expect(h.callTool).toHaveBeenCalledExactlyOnceWith('open_caption_editor', { projectId: 'proj_1' });
    expect(h.openExternal).not.toHaveBeenCalled();
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
