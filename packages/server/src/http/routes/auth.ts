import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { MOCK_USERS } from '../../auth/identity-provider';
import { passesCsrf, type AppEnv } from '../../auth/middleware';
import { SESSION_COOKIE, endSession, establishSession, sessionCookieOptions } from '../../auth/session';
import { randomToken } from '../../auth/tokens';
import type { AppContext } from '../../context';
import { ApiError } from '../../errors';
import { audit } from '../../services/audit';

const STATE_COOKIE = 'cs_oauth_state';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

/** Only allow redirects back into our own web origin (or relative paths). */
export function safeReturnTo(ctx: AppContext, raw: string | undefined): string {
  const fallback = `${ctx.config.webPublicUrl}/`;
  if (!raw) return fallback;
  if (raw.startsWith('/') && !raw.startsWith('//')) return `${ctx.config.webPublicUrl}${raw}`;
  try {
    const u = new URL(raw);
    const web = new URL(ctx.config.webPublicUrl);
    if (u.origin === web.origin) return u.toString();
  } catch {
    return fallback;
  }
  return fallback;
}

export function mockPickerHtml(ctx: AppContext, state: string, action: string, extraFields = ''): string {
  const users = MOCK_USERS.map(
    (u) => `<li><form method="post" action="${escapeHtml(action)}"><input type="hidden" name="state" value="${escapeHtml(state)}">${extraFields}<input type="hidden" name="subject" value="${escapeHtml(u.subject)}"><button type="submit">${escapeHtml(u.displayName ?? u.subject)} <span>${escapeHtml(u.email ?? '')}</span></button></form></li>`,
  ).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ClipSubtitles · local sign-in</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#0b0d10;color:#e8ebef;display:grid;place-items:center;min-height:100vh;margin:0}main{width:min(420px,92vw);background:#14181d;border:1px solid #232a32;border-radius:14px;padding:28px}h1{font-size:18px;margin:0 0 6px}p{color:#98a2b3;font-size:13px;margin:0 0 18px}ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}button{width:100%;text-align:left;background:#1c2229;color:#fff;border:1px solid #2b333d;border-radius:10px;padding:12px 14px;font-size:14px;cursor:pointer}button:hover{border-color:#6ea8fe}button span{display:block;color:#98a2b3;font-size:12px;margin-top:2px}.tag{display:inline-block;font-size:11px;color:#f5b642;border:1px solid #5a4514;border-radius:6px;padding:2px 6px;margin-bottom:12px}</style></head>
<body><main><span class="tag">AUTH_MODE=mock · local development only</span><h1>Choose a local identity</h1><p>In production this page is WorkOS AuthKit. Each identity maps to exactly one personal workspace.</p><ul>${users}</ul></main></body></html>`;
}

export function registerAuthRoutes(app: Hono<AppEnv>, ctx: AppContext): void {
  app.get('/auth/login', (c) => {
    const state = randomToken(16);
    const returnTo = safeReturnTo(ctx, c.req.query('returnTo'));
    setCookie(c, STATE_COOKIE, `${state}|${returnTo}`, { httpOnly: true, sameSite: 'Lax', secure: ctx.config.env === 'production', path: '/auth', maxAge: 600 });
    return c.redirect(ctx.identity.authorizationUrl(state), 302);
  });

  if (ctx.identity.kind === 'mock') {
    // The whole mock flow stays on the web origin (proxied) so the session cookie is set for the host users browse.
    app.get('/auth/mock/sign-in', (c) => c.html(mockPickerHtml(ctx, c.req.query('state') ?? '', `${ctx.config.webPublicUrl}/auth/mock/sign-in`)));
    app.post('/auth/mock/sign-in', async (c) => {
      const form = await c.req.parseBody();
      const subject = typeof form.subject === 'string' ? form.subject : '';
      const state = typeof form.state === 'string' ? form.state : '';
      return c.redirect(`${ctx.config.webPublicUrl}/auth/callback?code=${encodeURIComponent(subject)}&state=${encodeURIComponent(state)}`, 302);
    });
  }

  app.get('/auth/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const stored = getCookie(c, STATE_COOKIE);
    if (!code || !state || !stored) throw new ApiError('UNAUTHENTICATED', 'Sign-in state is missing or expired. Start again.');
    const [expectedState, returnTo] = stored.split('|');
    if (state !== expectedState) throw new ApiError('UNAUTHENTICATED', 'Sign-in state mismatch.');
    let user;
    try {
      user = await ctx.identity.exchangeCode(code);
    } catch (err) {
      throw new ApiError('UNAUTHENTICATED', 'Sign-in could not be completed.', { internal: err });
    }
    const { token, principal } = await establishSession(ctx, user);
    setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(ctx));
    deleteCookie(c, STATE_COOKIE, { path: '/auth' });
    await audit(ctx, { principal, action: 'auth.sign_in', metadata: { idp: ctx.identity.kind } });
    return c.redirect(safeReturnTo(ctx, returnTo), 302);
  });

  app.post('/auth/logout', async (c) => {
    if (!passesCsrf(c, ctx)) throw new ApiError('FORBIDDEN', 'Cross-site request blocked.');
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await endSession(ctx, token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.body(null, 204);
  });

  // WorkOS webhooks (config-gated). Event names follow the WorkOS events catalogue and are unverified live.
  app.post('/auth/webhooks/workos', async (c) => {
    const secret = ctx.config.auth.workos?.webhookSecret;
    if (!secret) throw new ApiError('NOT_FOUND');
    const raw = await c.req.text();
    const header = c.req.header('workos-signature') ?? '';
    const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=')).filter((kv) => kv.length === 2)) as Record<string, string>;
    const t = parts.t ?? '';
    const v1 = parts.v1 ?? '';
    const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
    if (!t || !v1 || expected.length !== v1.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) {
      throw new ApiError('UNAUTHENTICATED', 'Invalid webhook signature.');
    }
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new ApiError('UNAUTHENTICATED', 'Stale webhook.');
    let event: { event?: string; data?: { id?: string; user_id?: string } };
    try {
      event = JSON.parse(raw) as typeof event;
    } catch {
      throw new ApiError('VALIDATION_FAILED');
    }
    const now = ctx.clock.iso();
    if (event.event === 'session.revoked' && event.data?.id) {
      await ctx.db.revokeSessionsByIdpSessionId(event.data.id, now);
    } else if (event.event === 'user.deleted' && event.data?.id) {
      const user = await ctx.db.getUserBySubject(event.data.id);
      if (user) {
        await ctx.db.revokeSessionsForUser(user.id, now);
        await ctx.db.revokeGrantsForUser(user.id, now);
      }
    }
    await audit(ctx, { actorType: 'system', action: 'auth.webhook', metadata: { event: event.event } });
    return c.json({ received: true }, 200);
  });
}
