import { SeoIntentPage } from '@/components/marketing/SeoIntentPage';
import { SEO_PAGES, metadataFor } from '@/components/marketing/seo-pages';

const page = SEO_PAGES.animatedCaptions;
export const metadata = metadataFor(page);

export default function AnimatedVideoCaptionsPage() {
  return <SeoIntentPage page={page} />;
}

