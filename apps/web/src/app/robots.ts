import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/components/marketing/seo-pages';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/studio', '/sign-in'],
    },
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
  };
}
