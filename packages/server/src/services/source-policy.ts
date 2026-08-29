import { isIP } from 'node:net';
import { LIMITS, SUPPORTED_SOURCE_EXTENSIONS } from '@clipsubtitles/contracts';
import { ApiError } from '../errors';

/** RFC1918/loopback/link-local/metadata ranges that remote imports must never reach. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const parts = ip.split('.').map(Number);
    const [a = 0, b = 0] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice('::ffff:'.length));
    return false;
  }
  return true;
}

export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h === 'metadata.google.internal') return true;
  if (isIP(h.replace(/^\[|\]$/g, ''))) return isPrivateAddress(h.replace(/^\[|\]$/g, ''));
  return false;
}

/**
 * Policy for caller-provided remote source URLs: http(s) only, bounded length,
 * no credentials in the URL, no private hosts unless explicitly allowed for
 * local development. DNS-resolved addresses are re-checked at fetch time.
 */
export function validateSourceUrl(raw: string, opts: { allowPrivate: boolean }): URL {
  if (raw.length > LIMITS.maxSourceUrlChars) throw new ApiError('SOURCE_URL_REJECTED', 'The source URL is too long.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError('SOURCE_URL_REJECTED', 'The source URL is not valid.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ApiError('SOURCE_URL_REJECTED', 'Only http(s) URLs are accepted.');
  if (url.username || url.password) throw new ApiError('SOURCE_URL_REJECTED', 'Credentials in URLs are not accepted.');
  if (!opts.allowPrivate && isPrivateHostname(url.hostname)) {
    throw new ApiError('SOURCE_URL_REJECTED', 'Private or local hosts are not accepted.');
  }
  return url;
}

export function guessFileName(url: URL, fallback = 'source.mp4'): string {
  const last = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const clean = last.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  if (!clean) return fallback;
  const ext = clean.includes('.') ? `.${clean.split('.').pop()?.toLowerCase()}` : '';
  return (SUPPORTED_SOURCE_EXTENSIONS as readonly string[]).includes(ext) ? clean : `${clean}.mp4`;
}

export function sanitizeFileName(name: string | undefined, fallback = 'source.mp4'): string {
  if (!name) return fallback;
  const clean = name.replace(/[/\\]/g, '_').replace(/[^\p{L}\p{N}._ -]/gu, '_').trim().slice(0, 120);
  return clean || fallback;
}
