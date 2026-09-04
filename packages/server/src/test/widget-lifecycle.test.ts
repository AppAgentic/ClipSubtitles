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
  const listenerGroups = new Map<string, Set<(event: unknown) => void>>();
  const timers = new Map<number, () => Promise<void> | void>();
  const timerDelays = new Map<number, number>();
  const posts: { id: number; method: string }[] = [];
  const calls: string[] = [];
  const errors: string[] = [];
  const cssProperties = new Map<string, string>();
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
      if (!listenerGroups.has(name)) listenerGroups.set(name, new Set());
      listenerGroups.get(name)!.add(listener);
      listeners.set(name, (event) => {
        for (const handler of listenerGroups.get(name)!) handler(event);
      });
    },
    removeEventListener(name: string, listener: (event: unknown) => void) {
      listenerGroups.get(name)?.delete(listener);
    },
  };
  const context = vm.createContext({
    window,
    document: {
      getElementById: node,
      createElement: element,
      documentElement: {
        dataset: {},
        style: {
          setProperty(name: string, value: string) {
            cssProperties.set(name, value);
          },
        },
        scrollHeight: 100,
      },
    },
    setTimeout(fn: () => Promise<void> | void, delay = 0) {
      const id = nextTimer++;
      timers.set(id, fn);
      timerDelays.set(id, delay);
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
      timerDelays.delete(id);
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
    timerDelays,
    posts,
    calls,
    errors,
    context,
    cssProperties,
    listenerCount: (event: string) => listenerGroups.get(event)?.size ?? 0,
    async tick() {
      const entry = timers.entries().next().value;
      if (entry) {
        timers.delete(entry[0]);
        timerDelays.delete(entry[0]);
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
  it('keeps private upload metadata outside rendered tool output and widget state', async () => {
    const target = {
      projectId: 'proj_1',
      url: 'https://api.example.test/v1/uploads/private?signature=secret',
    };
    const response = {
      structuredContent: { project: { id: 'proj_1' }, upload: { maxBytes: 30 } },
      _meta: { uploadTarget: target },
    };
    const h = harness({ task }, [response]);
    const result = await vm.runInContext('preparePrivateUpload({})', h.context);
    expect(result.target).toEqual(target);
    expect(result.data).toEqual(response.structuredContent);
    h.message({ method: 'ui/notifications/tool-result', params: response });
    expect(vm.runInContext('output', h.context)).toEqual({ task });
    expect(JSON.stringify(vm.runInContext('getWidgetState()', h.context))).not.toContain(
      'signature',
    );
  });
  it.each(['mcp_tool_result', 'call_tool_result', 'direct'])(
    'waits for delayed matching %s upload metadata and cleans up its listener',
    async (shape) => {
      const data = { status: 'upload_required', project: { id: 'proj_1' }, upload: {} };
      const target = {
        projectId: 'proj_1',
        uploadId: 'upload_new',
        url: 'https://example.com/new',
      };
      const h = harness({ task }, [{ structuredContent: data }]);
      vm.runInContext('stopPolling()', h.context);
      let settled = false;
      const pending = vm
        .runInContext('preparePrivateUpload({})', h.context)
        .then((result: unknown) => {
          settled = true;
          return result;
        });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(settled).toBe(false);
      expect(h.listenerCount('openai:set_globals')).toBe(2);
      const metadata =
        shape === 'direct'
          ? { uploadTarget: target }
          : { [shape]: { structuredContent: data, _meta: { uploadTarget: target } } };
      await new Promise((resolve) => setTimeout(resolve, 1));
      Object.assign(h.window.openai!, { toolResponseMetadata: metadata });
      h.listeners.get('openai:set_globals')!({
        detail: { globals: { toolResponseMetadata: metadata } },
      });
      expect(await pending).toEqual({ data, target });
      expect(h.listenerCount('openai:set_globals')).toBe(1);
      expect(h.timers.size).toBe(0);
    },
  );
  it('rejects stale and wrong-project metadata until the two-second deadline', async () => {
    const data = { status: 'upload_required', project: { id: 'proj_1' }, upload: {} };
    const target = {
      projectId: 'proj_1',
      uploadId: 'old_upload',
      url: 'https://example.com/stale',
    };
    const h = harness({ task }, [{ structuredContent: data }]);
    vm.runInContext('stopPolling()', h.context);
    Object.assign(h.window.openai!, { toolResponseMetadata: { uploadTarget: target } });
    const pending = vm.runInContext('preparePrivateUpload({})', h.context);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    for (const metadata of [
      { uploadTarget: { ...target } },
      {
        uploadTarget: {
          ...target,
          uploadId: 'new',
          url: 'https://example.com/new',
          projectId: 'proj_other',
        },
      },
      {
        mcp_tool_result: {
          structuredContent: { project: { id: 'proj_other' } },
          _meta: { uploadTarget: { ...target, uploadId: 'new', url: 'https://example.com/new' } },
        },
      },
    ])
      h.listeners.get('openai:set_globals')!({
        detail: { globals: { toolResponseMetadata: metadata } },
      });
    expect([...h.timerDelays.values()]).toEqual([2000]);
    await h.tick();
    expect((await pending).target).toBeUndefined();
    expect(h.listenerCount('openai:set_globals')).toBe(1);
    expect(h.timers.size).toBe(0);
  });
  it('cleans up when upload metadata never arrives or the tool errors', async () => {
    const h = harness({ task }, [
      { structuredContent: { status: 'upload_required', project: { id: 'proj_1' }, upload: {} } },
    ]);
    vm.runInContext('stopPolling()', h.context);
    const pending = vm.runInContext('preparePrivateUpload({})', h.context);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await h.tick();
    expect((await pending).target).toBeUndefined();
    expect(h.listenerCount('openai:set_globals')).toBe(1);
    const failed = harness({ task }, [
      {
        isError: true,
        content: [{ type: 'text', text: '{"error":{"message":"Upload not allowed"}}' }],
      },
    ]);
    vm.runInContext('stopPolling()', failed.context);
    await expect(vm.runInContext('preparePrivateUpload({})', failed.context)).rejects.toThrow(
      'Upload not allowed',
    );
    expect(failed.listenerCount('openai:set_globals')).toBe(1);
    expect(failed.timers.size).toBe(0);
  });
  it('consumes MCP safe-area insets at initialization and preserves edges during partial updates', async () => {
    const h = harness();
    h.message({
      id: h.posts[0]!.id,
      result: { hostContext: { safeAreaInsets: { top: 20, right: 8, bottom: 180, left: 6 } } },
    });
    await Promise.resolve();
    expect(Object.fromEntries(h.cssProperties)).toEqual({
      '--host-safe-top': '20px',
      '--host-safe-right': '8px',
      '--host-safe-bottom': '180px',
      '--host-safe-left': '6px',
    });
    h.message({
      method: 'ui/notifications/host-context-changed',
      params: { safeAreaInsets: { bottom: 240 } },
    });
    expect(h.cssProperties.get('--host-safe-bottom')).toBe('240px');
    expect(h.cssProperties.get('--host-safe-top')).toBe('20px');
    h.message({ method: 'ui/notifications/host-context-changed', params: { theme: 'dark' } });
    expect(h.cssProperties.get('--host-safe-bottom')).toBe('240px');
  });
  it('normalizes OpenAI insets to finite bounded nonnegative pixel values', () => {
    const h = harness({ task });
    h.listeners.get('openai:set_globals')!({
      detail: {
        globals: { safeArea: { insets: { top: Infinity, right: -3, bottom: 100000, left: '25' } } },
      },
    });
    expect(Object.fromEntries(h.cssProperties)).toEqual({
      '--host-safe-top': '0px',
      '--host-safe-right': '0px',
      '--host-safe-bottom': '2048px',
      '--host-safe-left': '0px',
    });
    h.listeners.get('openai:set_globals')!({
      detail: { globals: { safeArea: { insets: { bottom: NaN } } } },
    });
    expect(h.cssProperties.get('--host-safe-bottom')).toBe('0px');
  });

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
