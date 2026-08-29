import { createSession, ensureUserWorkspace, findActiveSession, getUser, revokeSession, touchSession } from '@clipsubtitles/storage';
import { SCOPES } from '@clipsubtitles/contracts';
import type { AppContext } from '../context';
import type { IdentityUser } from './identity-provider';
import { maskEmail, type Principal } from './principal';
import { hashToken, randomToken } from './tokens';

export const SESSION_COOKIE = 'cs_session';

export interface CookieOptions {
  httpOnly: true;
  sameSite: 'Lax';
  secure: boolean;
  path: '/';
  maxAge: number;
}

export function sessionCookieOptions(ctx: AppContext): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'Lax',
    secure: ctx.config.env === 'production',
    path: '/',
    maxAge: ctx.config.auth.sessionTtlSeconds,
  };
}

/** Create the user/workspace on first sign-in and open a web session. */
export function establishSession(ctx: AppContext, user: IdentityUser): { token: string; principal: Principal } {
  const now = ctx.clock.iso();
  const { user: record, workspace } = ensureUserWorkspace(ctx.db, {
    subject: user.subject,
    ...(user.email ? { email: user.email } : {}),
    ...(user.displayName ? { displayName: user.displayName } : {}),
    now,
    initialCredits: ctx.config.limits.initialCreditGrant,
    defaultRetention: { sourceDays: ctx.config.limits.sourceRetentionDays, exportDays: ctx.config.limits.exportRetentionDays },
  });
  const token = randomToken(32);
  const session = createSession(ctx.db, {
    tokenHash: hashToken(token),
    userId: record.id,
    workspaceId: workspace.id,
    ...(user.idpSessionId ? { idpSessionId: user.idpSessionId } : {}),
    now,
    expiresAt: new Date(ctx.clock.now() + ctx.config.auth.sessionTtlSeconds * 1000).toISOString(),
  });
  const principal: Principal = {
    kind: 'session',
    userId: record.id,
    workspaceId: workspace.id,
    subject: record.subject,
    scopes: [...SCOPES],
    sessionId: session.id,
  };
  if (record.displayName) principal.displayName = record.displayName;
  const masked = maskEmail(record.email);
  if (masked) principal.emailMasked = masked;
  return { token, principal };
}

export function principalFromSessionToken(ctx: AppContext, token: string): Principal | null {
  if (!token || token.length > 256) return null;
  const now = ctx.clock.iso();
  const session = findActiveSession(ctx.db, hashToken(token), now);
  if (!session) return null;
  const user = getUser(ctx.db, session.userId);
  if (!user) return null;
  touchSession(ctx.db, session.id, now);
  const principal: Principal = {
    kind: 'session',
    userId: user.id,
    workspaceId: session.workspaceId,
    subject: user.subject,
    scopes: [...SCOPES],
    sessionId: session.id,
  };
  if (user.displayName) principal.displayName = user.displayName;
  const masked = maskEmail(user.email);
  if (masked) principal.emailMasked = masked;
  return principal;
}

export function endSession(ctx: AppContext, token: string): boolean {
  const session = findActiveSession(ctx.db, hashToken(token), ctx.clock.iso());
  if (!session) return false;
  return revokeSession(ctx.db, session.id, ctx.clock.iso());
}
