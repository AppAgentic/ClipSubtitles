import { SeoIntentPage } from '@/components/marketing/SeoIntentPage';
import { SEO_PAGES, metadataFor } from '@/components/marketing/seo-pages';

const page = SEO_PAGES.addCaptions;
export const metadata = metadataFor(page);

export default function AddCaptionsToVideoPage() {
  return <SeoIntentPage page={page} />;
}

