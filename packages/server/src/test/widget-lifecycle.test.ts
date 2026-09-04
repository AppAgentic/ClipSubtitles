import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { WIDGET_BRIDGE } from '../mcp/widget-bridge';
import { WIDGET_PROGRESS } from '../mcp/widget-progress';

function harness(initial?: object, responses: unknown[] = []) {
  const elements = new Map<string, ReturnType<typeof element>>();
  function element() {
    return {
      innerHTML: '',
      textContent: '',
      style: {},
      dataset: {},
      disabled: false,
      onclick: undefined as undefined | (() => Promise<void>),
      children: [] as unknown[],
      appendChild(child: unknown) {
        this.children.push(child);
      },
      setAttribute() {},
      addEventListener() {},
    };
  }
  const node = (id: string) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id)!;
  };
  const listeners = new Map<string, (event: unknown) => void>();
  const timers = new Map<number, () => Promise<void> | void>();
  const posts: { id: number; method: string }[] = [];
  const calls: string[] = [];
  const errors: string[] = [];
  let nextTimer = 1;
  const openai = {
    toolOutput: initial,
    callTool: async (name: string) => {
      calls.push(name);
      const result = responses.shift();
      if (result instanceof Error) throw result;
      return result;
    },
  };
  const parent = {
    postMessage(message: { id: number; method: string }) {
      posts.push(message);
    },
  };
  const window = {
    parent,
    openai: initial ? openai : undefined,
    addEventListener(name: string, listener: (event: unknown) => void) {
      listeners.set(name, listener);
    },
  };
  const context = vm.createContext({
    window,
    document: {
      getElementById: node,
      createElement: element,
      documentElement: { dataset: {}, style: {}, scrollHeight: 100 },
    },
    setTimeout(fn: () => Promise<void> | void) {
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
    requestAnimationFrame(fn: () => void) {
      fn();
    },
    captureError(error: Error) {
      errors.push(error.message);
    },
  });
  vm.runInContext(
    `const WEB='https://example.com';const content=document.getElementById('content');const state=document.getElementById('state');
    function esc(s){return String(s||'')} function humanize(s){return s||''} function openExternal(){} function mediaUrl(s){return s+'?stream=1'}
    function setStatus(s){state.textContent=s} function showError(e){captureError(e)}
    ${WIDGET_BRIDGE}\n${WIDGET_PROGRESS}
    function render(data){output=data;renderProgress()} initializeBridge();`,
    context,
  );
  return {
    node,
    window,
    listeners,
    timers,
    posts,
    calls,
    errors,
    context,
    async tick() {
      const entry = timers.entries().next().value;
      if (entry) {
        timers.delete(entry[0]);
        await entry[1]();
      }
    },
    message(message: object) {
      listeners.get('message')!({ source: parent, data: { jsonrpc: '2.0', ...message } });
    },
  };
}
const task = {
  id: 'task_test',
  kind: 'render_preview',
  status: 'running',
  progress: 25,
  projectId: 'project_test',
};

