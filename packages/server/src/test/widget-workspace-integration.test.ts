// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Script } from 'node:vm';
import {
  STYLE_PRESETS,
  segmentWords,
  segmentationForStyle,
  wordsFromText,
} from '@clipsubtitles/core';
import { CaptionPageSchema, TranscriptWordSchema } from '@clipsubtitles/contracts';
import { widgetHtmlForPreview } from '../mcp/ui';

function captionWords(wordCount: number) {
  return wordsFromText(Array.from({ length: wordCount }, (_, i) => `Word${i}`).join(' ')).map(
    (word, i) =>
      TranscriptWordSchema.strict().parse({ ...word, startMs: i * 1000, endMs: (i + 1) * 1000 }),
  );
}
function project(wordCount = 12, maxWordsPerPage = 1) {
  const words = captionWords(wordCount);
  const pages = segmentWords(words, {
    ...segmentationForStyle(STYLE_PRESETS.minimal),
    maxWordsPerPage,
    tailPaddingMs: 0,
  }).map((page) => CaptionPageSchema.strict().parse(page));
  return {
    id: 'project_test',
    title: 'Synthetic review',
    version: 1,
    style: STYLE_PRESETS.minimal,
    pages,
    transcript: {
      words: words.slice(0, 500),
      wordCount,
      wordsWindow: { offset: 0, limit: 500, total: wordCount },
    },
    source: { playbackUrl: 'https://clipsubtitles.com/v1/source/test' },
  };
}
type TestProject = ReturnType<typeof project>;
const frames: HTMLIFrameElement[] = [];
function mount(
  data: { project: TestProject },
  responses: unknown[] = [],
  globals: Record<string, unknown> = {},
) {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  frames.push(frame);
  const win = frame.contentWindow as Window &
    typeof globalThis & {
      openai: Record<string, unknown>;
      ClipSubtitlesOverlay: { attachCaptionOverlay: ReturnType<typeof vi.fn> };
    };
  const html = widgetHtmlForPreview('editor', 'https://clipsubtitles.com', data);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!);
  win.document.open();
  win.document.write(html.replace(/<script>[\s\S]*?<\/script>/g, ''));
  win.document.close();
  win.requestAnimationFrame = vi.fn(() => 1);
  const callTool = vi.fn(async () => {
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  });
  const requestMode = vi.fn(async ({ mode }: { mode: string }) => ({ mode }));
  const destroy = vi.fn();
  for (const script of scripts) {
    new Script(script);
    if (script.includes('const KIND=')) {
      Object.assign(win.openai, globals);
      win.openai.callTool = callTool;
      win.openai.requestDisplayMode = requestMode;
      win.ClipSubtitlesOverlay = {
        attachCaptionOverlay: vi.fn(() => ({ draw: vi.fn(), update: vi.fn(), destroy })),
      };
    }
    const scriptElement = win.document.createElement('script');
    scriptElement.textContent = script;
    win.document.body.appendChild(scriptElement);
  }
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    win.document.getElementById(id) as T;
  return { win, el, callTool, requestMode, destroy };
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
afterEach(async () => {
  // Let queued native details-toggle events finish before destroying their document.
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const frame of frames.splice(0)) {
    frame.contentWindow?.dispatchEvent(new Event('pagehide'));
    frame.remove();
  }
});

