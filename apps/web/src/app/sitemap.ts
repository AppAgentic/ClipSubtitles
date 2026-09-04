import type { MetadataRoute } from 'next';
import { SEO_PAGES, SITE_URL } from '@/components/marketing/seo-pages';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    '/',
    ...Object.values(SEO_PAGES).map((page) => `/${page.slug}`),
    '/pricing',
    '/developers',
    '/help',
  ];

  return routes.map((route) => ({
    url: new URL(route, SITE_URL).toString(),
    changeFrequency: 'weekly',
    priority: route === '/' ? 1 : route === '/pricing' ? 0.7 : 0.8,
  }));
}
