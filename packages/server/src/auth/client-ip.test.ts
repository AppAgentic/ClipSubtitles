import { describe, expect, it } from 'vitest';
import { INVALID_CLIENT, UNKNOWN_CLIENT, createProxyTrust, normalizeIp, parseIp, resolveClientIp } from './client-ip';

const NONE = createProxyTrust([]);

describe('parseIp / normalizeIp', () => {
  it('canonicalises IPv4, IPv4-mapped IPv6, bracketed and zoned addresses', () => {
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('::FFFF:CB00:7107')).toBe('203.0.113.7');
    expect(normalizeIp('203.0.113.7:51234')).toBe('203.0.113.7');
    expect(normalizeIp('[2001:db8::1]:443')).toBe('2001:db8:0:0:0:0:0:1');
    expect(normalizeIp('fe80::1%en0')).toBe('fe80:0:0:0:0:0:0:1');
    expect(normalizeIp('2001:0DB8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8:0:0:0:0:0:1');
  });

  it('rejects garbage', () => {
    for (const bad of ['', 'localhost', '256.1.1.1', '1.2.3', '1.2.3.4.5', ':::1', '2001:db8::1::2', 'abcd::12345', '<script>', '10.0.0.1, 10.0.0.2']) {
      expect(parseIp(bad), bad).toBeNull();
    }
  });
});

describe('createProxyTrust', () => {
  it('matches plain addresses and CIDRs in both families', () => {
    const trust = createProxyTrust(['10.0.0.0/8', '192.0.2.10', '2001:db8::/32', 'fd00::5']);
    expect(trust.isTrusted('10.255.255.255')).toBe(true);
    expect(trust.isTrusted('::ffff:10.1.2.3')).toBe(true);
    expect(trust.isTrusted('11.0.0.1')).toBe(false);
    expect(trust.isTrusted('192.0.2.10')).toBe(true);
    expect(trust.isTrusted('192.0.2.11')).toBe(false);
    expect(trust.isTrusted('2001:db8:1234::1')).toBe(true);
    expect(trust.isTrusted('2001:db9::1')).toBe(false);
    expect(trust.isTrusted('fd00::5')).toBe(true);
    expect(trust.isTrusted('not-an-ip')).toBe(false);
  });

  it('refuses invalid configuration instead of silently trusting nothing or everything', () => {
    expect(() => createProxyTrust(['10.0.0.0/33'])).toThrow(/prefix/);
    expect(() => createProxyTrust(['bogus'])).toThrow(/invalid/);
    expect(() => createProxyTrust(['10.0.0.0/8/extra'])).toThrow(/invalid/);
    expect(() => createProxyTrust(['*'])).toThrow(/invalid/);
  });
});

describe('resolveClientIp', () => {
  it('ignores forwarding headers entirely when no proxy is trusted (default)', () => {
    expect(resolveClientIp({ socketAddress: '198.51.100.4', forwardedFor: '1.1.1.1', realIp: '2.2.2.2' }, NONE)).toBe('198.51.100.4');
    expect(resolveClientIp({ socketAddress: '::ffff:198.51.100.4', forwardedFor: '1.1.1.1', realIp: null }, NONE)).toBe('198.51.100.4');
  });

  it('resolves to a shared unknown bucket when the socket address is absent', () => {
    expect(resolveClientIp({ socketAddress: null, forwardedFor: '1.1.1.1', realIp: '2.2.2.2' }, NONE)).toBe(UNKNOWN_CLIENT);
    expect(resolveClientIp({ socketAddress: null, forwardedFor: null, realIp: null }, createProxyTrust(['10.0.0.0/8']))).toBe(UNKNOWN_CLIENT);
  });

  it('ignores headers when the socket peer is not a trusted proxy', () => {
    const trust = createProxyTrust(['10.0.0.0/8']);
    expect(resolveClientIp({ socketAddress: '203.0.113.9', forwardedFor: '1.1.1.1', realIp: '2.2.2.2' }, trust)).toBe('203.0.113.9');
  });

  it('walks X-Forwarded-For from the right, skipping trusted hops, when the peer is trusted', () => {
    const trust = createProxyTrust(['10.0.0.0/8', '172.16.0.0/12']);
    // client-supplied junk first, then the real client appended by the edge proxy, then an internal hop.
    expect(resolveClientIp({ socketAddress: '10.0.0.2', forwardedFor: '9.9.9.9, 203.0.113.50, 172.16.4.4', realIp: null }, trust)).toBe('203.0.113.50');
    expect(resolveClientIp({ socketAddress: '10.0.0.2', forwardedFor: '203.0.113.50', realIp: null }, trust)).toBe('203.0.113.50');
    // Spoofed leftmost entries never win.
    expect(resolveClientIp({ socketAddress: '10.0.0.2', forwardedFor: '1.1.1.1, 203.0.113.50', realIp: null }, trust)).toBe('203.0.113.50');
  });

  it('falls back to X-Real-IP, then the socket, when the chain is all trusted or empty', () => {
    const trust = createProxyTrust(['10.0.0.0/8']);
    expect(resolveClientIp({ socketAddress: '10.0.0.2', forwardedFor: '10.0.0.3', realIp: '203.0.113.8' }, trust)).toBe('203.0.113.8');
    expect(resolveClientIp({ socketAddress: '10.0.0.2', forwardedFor: null, realIp: null }, trust)).toBe('10.0.0.2');
  });

  it('fails closed on malformed forwarded values from a trusted proxy', () => {
    const trust = createProxyTrust(['10.0.0.0/8']);
    expect(resolveClientIp({ socketAddress: '10.0.0.2', forwardedFor: 'unknown', realIp: null }, trust)).toBe(INVALID_CLIENT);
    expect(resolveClientIp({ socketAddress: '10.0.0.2', forwardedFor: null, realIp: 'nope' }, trust)).toBe(INVALID_CLIENT);
  });
});