describe('assembled caption workspace', () => {
  it('updates host safe areas without remounting playback or losing an unsaved correction', () => {
    const h = mount({ project: project() }, [], {
      displayMode: 'fullscreen',
      safeArea: { insets: { top: 20, right: 8, bottom: 160, left: 8 } },
    });
    const style = h.win.document.documentElement.style;
    expect(style.getPropertyValue('--host-safe-bottom')).toBe('160px');
    h.el('words').querySelector('button')!.click();
    const input = h.el<HTMLInputElement>('word-input');
    input.value = 'Unsaved correction';
    input.focus();
    const video = h.el<HTMLVideoElement>('source-video');
    video.currentTime = 3;
    const notify = (globals: Record<string, unknown>) =>
      h.win.dispatchEvent(new h.win.CustomEvent('openai:set_globals', { detail: { globals } }));
    notify({ safeArea: { insets: { bottom: 240 } } });
    expect(style.getPropertyValue('--host-safe-bottom')).toBe('240px');
    notify({ toolOutput: h.win.openai.toolOutput, safeArea: { insets: { bottom: 280 } } });
    expect(style.getPropertyValue('--host-safe-bottom')).toBe('280px');
    h.win.dispatchEvent(
      new h.win.MessageEvent('message', {
        source: h.win.parent,
        data: {
          jsonrpc: '2.0',
          method: 'ui/notifications/host-context-changed',
          params: { safeAreaInsets: { bottom: 320, left: 12 } },
        },
      }),
    );
    expect(style.getPropertyValue('--host-safe-bottom')).toBe('320px');
    expect(style.getPropertyValue('--host-safe-left')).toBe('12px');
    expect(h.el<HTMLInputElement>('word-input')).toBe(input);
    expect(input.value).toBe('Unsaved correction');
    expect(h.win.document.activeElement).toBe(input);
    expect(h.el<HTMLVideoElement>('source-video')).toBe(video);
    expect(video.currentTime).toBe(3);
    expect(h.destroy).not.toHaveBeenCalled();
    expect(h.callTool).not.toHaveBeenCalled();
  });

  it('compiles the shipped scripts, immediately shows styles, and seeks through every caption', () => {
    const h = mount({ project: project() });
    expect(h.el('styles').querySelectorAll('button')).toHaveLength(
      Object.keys(STYLE_PRESETS).length,
    );
    expect(h.el('pages').querySelectorAll('button')).toHaveLength(12);
    h.el('next-page').click();
    expect(h.el('scene-count').textContent).toBe('Caption 2 of 12');
    expect(h.el<HTMLVideoElement>('source-video').currentTime).toBe(1);
    expect(h.el('words').textContent).toBe('Word1');
    (h.el('pages').querySelectorAll('button')[11] as HTMLButtonElement).click();
    expect(h.el('scene-count').textContent).toBe('Caption 12 of 12');
    expect(h.el<HTMLVideoElement>('source-video').currentTime).toBe(11);
    expect(h.el<HTMLVideoElement>('source-video').src).toContain('stream=1');
  });
  it('plays, pauses, seeks, and mutes through accessible controls while keeping source playback inline', async () => {
    const h = mount({ project: project() });
    const video = h.el<HTMLVideoElement>('source-video');
    let paused = true;
    Object.defineProperties(video, { paused: { get: () => paused }, duration: { value: 12 } });
    const play = vi.fn(async () => {
      paused = false;
      video.dispatchEvent(new h.win.Event('play'));
    });
    const pause = vi.fn(() => {
      paused = true;
      video.dispatchEvent(new h.win.Event('pause'));
    });
    video.play = play;
    video.pause = pause;
    video.dispatchEvent(new h.win.Event('loadedmetadata'));
    expect(video.controls).toBe(false);
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(h.el<HTMLInputElement>('video-seek').max).toBe('12');
    h.el('play-pause').click();
    await settle();
    expect(play).toHaveBeenCalledOnce();
    expect(h.el('play-pause').getAttribute('aria-label')).toBe('Pause video');
    h.el('play-pause').click();
    expect(pause).toHaveBeenCalledOnce();
    expect(h.el('play-pause').getAttribute('aria-label')).toBe('Play video');
    h.el<HTMLInputElement>('video-seek').value = '4.25';
    h.el('video-seek').dispatchEvent(new h.win.Event('input'));
    expect(video.currentTime).toBe(4.25);
    video.dispatchEvent(new h.win.Event('timeupdate'));
    expect(h.el('video-time').textContent).toBe('0:04 / 0:12');
    expect(h.el('scene-count').textContent).toBe('Caption 5 of 12');
    h.el('video-mute').click();
    expect(video.muted).toBe(true);
    expect(h.el('video-mute').getAttribute('aria-label')).toBe('Unmute video');
    expect(h.el('video-mute').getAttribute('aria-pressed')).toBe('true');
    h.el('video-mute').click();
    expect(video.muted).toBe(false);
    expect(h.el('video-mute').getAttribute('aria-pressed')).toBe('false');
    video.play = vi.fn(async () => {
      throw new Error('Browser playback blocked');
    });
    h.el('play-pause').click();
    await settle();
    expect(h.el('widget-error').textContent).toBe(
      'Video could not play. Reload the video to try again.',
    );
  });
  it('keeps native controls for a baked rendered preview', async () => {
    const h = mount({ project: project() }, [
      {
        structuredContent: {
          task: { id: 'task_preview', status: 'succeeded' },
          exports: [{ kind: 'preview', downloadUrl: 'https://clipsubtitles.com/v1/export/test' }],
        },
      },
    ]);
    h.el('free-preview').click();
    await settle();
    const preview = h.el('preview-result').querySelector('video')!;
    expect(preview.controls).toBe(true);
    expect(preview.playsInline).toBe(true);
    expect(preview.src).toContain('stream=1');
    expect(h.el<HTMLVideoElement>('source-video').controls).toBe(false);
  });
  it('uses the complete inclusive word range of a real multiword caption page', () => {
    const data = project(12, 3);
    const index = data.pages.findIndex((page) => page.endWordIndex > page.startWordIndex);
    expect(index).toBeGreaterThanOrEqual(0);
    const page = data.pages[index]!;
    const expected = data.transcript.words.slice(page.startWordIndex, page.endWordIndex + 1);
    const h = mount({ project: data });
    (h.el('pages').querySelectorAll('button')[index] as HTMLButtonElement).click();
    const buttons = [...h.el('words').querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent)).toEqual(expected.map((word) => word.text));
    buttons.at(-1)!.click();
    expect(h.el<HTMLInputElement>('word-input').value).toBe(expected.at(-1)!.text);
  });
  it('saves one word then rereads the authoritative word window before showing saved', async () => {
    const fresh = project();
    fresh.version = 2;
    fresh.transcript.words[4]!.text = 'Corrected';
    fresh.pages[4]!.text = 'Corrected';
    fresh.pages[4]!.lines[0]!.text = 'Corrected';
    const h = mount({ project: project() }, [
      { structuredContent: { project: { id: fresh.id, version: 2 } } },
      { structuredContent: { project: fresh } },
    ]);
    h.el<HTMLDetailsElement>('corrections').open = true;
    (h.el('pages').querySelectorAll('button')[4] as HTMLButtonElement).click();
    h.el<HTMLVideoElement>('source-video').currentTime = 4.25;
    h.el('words').querySelector('button')!.click();
    h.el<HTMLInputElement>('word-input').value = 'Corrected';
    h.el('edit').dispatchEvent(new h.win.Event('submit', { cancelable: true }));
    await settle();
    expect(h.callTool).toHaveBeenNthCalledWith(1, 'update_caption_project', {
      projectId: fresh.id,
      expectedVersion: 1,
      ops: [{ op: 'replace_word_text', wordId: fresh.transcript.words[4]!.id, text: 'Corrected' }],
    });
    expect(h.callTool).toHaveBeenNthCalledWith(2, 'get_caption_project', {
      projectId: fresh.id,
      pages: true,
      words: true,
      wordsOffset: 0,
      wordsLimit: 500,
    });
    expect(h.el<HTMLDetailsElement>('corrections').open).toBe(true);
    const restoredVideo = h.el<HTMLVideoElement>('source-video');
    Object.defineProperty(restoredVideo, 'duration', { value: 12 });
    restoredVideo.dispatchEvent(new h.win.Event('loadedmetadata'));
    restoredVideo.dispatchEvent(new h.win.Event('timeupdate'));
    expect(restoredVideo.currentTime).toBe(4.25);
    expect(h.el('scene-count').textContent).toBe('Caption 5 of 12');
    expect(h.el('pages').querySelector('[aria-current="true"]')?.textContent).toBe('5. Corrected');
    expect(h.el('words').textContent).toBe('Corrected');
    expect(h.el('save-status').textContent).toBe('Saved');
    h.el('next-page').click();
    expect(h.el('words').textContent).toBe('Word5');
    expect(h.el<HTMLDetailsElement>('corrections').open).toBe(true);
  });
  it('saves styles using normalized results and exposes a public failure without changing selection', async () => {
    const nextStyle = Object.values(STYLE_PRESETS).find((preset) => preset.preset !== 'minimal')!;
    const fresh = project();
    fresh.style = nextStyle;
    fresh.version = 2;
    const h = mount({ project: project() }, [
      { structuredContent: { project: { version: 2 } } },
      { structuredContent: { project: fresh } },
    ]);
    const button = [...h.el('styles').querySelectorAll('button')].find(
      (item) => item.getAttribute('aria-pressed') === 'false',
    )!;
    button.click();
    await settle();
    expect(h.callTool).toHaveBeenNthCalledWith(
      1,
      'update_caption_project',
      expect.objectContaining({
        expectedVersion: 1,
        ops: [{ op: 'set_preset', preset: nextStyle.preset }],
      }),
    );
    expect(
      h.el('styles').querySelector('[aria-pressed="true"]')?.textContent?.toLowerCase(),
    ).toContain(nextStyle.preset.replace(/[-_]/g, ' '));
    const failed = mount({ project: project() }, [
      {
        isError: true,
        content: [
          { type: 'text', text: '{"error":{"message":"Project changed; refresh and retry."}}' },
        ],
      },
      { structuredContent: { project: project() } },
    ]);
    [...failed.el('styles').querySelectorAll('button')]
      .find((item) => item.getAttribute('aria-pressed') === 'false')!
      .click();
    await settle();
    expect(failed.el('widget-error').textContent).toBe('Project changed; refresh and retry.');
    expect(
      failed.el('styles').querySelector('[aria-pressed="true"]')?.textContent?.toLowerCase(),
    ).toContain('minimal');
    expect(failed.el('save-status').textContent).not.toBe('Saving…');
  });
  it('does not replace a newly opened project with an older in-flight save result', async () => {
    let complete: (response: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      complete = resolve;
    });
    const oldProject = project();
    oldProject.version = 2;
    const h = mount({ project: project() }, [
      pending,
      { structuredContent: { project: oldProject } },
    ]);
    [...h.el('styles').querySelectorAll('button')]
      .find((item) => item.getAttribute('aria-pressed') === 'false')!
      .click();
    const newer = project();
    newer.id = 'project_other';
    newer.title = 'Newly opened project';
    h.win.dispatchEvent(
      new h.win.CustomEvent('openai:set_globals', {
        detail: { globals: { toolOutput: { project: newer } } },
      }),
    );
    complete({ structuredContent: { project: { id: oldProject.id, version: 2 } } });
    await settle();
    expect(h.win.document.querySelector('h1')?.textContent).toBe('Newly opened project');
  });
  it('lets a newly opened project save while the previous project request is pending', async () => {
    let complete: (response: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      complete = resolve;
    });
    const newer = project();
    newer.id = 'project_other';
    newer.title = 'New project';
    const saved = {
      ...newer,
      version: 2,
      style: Object.values(STYLE_PRESETS).find((preset) => preset.preset !== 'minimal')!,
    };
    const h = mount({ project: project() }, [
      pending,
      { structuredContent: { project: { id: newer.id, version: 2 } } },
      { structuredContent: { project: saved } },
    ]);
    const chooseStyle = () =>
      [...h.el('styles').querySelectorAll('button')]
        .find((item) => item.getAttribute('aria-pressed') === 'false')!
        .click();
    chooseStyle();
    h.win.dispatchEvent(
      new h.win.CustomEvent('openai:set_globals', {
        detail: { globals: { toolOutput: { project: newer } } },
      }),
    );
    chooseStyle();
    await settle();
    expect(h.callTool).toHaveBeenNthCalledWith(
      2,
      'update_caption_project',
      expect.objectContaining({ projectId: newer.id }),
    );
    expect(h.el('save-status').textContent).toBe('Saved');
    complete({ structuredContent: { project: { id: 'project_test', version: 2 } } });
    await settle();
    expect(h.win.document.querySelector('h1')?.textContent).toBe('New project');
    expect(h.el('styles').querySelectorAll('button:disabled')).toHaveLength(0);
  });
  it('toggles fullscreen both ways and disposes overlay on host teardown', async () => {
    const h = mount({ project: project() });
    h.el('fullscreen').click();
    await settle();
    expect(h.requestMode).toHaveBeenLastCalledWith({ mode: 'fullscreen' });
    expect(h.el('fullscreen').textContent).toBe('Exit fullscreen');
    h.el('fullscreen').click();
    await settle();
    expect(h.requestMode).toHaveBeenLastCalledWith({ mode: 'inline' });
    expect(h.el('fullscreen').textContent).toBe('Open fullscreen');
    h.win.dispatchEvent(
      new h.win.MessageEvent('message', {
        source: h.win.parent,
        data: { jsonrpc: '2.0', id: 99, method: 'ui/resource-teardown' },
      }),
    );
    expect(h.destroy).toHaveBeenCalled();
  });
  it('loads words beyond the first 500 and makes the last caption editable', async () => {
    const original = project(503);
    const all = captionWords(503).slice(500);
    const chunk = {
      ...original,
      transcript: {
        ...original.transcript,
        words: all,
        wordsWindow: { offset: 500, limit: 500, total: 503 },
      },
    };
    const h = mount({ project: original }, [{ structuredContent: { project: chunk } }]);
    await settle();
    expect(h.callTool).toHaveBeenCalledWith('get_caption_project', {
      projectId: original.id,
      pages: false,
      words: true,
      wordsOffset: 500,
      wordsLimit: 500,
    });
    expect(h.el('pages').querySelectorAll('button')).toHaveLength(503);
    (h.el('pages').querySelectorAll('button')[502] as HTMLButtonElement).click();
    expect(h.el('words').textContent).toBe('Word502');
    h.el('words').querySelector('button')!.click();
    expect(h.el<HTMLInputElement>('word-input').value).toBe('Word502');
  });
});
