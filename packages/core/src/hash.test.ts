import { describe, expect, it } from 'vitest';
import { idSchema } from '@clipsubtitles/contracts';
import { canonicalJson, computeContentHash, fingerprint, sha256Hex } from './hash';
import { deterministicId, idKindOf, newId } from './ids';
import { DEFAULT_SEGMENTATION, defaultStyle } from './presets';
import { segmentWords } from './segmentation';
import { wordsFromText } from './test-utils';

describe('canonicalJson / hashing', () => {
  it('sha256 matches known vectors (isomorphic implementation)', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('The quick brown fox jumps over the lazy dog')).toBe('d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592');
    expect(sha256Hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });

  it('sorts keys recursively and omits undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [3, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[3,{"y":2,"z":1}]},"b":1}');
  });

  it('content hash ignores ids but tracks text, timing, pages, and style', () => {
    const words = wordsFromText('hello world | again', { seed: 'a' });
    const wordsOtherIds = wordsFromText('hello world | again', { seed: 'b' });
    const pages = segmentWords(words, DEFAULT_SEGMENTATION, { seed: 'x' });
    const pages2 = segmentWords(wordsOtherIds, DEFAULT_SEGMENTATION, { seed: 'y' });
    const style = defaultStyle();
    const h1 = computeContentHash({ words, pages, style });
    const h2 = computeContentHash({ words: wordsOtherIds, pages: pages2, style });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    const edited = words.map((w, i) => (i === 0 ? { ...w, text: 'hallo' } : w));
    expect(computeContentHash({ words: edited, pages, style })).not.toBe(h1);
    expect(computeContentHash({ words, pages, style: { ...style, position: 'top' } })).not.toBe(h1);
  });

  it('fingerprints equal bodies equally regardless of key order', () => {
    expect(fingerprint({ a: 1, b: [1, 2] })).toBe(fingerprint({ b: [1, 2], a: 1 }));
  });
});

describe('ids', () => {
  it('generates ids that satisfy the contract schema and sort by time', () => {
    const a = newId('project', { now: 1_000_000 });
    const b = newId('project', { now: 2_000_000 });
    expect(idSchema('project').safeParse(a).success).toBe(true);
    expect(a < b).toBe(true);
    expect(idKindOf(a)).toBe('project');
    expect(idKindOf('nope')).toBeUndefined();
  });

  it('deterministic ids are stable and valid', () => {
    const a = deterministicId('word', 'seed:1');
    expect(a).toBe(deterministicId('word', 'seed:1'));
    expect(a).not.toBe(deterministicId('word', 'seed:2'));
    expect(idSchema('word').safeParse(a).success).toBe(true);
  });
});
