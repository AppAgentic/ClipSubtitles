import { SeoIntentPage } from '@/components/marketing/SeoIntentPage';
import { SEO_PAGES, metadataFor } from '@/components/marketing/seo-pages';

const page = SEO_PAGES.automaticCaptions;
export const metadata = metadataFor(page);

export default function AutomaticVideoCaptionsPage() {
  return <SeoIntentPage page={page} />;
}

