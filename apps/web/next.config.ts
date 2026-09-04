import type { NextConfig } from 'next';

// The web app is a pure consumer of the API. Same-origin rewrites keep cookies,
// signed asset URLs, and the MCP endpoint on one origin locally without CORS.
const apiOrigin = process.env.API_INTERNAL_URL ?? process.env.API_PUBLIC_URL ?? 'http://localhost:3101';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Local reviews are exposed through Tailscale Serve. Next blocks its dev
  // client bundle when the page origin differs from the loopback upstream,
  // which leaves the rendered controls visible but inert.
  allowedDevOrigins: ['*.tailf5ca79.ts.net'],
  transpilePackages: ['@clipsubtitles/contracts', '@clipsubtitles/core'],
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: '/v1/:path*', destination: `${apiOrigin}/v1/:path*` },
      { source: '/auth/:path*', destination: `${apiOrigin}/auth/:path*` },
      { source: '/api/mcp', destination: `${apiOrigin}/api/mcp` },
      // Local-only helpers (fixtures, dev tokens, dev OAuth). The API only serves them in mock mode.
      { source: '/dev/:path*', destination: `${apiOrigin}/dev/:path*` },
      { source: '/api/mcp/:path*', destination: `${apiOrigin}/api/mcp/:path*` },
      { source: '/.well-known/:path*', destination: `${apiOrigin}/.well-known/:path*` },
      { source: '/openapi.json', destination: `${apiOrigin}/openapi.json` },
      { source: '/llms.txt', destination: `${apiOrigin}/llms.txt` },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
