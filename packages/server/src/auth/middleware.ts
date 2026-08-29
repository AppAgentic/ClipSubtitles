import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { SCOPES, type Scope } from '@clipsubtitles/contracts';
import { newId } from '@clipsubtitles/core';
import type { AppContext } from '../context';
import { ApiError } from '../errors';
import { proxyTrust, resolveClientIp } from './client-ip';
import type { RateLimiters } from './ratelimit';
import { maskEmail, type Principal } from './principal';
import { SESSION_COOKIE, principalFromSessionToken } from './session';
import { TokenVerificationError } from './tokens';

export interface AppVariables {
  principal: Principal;
  requestId: string;
}

export type AppEnv = { Variables: AppVariables };

export function requestIdMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const id = newId('errorRef').replace('err_', 'req_');
    c.set('requestId', id);
    c.header('X-Request-Id', id);
    await next();
  };
}

export function resourceMetadataUrl(ctx: AppContext): string {
  return `${ctx.config.apiPublicUrl}/.well-known/oauth-protected-resource`;
}

export function challengeHeader(ctx: AppContext, error?: string): string {
  const parts = [`Bearer realm="ClipSubtitles"`, `resource_metadata="${resourceMetadataUrl(ctx)}"`];
  if (error) parts.push(`error="${error}"`);
  return parts.join(', ');
}

/** Verify a bearer token and derive the principal + grant (revocation handle). */
export async function principalFromBearer(ctx: AppContext, token: string): Promise<Principal> {
  if (!token || token.length > 8192) throw new ApiError('UNAUTHENTICATED');
  let verified;
  try {
    verified = await ctx.verifier.verify(token);
  } catch (err) {
    if (err instanceof TokenVerificationError) throw new ApiError('UNAUTHENTICATED', 'The access token is invalid or expired.', { internal: err });
    throw err;
  }
  if (verified.jti && (await ctx.db.isTokenRevoked(verified.jti))) throw new ApiError('UNAUTHENTICATED', 'The access token was revoked.');
  const now = ctx.clock.iso();
  const { user, workspace } = await ctx.db.ensureUserWorkspace({
    subject: verified.subject,
    ...(verified.email ? { email: verified.email } : {}),
    ...(verified.displayName ? { displayName: verified.displayName } : {}),
    now,
    initialCredits: ctx.config.limits.initialCreditGrant,
    defaultRetention: { sourceDays: ctx.config.limits.sourceRetentionDays, exportDays: ctx.config.limits.exportRetentionDays },
  });
  // Fail closed: a token must carry at least one recognised scope. Unknown or missing scopes grant nothing.
  const scopes: Scope[] = verified.scopes.filter((s): s is Scope => (SCOPES as readonly string[]).includes(s));
  if (scopes.length === 0) throw new ApiError('INSUFFICIENT_SCOPE', 'The access token carries no recognised scopes.');
  const grant = await ctx.db.ensureGrant({ userId: user.id, workspaceId: workspace.id, clientId: verified.clientId, scopes, now });
  if (grant.revokedAt) throw new ApiError('UNAUTHENTICATED', 'This connection was revoked by the user.');
  await ctx.db.touchGrant(grant.id, now);
  const principal: Principal = {
    kind: 'bearer',
    userId: user.id,
    workspaceId: workspace.id,
    subject: user.subject,
    scopes,
    grantId: grant.id,
    clientId: verified.clientId,
  };
  if (verified.jti) principal.tokenJti = verified.jti;
  if (user.displayName) principal.displayName = user.displayName;
  const masked = maskEmail(user.email);
  if (masked) principal.emailMasked = masked;
  return principal;
}

/**
 * Cookie sessions are ambient credentials: unsafe methods must prove they
 * originate from our own web origin (same-origin fetch or matching Origin).
 */
export function passesCsrf(c: Context, ctx: AppContext): boolean {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const site = c.req.header('sec-fetch-site');
  if (site === 'same-origin' || site === 'none') return true;
  const origin = c.req.header('origin');
  if (!origin) return false;
  const allowed = [ctx.config.webPublicUrl, ctx.config.apiPublicUrl];
  return allowed.some((a) => origin === a);
}

export interface AuthenticateOptions {
  modes: Array<'bearer' | 'session'>;
  optional?: boolean;
}

export function authenticate(ctx: AppContext, opts: AuthenticateOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization');
    let principal: Principal | null = null;
    if (opts.modes.includes('bearer') && header) {
      const m = /^Bearer\s+(.+)$/i.exec(header.trim());
      if (!m || !m[1]) {
        c.header('WWW-Authenticate', challengeHeader(ctx, 'invalid_request'));
        throw new ApiError('UNAUTHENTICATED');
      }
      try {
        principal = await principalFromBearer(ctx, m[1]);
      } catch (err) {
        c.header('WWW-Authenticate', challengeHeader(ctx, 'invalid_token'));
        throw err;
      }
    } else if (opts.modes.includes('session')) {
      const token = getCookie(c, SESSION_COOKIE);
      if (token) {
        principal = await principalFromSessionToken(ctx, token);
        if (principal && !passesCsrf(c, ctx)) throw new ApiError('FORBIDDEN', 'Cross-site request blocked.');
      }
    }
    if (!principal) {
      if (opts.optional) {
        await next();
        return;
      }
      c.header('WWW-Authenticate', challengeHeader(ctx));
      throw new ApiError('UNAUTHENTICATED');
    }
    c.set('principal', principal);
    await next();
  };
}

export function requireScope(scope: Scope): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const p = c.get('principal');
    if (!p) throw new ApiError('UNAUTHENTICATED');
    if (!p.scopes.includes(scope)) throw new ApiError('INSUFFICIENT_SCOPE', `This action requires the ${scope} scope.`);
    await next();
  };
}

export function rateLimit(ctx: AppContext, bucket: keyof RateLimiters, keyFor: (c: Context<AppEnv>) => string, cost = 1): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const decision = ctx.limiters[bucket].take(keyFor(c), ctx.clock.now(), cost);
    c.header('RateLimit-Limit', String(decision.limit));
    c.header('RateLimit-Remaining', String(decision.remaining));
    c.header('RateLimit-Reset', String(Math.ceil(decision.resetMs / 1000)));
    if (!decision.ok) {
      c.header('Retry-After', String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))));
      throw new ApiError('RATE_LIMITED');
    }
    await next();
  };
}

/**
 * Client address for rate-limit keys. Fail-closed: forwarding headers are only
 * consulted when the socket peer is one of `trustedProxies` (see
 * `resolveClientIp`); with the default empty list the socket address is the
 * client, and in-process requests with no socket share one "unknown" bucket.
 */
export function clientIp(c: Context, trustedProxies: readonly string[] = []): string {
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return resolveClientIp(
    {
      socketAddress: incoming?.socket?.remoteAddress ?? null,
      forwardedFor: c.req.header('x-forwarded-for') ?? null,
      realIp: c.req.header('x-real-ip') ?? null,
    },
    proxyTrust(trustedProxies),
  );
}

export function principalKey(c: Context<AppEnv>): string {
  const p = c.get('principal');
  return p ? `p:${p.workspaceId}` : `ip:${clientIp(c)}`;
}
