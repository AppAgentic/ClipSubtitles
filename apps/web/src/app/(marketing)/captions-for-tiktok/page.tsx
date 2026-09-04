import { SeoIntentPage } from '@/components/marketing/SeoIntentPage';
import { SEO_PAGES, metadataFor } from '@/components/marketing/seo-pages';

const page = SEO_PAGES.tiktokCaptions;
export const metadata = metadataFor(page);

export default function CaptionsForTikTokPage() {
  return <SeoIntentPage page={page} />;
}
