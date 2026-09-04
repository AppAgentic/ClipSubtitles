import { SeoIntentPage } from '@/components/marketing/SeoIntentPage';
import { SEO_PAGES, metadataFor } from '@/components/marketing/seo-pages';

const page = SEO_PAGES.reelsCaptions;
export const metadata = metadataFor(page);

export default function CaptionsForInstagramReelsPage() {
  return <SeoIntentPage page={page} />;
}
