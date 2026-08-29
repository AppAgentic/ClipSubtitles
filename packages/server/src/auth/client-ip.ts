/**
 * Client address resolution that fails closed.
 *
 * Forwarding headers (X-Forwarded-For, X-Real-IP) are attacker-controlled
 * unless a proxy we trust wrote them. So: the socket address is the client
 * unless it belongs to an explicitly configured trusted proxy, in which case
 * the X-Forwarded-For chain is walked from the right, skipping trusted hops,
 * and the first untrusted address is the client. No socket address at all
 * (e.g. in-process test requests) resolves to a shared "unknown" bucket.
 */

export interface ClientAddressSource {
  socketAddress: string | null;
  forwardedFor: string | null;
  realIp: string | null;
}

export interface ProxyTrust {
  readonly entries: readonly string[];
  isTrusted(address: string): boolean;
}

interface ParsedIp {
  /** 128-bit value; IPv4 is mapped into ::ffff:0:0/96 so both families compare uniformly. */
  value: bigint;
  family: 4 | 6;
}

const V4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const V4_MAPPED_PREFIX = 0xffffn << 32n;

function parseV4(text: string): bigint | null {
  const m = V4_RE.exec(text);
  if (!m) return null;
  let v = 0n;
  for (let i = 1; i <= 4; i += 1) {
    const octet = Number(m[i]);
    if (!Number.isInteger(octet) || octet > 255) return null;
    v = (v << 8n) | BigInt(octet);
  }
  return v;
}

function parseV6(text: string): bigint | null {
  if (text.length > 45 || !/^[0-9a-fA-F:.]+$/.test(text)) return null;
  const doubleColon = text.split('::');
  if (doubleColon.length > 2) return null;
  const expandTail = (part: string): string[] | null => {
    if (part === '') return [];
    const groups = part.split(':');
    const last = groups[groups.length - 1];
    if (last !== undefined && last.includes('.')) {
      const v4 = parseV4(last);
      if (v4 === null) return null;
      groups.pop();
      groups.push((v4 >> 16n).toString(16), (v4 & 0xffffn).toString(16));
    }
    return groups;
  };
  const head = expandTail(doubleColon[0] ?? '');
  const tail = doubleColon.length === 2 ? expandTail(doubleColon[1] ?? '') : [];
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (doubleColon.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...new Array<string>(doubleColon.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  let v = 0n;
  for (const g of groups) {
    if (g === '' || g.length > 4 || !/^[0-9a-fA-F]+$/.test(g)) return null;
    v = (v << 16n) | BigInt(parseInt(g, 16));
  }
  return v;
}

export function parseIp(raw: string): ParsedIp | null {
  let text = raw.trim();
  if (text.startsWith('[')) {
    const end = text.indexOf(']');
    if (end < 0) return null;
    text = text.slice(1, end);
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(text)) {
    text = text.slice(0, text.lastIndexOf(':'));
  }
  const zone = text.indexOf('%');
  if (zone >= 0) text = text.slice(0, zone);
  if (text === '') return null;
  const v4 = parseV4(text);
  if (v4 !== null) return { value: V4_MAPPED_PREFIX | v4, family: 4 };
  const v6 = parseV6(text);
  if (v6 === null) return null;
  if (v6 >> 32n === 0xffffn) return { value: v6, family: 4 };
  return { value: v6, family: 6 };
}

/** Canonical text form used as a rate-limit key: dotted IPv4, or lowercase 8-group IPv6 without leading zeros. */
export function canonicalIp(ip: ParsedIp): string {
  if (ip.family === 4) {
    const v = ip.value & 0xffffffffn;
    return [24n, 16n, 8n, 0n].map((s) => ((v >> s) & 0xffn).toString()).join('.');
  }
  const groups: string[] = [];
  for (let i = 7; i >= 0; i -= 1) groups.push(((ip.value >> BigInt(i * 16)) & 0xffffn).toString(16));
  return groups.join(':');
}

export function normalizeIp(raw: string): string | null {
  const parsed = parseIp(raw);
  return parsed ? canonicalIp(parsed) : null;
}

interface Range {
  value: bigint;
  bits: number;
}

function parseRange(entry: string): Range {
  const [addr, prefix, ...rest] = entry.trim().split('/');
  if (rest.length || addr === undefined || addr === '') throw new Error(`invalid proxy entry "${entry}"`);
  const ip = parseIp(addr);
  if (!ip) throw new Error(`invalid proxy address "${entry}"`);
  const maxBits = ip.family === 4 ? 32 : 128;
  let bits = maxBits;
  if (prefix !== undefined) {
    if (!/^\d{1,3}$/.test(prefix)) throw new Error(`invalid CIDR prefix in "${entry}"`);
    bits = Number(prefix);
    if (bits > maxBits) throw new Error(`CIDR prefix too long in "${entry}"`);
  }
  const width = ip.family === 4 ? bits + 96 : bits;
  const shift = BigInt(128 - width);
  return { value: (ip.value >> shift) << shift, bits: width };
}

/** Parse trusted proxy entries (IPs or CIDRs). Throws on any invalid entry so misconfiguration fails at startup, not silently open. */
export function createProxyTrust(entries: readonly string[]): ProxyTrust {
  const ranges = entries.map(parseRange);
  return {
    entries,
    isTrusted(address: string): boolean {
      if (ranges.length === 0) return false;
      const ip = parseIp(address);
      if (!ip) return false;
      return ranges.some((r) => {
        const shift = BigInt(128 - r.bits);
        return (ip.value >> shift) << shift === r.value;
      });
    },
  };
}

const TRUST_CACHE = new WeakMap<readonly string[], ProxyTrust>();

/** Memoized `createProxyTrust` keyed by the config array identity (parsed once per process). */
export function proxyTrust(entries: readonly string[]): ProxyTrust {
  let trust = TRUST_CACHE.get(entries);
  if (!trust) {
    trust = createProxyTrust(entries);
    TRUST_CACHE.set(entries, trust);
  }
  return trust;
}

export const UNKNOWN_CLIENT = 'unknown';
export const INVALID_CLIENT = 'invalid';

export function resolveClientIp(src: ClientAddressSource, trust: ProxyTrust): string {
  const socket = src.socketAddress ? normalizeIp(src.socketAddress) : null;
  if (!socket) return UNKNOWN_CLIENT;
  if (!trust.isTrusted(socket)) return socket;
  const chain = (src.forwardedFor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const hop = normalizeIp(chain[i] ?? '');
    if (!hop) return INVALID_CLIENT;
    if (!trust.isTrusted(hop)) return hop;
  }
  const real = src.realIp ? normalizeIp(src.realIp) : null;
  if (src.realIp && !real) return INVALID_CLIENT;
  if (real && !trust.isTrusted(real)) return real;
  return socket;
}
