import { describe, expect, it } from 'vitest';
import { widgetHtmlForPreview } from '../mcp/ui';

const project = {
  id: 'project_test',
  title: 'Test clip',
  version: 1,
  style: { preset: 'minimal' },
  pages: [
    { id: 'page_1', text: 'First caption' },
    { id: 'page_2', text: 'Second caption' },
  ],
  transcript: {
    words: [{ id: 'word_1', text: 'First', startMs: 0, endMs: 300 }],
  },
  source: { playbackUrl: 'https://example.com/video.mp4' },
};

describe('ChatGPT widget UI', () => {
  it('keeps app identity in the host and exposes an accessible live status', () => {
    const html = widgetHtmlForPreview('editor', 'https://clipsubtitles.com', { project });
    expect(html).not.toContain('class="brand"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("setAttribute('aria-label','Video with the current caption')");
  });

  it('uses task-first caption navigation and one-word correction', () => {
    const html = widgetHtmlForPreview('editor', 'https://clipsubtitles.com', { project });
    expect(html).toContain('Caption 1 of ');
    expect(html).toContain('Save correction');
    expect(html).toContain('All captions');
    expect(html).toContain('Open fullscreen');
  });

  it('compares styles with bounded real-motion previews', () => {
    const html = widgetHtmlForPreview('styles', 'https://clipsubtitles.com', {
      project,
      presets: [{ preset: 'minimal' }, { preset: 'clean' }],
    });
    expect(html).not.toContain('linear-gradient');
    expect(html).not.toContain('radial-gradient');
    expect(html).toContain('Preview on my video');
    expect(html).toContain("document.createElement('video')");
    expect(html).toContain("media.preload=active?'metadata':'none'");
    expect(html).toContain('/marketing/style-previews/ui-');
    expect(html).toContain("document.getElementById('preview-style').onclick");
    expect(html).toContain('.styles{grid-auto-columns:82%;gap:14px');
    expect(html).toContain('.style{min-width:0;width:100%;scroll-snap-stop:always}');
  });
});
