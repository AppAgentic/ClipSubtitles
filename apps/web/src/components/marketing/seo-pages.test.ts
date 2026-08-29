import { describe, expect, it } from 'vitest';
import { SEO_PAGES, metadataFor } from './seo-pages';

describe('SEO intent pages', () => {
  const pages = Object.values(SEO_PAGES);

  it('uses a unique route, title, description and headline for each intent', () => {
    for (const field of ['slug', 'title', 'description', 'headline'] as const) {
      expect(new Set(pages.map((page) => page[field])).size).toBe(pages.length);
    }
  });

  it('keeps every page useful beyond a keyword-matched hero', () => {
    for (const page of pages) {
      expect(page.steps).toHaveLength(3);
      expect(page.benefits).toHaveLength(3);
      expect(page.faqs.length).toBeGreaterThanOrEqual(3);
      expect(page.lede.length).toBeGreaterThan(80);
    }
  });

  it('publishes a canonical, indexable metadata contract', () => {
    for (const page of pages) {
      const metadata = metadataFor(page);
      expect(metadata.alternates).toEqual({ canonical: `/${page.slug}` });
      expect(metadata.robots).toEqual({ index: true, follow: true });
    }
  });
});
