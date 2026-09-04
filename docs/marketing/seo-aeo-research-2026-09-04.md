# ClipSubtitles SEO and answer-engine discovery research

Date: 2026-09-04

## Evidence and scope

ClipSubtitles is a new domain with no useful Search Console query history yet, so this wave uses live search-result intent and product truth rather than invented search-volume numbers. Exact volume and difficulty should be added once Search Console has impressions or a verified first-party keyword-planning export is available.

The current competitive pages repeatedly organise captioning intent around the same job: upload a video, automatically create subtitles, edit/style them, then export either a captioned video or subtitle file. The strongest pages also answer task-shaped questions and create distinct pages for automatic subtitles, dynamic captions, APIs and platform workflows.

Primary references:

- Google people-first content guidance: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google structured-data guidelines: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Google video structured data: https://developers.google.com/search/docs/appearance/structured-data/video
- Google sitemap guidance: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Bing IndexNow: https://www.bing.com/webmasters/help/indexnow-0z209wby
- VEED add-subtitles page: https://www.veed.io/tools/add-subtitles
- VEED automatic subtitles page: https://www.veed.io/tools/auto-subtitle-generator-online
- Kapwing subtitle generator: https://www.kapwing.com/subtitles
- ZapCap animated captions API: https://zapcap.ai/api/animated-captions/

## Intent map

| Priority | Query family | Search intent | ClipSubtitles page |
| --- | --- | --- | --- |
| 1 | AI video caption generator, add captions to video | Category / transactional | `/` and `/add-captions-to-video` |
| 1 | automatic video captions, auto subtitle generator | Transactional | `/automatic-video-captions` |
| 1 | animated video captions, dynamic captions | Transactional | `/animated-video-captions` |
| 1 | video caption API, subtitles API | Developer / commercial | `/video-caption-api` and `/developers` |
| 2 | captions for TikTok | Platform task | `/captions-for-tiktok` |
| 2 | captions for Instagram Reels | Platform task | `/captions-for-instagram-reels` |
| 2 | captions for YouTube Shorts | Platform task | `/captions-for-youtube-shorts` |
| 2 | transparent caption overlay, alpha caption video | Post-production | `/transparent-caption-overlay` |

## Answer-engine design

Each intent page starts with a concise, self-contained answer that can be quoted without surrounding marketing copy, then expands into a product-true three-step workflow, benefits and visible FAQs. JSON-LD identifies the page, product and FAQ entities. The homepage additionally identifies the organisation, website and the visible demonstration video. `llms.txt` lists canonical product guides, direct definitions, the agent endpoint and the safe workflow contract.

## Release and distribution follow-up

After this branch is approved and deployed:

1. Fetch every canonical URL, the sitemap, robots file, social image, video assets, `llms.txt` and the IndexNow key from production.
2. Validate the homepage video markup with Google's Rich Results Test.
3. Verify the URL-prefix property in Google Search Console, submit `/sitemap.xml`, and record the discovered-page count.
4. Submit the exact new canonical URLs through IndexNow using the public key file in this branch.
5. Use the first 28 days of Search Console impressions to choose the next pages; do not expand into thin keyword variants before that evidence exists.
