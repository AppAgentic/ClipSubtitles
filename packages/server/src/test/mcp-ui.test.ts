import { describe, expect, it } from 'vitest';
import { widgetHtmlForPreview } from '../mcp/ui';

describe('ChatGPT widget document', () => {
  it('keeps app identity in the host and exposes an accessible live status', () => {
    const html = widgetHtmlForPreview('editor', 'https://clipsubtitles.com', {});
    expect(html).not.toContain('class="brand"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Video with current caption style"');
  });

  it('does not allow project text to terminate the preview bootstrap script', () => {
    const html = widgetHtmlForPreview('editor', 'https://clipsubtitles.com', {
      project: { title: '</script><script>alert("untrusted")</script>' },
    });
    expect(html).not.toContain('</script><script>alert(');
    expect(html).toContain('\\u003c/script>');
  });
});
