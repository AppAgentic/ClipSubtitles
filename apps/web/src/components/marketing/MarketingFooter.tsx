import Link from 'next/link';
import { ClipSubtitlesWordmark } from '@/components/brand/ClipSubtitlesWordmark';

const COLUMNS = [
  [
    'Product',
    [
      ['Start captioning', '/sign-in?returnTo=/app/new'],
      ['Pricing', '/pricing'],
      ['Automatic captions', '/automatic-video-captions'],
      ['Animated captions', '/animated-video-captions'],
    ],
  ],
  [
    'Workflows',
    [
      ['Add captions to video', '/add-captions-to-video'],
      ['TikTok captions', '/captions-for-tiktok'],
      ['Instagram Reels captions', '/captions-for-instagram-reels'],
      ['YouTube Shorts captions', '/captions-for-youtube-shorts'],
      ['Transparent overlays', '/transparent-caption-overlay'],
      ['For AI agents', '/video-caption-api'],
    ],
  ],
  [
    'Developers',
    [
      ['Developer guide', '/developers'],
      ['API and MCP', '/developers#connect'],
      ['Help', '/help'],
    ],
  ],
  [
    'Company',
    [
      ['Privacy', '/privacy'],
      ['Terms', '/terms'],
      ['Contact', 'mailto:hello@clipsubtitles.com'],
    ],
  ],
] as const;

export function MarketingFooter() {
  return (
    <footer className="tg-footer lo-wrap">
      <div className="tg-footer-brand">
        <Link href="/">
          <ClipSubtitlesWordmark />
        </Link>
        <p>Accurate, styled captions for creators, teams, and AI workflows.</p>
      </div>
      <div className="tg-footer-columns">
        {COLUMNS.map(([title, links]) => (
          <div key={title}>
            <h2>{title}</h2>
            <ul>
              {links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="tg-footer-legal">
        © {new Date().getFullYear()} ClipSubtitles. Built for clear words and fast publishing.
      </p>
    </footer>
  );
}
