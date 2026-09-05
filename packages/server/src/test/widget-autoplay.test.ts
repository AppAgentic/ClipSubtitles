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
const frames: HTMLIFrameElement[] = [];
function mount(
  data: unknown,
  responses: unknown[] = [],
  globals: Record<string, unknown> = {},
  kind: Parameters<typeof widgetHtmlForPreview>[0] = 'editor',
) {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  frames.push(frame);
  const win = frame.contentWindow as Window &
    typeof globalThis & {
      openai: Record<string, unknown>;
      ClipSubtitlesOverlay: { attachCaptionOverlay: ReturnType<typeof vi.fn> };
    };
  const html = widgetHtmlForPreview(kind, 'https://clipsubtitles.com', data);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!);
  win.document.open();
  win.document.write(html.replace(/<script>[\s\S]*?<\/script>/g, ''));
  win.document.close();
  win.requestAnimationFrame = vi.fn(() => 1);
  const callTool = vi.fn(async (_name: string, _args: Record<string, unknown>) => {
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  });
  const requestMode = vi.fn(async ({ mode }: { mode: string }) => ({ mode }));
  const destroy = vi.fn();
  for (const script of scripts) {
    new Script(script);
    if (script.includes('const KIND=')) {
      win.matchMedia = vi.fn(() => ({
        matches: globals.reducedMotion === true,
      })) as unknown as typeof win.matchMedia;
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

function media(h: ReturnType<typeof mount>, blocked = false) {
  const video = h.el<HTMLVideoElement>('source-video');
  let paused = true;
  Object.defineProperties(video, { paused: { get: () => paused }, duration: { value: 12 } });
  const play = vi.fn(async () => {
    if (blocked) throw new Error('Autoplay denied');
    paused = false;
    video.dispatchEvent(new h.win.Event('play'));
  });
  video.play = play;
  video.pause = vi.fn(() => {
    paused = true;
    video.dispatchEvent(new h.win.Event('pause'));
  });
  const ready = () => {
    video.dispatchEvent(new h.win.Event('loadedmetadata'));
    video.dispatchEvent(new h.win.Event('canplay'));
  };
  return { video, play, ready };
}
describe('initial caption preview playback', () => {
  it('autoplays muted once when media is ready and leaves audio opt-in', async () => {
    const h = mount({ project: project() });
    const m = media(h);
    expect(m.video.muted).toBe(true);
    expect(m.video.playsInline).toBe(true);
    m.ready();
    await settle();
    expect(m.play).toHaveBeenCalledOnce();
    expect(h.el('play-pause').textContent).toBe('Pause');
    expect(h.el('video-mute').textContent).toBe('Unmute');
    h.el('play-pause').click();
    m.video.dispatchEvent(new h.win.Event('canplay'));
    expect(m.play).toHaveBeenCalledOnce();
    expect(m.video.paused).toBe(true);
  });
  it('autoplays when upload state names the project but has no prior playback choice', async () => {
    const h = mount({ project: project() }, [], { widgetState: { projectId: project().id } });
    const m = media(h);
    m.ready();
    await settle();
    expect(m.play).toHaveBeenCalledOnce();
    expect(m.video.muted).toBe(true);
  });
  it('falls back to Play when autoplay is blocked, without showing a load error', async () => {
    const h = mount({ project: project() });
    const m = media(h, true);
    m.ready();
    await settle();
    expect(h.el('play-pause').textContent).toBe('Play');
    expect(h.el('media-error').hidden).toBe(true);
    expect(h.el('widget-error')).toBeNull();
    m.video.dispatchEvent(new h.win.Event('canplay'));
    expect(m.play).toHaveBeenCalledOnce();
    m.video.play = vi.fn(async () => {});
    h.el('play-pause').click();
    await settle();
    expect(m.video.play).toHaveBeenCalledOnce();
  });
  it('honors reduced motion but keeps manual playback available', async () => {
    const h = mount({ project: project() }, [], { reducedMotion: true });
    const m = media(h);
    m.ready();
    expect(m.play).not.toHaveBeenCalled();
    h.el('play-pause').click();
    await settle();
    expect(m.play).toHaveBeenCalledOnce();
  });
  it('preserves explicit pause, unmute and seek through style saves, refresh and fullscreen', async () => {
    const fresh = { ...project(), version: 2, style: STYLE_PRESETS.clean };
    const h = mount({ project: project() }, [
      { structuredContent: { project: { id: fresh.id, version: 2 } } },
      { structuredContent: { project: fresh } },
      { structuredContent: { project: fresh } },
    ]);
    const first = media(h);
    first.ready();
    await settle();
    h.el('play-pause').click();
    h.el('video-mute').click();
    first.video.currentTime = 4.25;
    first.video.dispatchEvent(new h.win.Event('seeked'));
    h.el('styles').querySelector<HTMLButtonElement>('[aria-pressed="false"]')!.click();
    await settle();
    const second = media(h);
    second.ready();
    expect(second.video.currentTime).toBe(4.25);
    expect(second.video.muted).toBe(false);
    expect(second.play).not.toHaveBeenCalled();
    h.el('refresh-review').click();
    await settle();
    const third = media(h);
    third.ready();
    expect(third.video.currentTime).toBe(4.25);
    expect(third.video.muted).toBe(false);
    expect(third.play).not.toHaveBeenCalled();
    h.el('fullscreen').click();
    await settle();
    expect(h.el('source-video')).toBe(third.video);
    expect(third.play).not.toHaveBeenCalled();
  });
  it('resumes existing playback on refresh without resetting time or mute', async () => {
    const h = mount({ project: project() }, [{ structuredContent: { project: project() } }]);
    const first = media(h);
    first.ready();
    await settle();
    first.video.currentTime = 3;
    h.el('refresh-review').click();
    await settle();
    const second = media(h);
    second.ready();
    await settle();
    expect(second.play).toHaveBeenCalledOnce();
    expect(second.video.currentTime).toBe(3);
    expect(second.video.muted).toBe(true);
  });
});
