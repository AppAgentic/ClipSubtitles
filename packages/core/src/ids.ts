import { randomBytes } from 'node:crypto';
import { ID_PREFIXES, type IdKind } from '@clipsubtitles/contracts';

/** Crockford base32, lowercase, no i/l/o/u — matches the contract id regex. */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

function encodeBase32(bytes: Uint8Array, length: number): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= length) break;
  }
  while (out.length < length) out += ALPHABET[0];
  return out;
}

function encodeTime(ms: number): string {
  // 48-bit timestamp -> 10 base32 chars (time-sortable prefix, ULID style).
  let t = ms;
  const chars: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    chars.unshift(ALPHABET[t % 32] ?? '0');
    t = Math.floor(t / 32);
  }
  return chars.join('');
}

/**
 * Time-sortable prefixed identifier: `<prefix>_<10 time chars><16 random chars>`.
 * Deterministic tests can inject `random` and `now`.
 */
export function newId(kind: IdKind, opts: { now?: number; random?: () => Uint8Array } = {}): string {
  const now = opts.now ?? Date.now();
  const rnd = opts.random ? opts.random() : randomBytes(10);
  return `${ID_PREFIXES[kind]}_${encodeTime(now)}${encodeBase32(rnd, 16)}`;
}

/** Deterministic id derived from a seed (used for fixture words/pages so hashes are stable). */
export function deterministicId(kind: IdKind, seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i += 1) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x9e3779b1) >>> 0;
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 4; i += 1) {
    bytes[i] = (h1 >>> (i * 8)) & 0xff;
    bytes[4 + i] = (h2 >>> (i * 8)) & 0xff;
    bytes[8 + i] = ((h1 * 31) >>> (i * 8)) & 0xff;
    bytes[12 + i] = ((h2 * 17) >>> (i * 8)) & 0xff;
  }
  return `${ID_PREFIXES[kind]}_${encodeBase32(bytes, 26)}`;
}

export function idKindOf(id: string): IdKind | undefined {
  const prefix = id.split('_')[0];
  for (const [kind, p] of Object.entries(ID_PREFIXES)) {
    if (p === prefix) return kind as IdKind;
  }
  return undefined;
}