describe('widget host lifecycle and task recovery', () => {
  it('retains loading before output, accepts delayed OpenAI globals, and does not invent failure', () => {
    const h = harness();
    expect(h.node('content').innerHTML).toBe('');
    h.listeners.get('openai:set_globals')!({ detail: { globals: { toolOutput: { task } } } });
    expect(h.node('content').innerHTML).toContain('Rendering your free preview');
    expect(h.node('content').innerHTML).not.toContain('did not finish');
  });
  it('initializes standard MCP Apps before consuming tool notifications and ignores other windows', async () => {
    const h = harness();
    expect(h.posts[0]!.method).toBe('ui/initialize');
    h.message({
      id: h.posts[0]!.id,
      result: { hostContext: { displayMode: 'fullscreen', theme: 'dark' } },
    });
    await Promise.resolve();
    expect(h.posts.some((p) => p.method === 'ui/notifications/initialized')).toBe(true);
    h.listeners.get('message')!({
      source: {},
      data: {
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-result',
        params: { structuredContent: { task } },
      },
    });
    expect(h.node('content').innerHTML).toBe('');
    h.message({ method: 'ui/notifications/tool-result', params: { structuredContent: { task } } });
    expect(h.node('content').innerHTML).toContain('Rendering your free preview');
  });
  it('normalizes public MCP errors and retries polling without marking the task failed', async () => {
    const h = harness({ task }, [
      {
        isError: true,
        content: [
          { type: 'text', text: JSON.stringify({ error: { message: 'Temporary issue' } }) },
        ],
      },
      { structuredContent: { task: { ...task, status: 'succeeded' }, exports: [] } },
    ]);
    await h.tick();
    expect(h.node('state').textContent).toBe('Reconnecting');
    expect(h.timers.size).toBe(1);
    expect(h.node('content').innerHTML).not.toContain('could not finish');
    await h.tick();
    expect(h.node('content').innerHTML).toContain('Your free preview is ready');
    expect(h.timers.size).toBe(0);
  });
  it('bounds automatic retries, allows manual recovery, and exposes actual cancellation errors', async () => {
    const h = harness({ task }, [
      ...Array.from({ length: 6 }, () => new Error('Offline')),
      { structuredContent: { task: { ...task, status: 'succeeded' } } },
    ]);
    for (let i = 0; i < 6; i++) await h.tick();
    expect(h.timers.size).toBe(0);
    expect(h.node('progress-note').textContent).toContain('Automatic refresh paused');
    await h.node('refresh-progress').onclick!();
    expect(h.node('content').innerHTML).toContain('Your free preview is ready');
    expect(h.timers.size).toBe(0);
    const cancel = harness({ task }, [
      {
        isError: true,
        content: [{ type: 'text', text: '{"error":{"message":"Cannot cancel this task"}}' }],
      },
    ]);
    await cancel.node('cancel').onclick!();
    expect(cancel.errors).toEqual(['Cannot cancel this task']);
    expect(cancel.timers.size).toBe(1);
  });
  it('ignores an obsolete in-flight poll after the host supplies a newer task state', async () => {
    let complete: (result: unknown) => void = () => {};
    const deferred = new Promise((resolve) => {
      complete = resolve;
    });
    const h = harness({ task }, [deferred]);
    const poll = h.tick();
    h.message({
      method: 'ui/notifications/tool-result',
      params: { structuredContent: { task: { ...task, status: 'succeeded' } } },
    });
    complete({ structuredContent: { task } });
    await poll;
    expect(h.node('content').innerHTML).toContain('Your free preview is ready');
    expect(h.timers.size).toBe(0);
  });
  it('renders transcription completion as review, not a finished video', () => {
    const h = harness({ task: { ...task, kind: 'generate_captions', status: 'succeeded' } });
    expect(h.node('content').innerHTML).toContain('Your captions are ready');
    expect(h.node('content').innerHTML).toContain('Review captions');
    expect(h.node('content').innerHTML).not.toContain('video is ready');
  });
  it('stops polling on teardown and does not request cancellation for upload verification', () => {
    const h = harness({ task: { ...task, kind: 'finalize_upload' } });
    expect(h.node('content').innerHTML).not.toContain('Cancel task');
    h.message({ id: 42, method: 'ui/resource-teardown' });
    expect(h.timers.size).toBe(0);
  });
  it('renders a playable completed MP4 using the media proxy helper', () => {
    const h = harness({
      task: { ...task, status: 'succeeded' },
      exports: [{ kind: 'mp4', fileName: 'test.mp4', downloadUrl: 'https://example.com/video' }],
    });
    expect(h.node('result-video').children).toHaveLength(1);
    expect(h.node('result-video').children[0]).toMatchObject({
      src: 'https://example.com/video?stream=1',
      controls: true,
    });
  });
});
