import type { MetadataRoute } from 'next';
import { SEO_PAGES, SITE_URL } from '@/components/marketing/seo-pages';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    '/ai-video-caption-generator',
    ...Object.values(SEO_PAGES).map((page) => `/${page.slug}`),
  ];

  return routes.map((route) => ({
    url: new URL(route, SITE_URL).toString(),
    changeFrequency: 'weekly',
    priority: route === '/ai-video-caption-generator' ? 1 : 0.8,
  }));
}

