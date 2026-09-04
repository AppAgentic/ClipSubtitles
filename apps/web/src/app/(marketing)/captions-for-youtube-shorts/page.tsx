import { SeoIntentPage } from '@/components/marketing/SeoIntentPage';
import { SEO_PAGES, metadataFor } from '@/components/marketing/seo-pages';

const page = SEO_PAGES.shortsCaptions;
export const metadata = metadataFor(page);

export default function CaptionsForYouTubeShortsPage() {
  return <SeoIntentPage page={page} />;
}
