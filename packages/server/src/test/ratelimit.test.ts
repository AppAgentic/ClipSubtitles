import { afterAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness';

const harnesses: Harness[] = [];

afterAll(async () => {
  for (const h of harnesses) await h.cleanup();
});

/** RATE_LIMIT_PER_MINUTE=60 → anonymous bucket capacity max(30, 30) = 30 requests before refill matters. */
const CAPACITY = 30;
const ANON_PATH = '/v1/exports/exp_doesnotexist/content?exp=1&sig=deadbeef';

async function overHttp(baseUrl: string, count: number, forwardedFor: (i: number) => string): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const res = await fetch(`${baseUrl}${ANON_PATH}`, { headers: { 'x-forwarded-for': forwardedFor(i), 'x-real-ip': forwardedFor(i) } });
    await res.arrayBuffer();
    statuses.push(res.status);
  }
  return statuses;
}

describe('anonymous rate limiting cannot be spoofed with forwarding headers', () => {
  it('ignores X-Forwarded-For / X-Real-IP by default: every request from one socket shares one bucket', async () => {
    const h = await createHarness({ RATE_LIMIT_PER_MINUTE: '60' });
    harnesses.push(h);
    const server = await h.listen();
    const statuses = await overHttp(server.baseUrl, CAPACITY + 1, (i) => `203.0.113.${(i % 250) + 1}`);
    expect(statuses.slice(0, CAPACITY).every((s) => s !== 429)).toBe(true);
    expect(statuses[CAPACITY]).toBe(429);
    await server.close();
  });

  it('honours the chain only when the socket peer is an explicitly trusted proxy', async () => {
    const h = await createHarness({ RATE_LIMIT_PER_MINUTE: '60', TRUSTED_PROXIES: '127.0.0.1, ::1' });
    harnesses.push(h);
    const server = await h.listen();
    // Distinct forwarded clients → distinct buckets: none is limited.
    const distinct = await overHttp(server.baseUrl, CAPACITY + 1, (i) => `203.0.113.${(i % 250) + 1}`);
    expect(distinct.every((s) => s !== 429)).toBe(true);
    // One forwarded client hammering → limited at capacity, even though the socket is the trusted proxy.
    const same = await overHttp(server.baseUrl, CAPACITY + 1, () => '198.51.100.7');
    expect(same.slice(0, CAPACITY).every((s) => s !== 429)).toBe(true);
    expect(same[CAPACITY]).toBe(429);
    await server.close();
  });

  it('in-process requests with no socket address fall into one shared "unknown" bucket regardless of headers', async () => {
    const h = await createHarness({ RATE_LIMIT_PER_MINUTE: '60', TRUSTED_PROXIES: '10.0.0.0/8' });
    harnesses.push(h);
    const statuses: number[] = [];
    for (let i = 0; i < CAPACITY + 1; i += 1) {
      const res = await h.api('GET', ANON_PATH, { headers: { 'x-forwarded-for': `203.0.113.${i + 1}`, 'x-real-ip': `203.0.113.${i + 1}` } });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, CAPACITY).every((s) => s !== 429)).toBe(true);
    expect(statuses[CAPACITY]).toBe(429);
  });

  it('rejects an invalid TRUSTED_PROXIES entry at startup', async () => {
    await expect(createHarness({ TRUSTED_PROXIES: '10.0.0.0/99' })).rejects.toThrow(/TRUSTED_PROXIES/);
  });
});
