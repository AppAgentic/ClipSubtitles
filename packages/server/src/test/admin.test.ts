import { afterEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, establishSession } from '../auth/session';
import { createHarness, type Harness } from './harness';

let h: Harness | undefined;
afterEach(async () => {
  await h?.cleanup();
  h = undefined;
});

async function session(email: string): Promise<string> {
  const established = await establishSession(h!.ctx, { subject: `mock|${email}`, email });
  return `${SESSION_COOKIE}=${established.token}`;
}

describe('private administration and analytics', () => {
  it('records direct anonymous events and links the same session after authentication', async () => {
    h = await createHarness({ ADMIN_EMAILS: 'joe@appagentic.dev' });
    const attribution = {
      sessionId: 'browser-session-1',
      capturedAt: Date.now(),
      landingUrl: 'https://clipsubtitles.com/',
    };
    expect(
      (
        await h.api('POST', '/v1/analytics/funnel', {
          body: { event: 'landing_captured', attribution },
        })
      ).status,
    ).toBe(200);
    const cookie = await session('joe@appagentic.dev');
    const linked = await h.app.request('/v1/analytics/funnel', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin: h.config.webPublicUrl },
      body: JSON.stringify({ event: 'signup_completed', attribution }),
    });
    expect(linked.status).toBe(200);
    const overview = await h.app.request('/v1/admin/overview', { headers: { cookie } });
    expect(overview.status).toBe(200);
    const body = (await overview.json()) as {
      totals: { users: number };
      sources: Array<{ source: string; sessions: number; registrations: number }>;
    };
    expect(body.totals.users).toBe(1);
    expect(body.sources.find((source) => source.source === 'direct')).toEqual({
      source: 'direct',
      sessions: 1,
      registrations: 1,
    });
    const userId = (await h.ctx.db.listAdminUsers(1))[0]!.id;
    expect(
      (await h.app.request(`/v1/admin/users/${userId}/timeline`, { headers: { cookie } })).status,
    ).toBe(200);
    expect((await h.app.request('/v1/admin/funnel', { headers: { cookie } })).status).toBe(200);
    expect((await h.app.request('/v1/admin/system-health', { headers: { cookie } })).status).toBe(
      200,
    );
    expect((await h.app.request('/v1/admin/costs', { headers: { cookie } })).status).toBe(200);
  });

  it('rejects non-admin sessions and exposes no transcript or media content', async () => {
    h = await createHarness({ ADMIN_EMAILS: 'joe@appagentic.dev' });
    const ordinary = await session('customer@example.com');
    expect(
      (await h.app.request('/v1/admin/overview', { headers: { cookie: ordinary } })).status,
    ).toBe(403);
    const admin = await session('joe@appagentic.dev');
    const response = await h.app.request('/v1/admin/users', { headers: { cookie: admin } });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('customer@example.com');
    expect(text).toContain('c***@example.com');
    expect(text).not.toContain('words_json');
    expect(text).not.toContain('storage_key');
  });
});
