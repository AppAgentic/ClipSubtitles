import { decodeJwt } from 'jose';
import type { AppConfig } from '../config';

export interface IdentityUser {
  subject: string;
  email?: string;
  displayName?: string;
  idpSessionId?: string;
}

/**
 * Identity provider boundary. Production uses WorkOS/AuthKit exclusively;
 * local development uses a mock picker. Nothing else ever creates identities.
 */
export interface IdentityProvider {
  readonly kind: 'mock' | 'workos';
  authorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<IdentityUser>;
  logoutUrl(idpSessionId: string | undefined, returnTo: string): string | null;
}

export const MOCK_USERS: IdentityUser[] = [
  { subject: 'mock|joe', email: 'joe@example.com', displayName: 'Joe (mock)' },
  { subject: 'mock|ana', email: 'ana@example.com', displayName: 'Ana (mock)' },
  { subject: 'mock|reviewer', email: 'reviewer@example.com', displayName: 'Directory reviewer (mock)' },
];

export class MockIdentityProvider implements IdentityProvider {
  readonly kind = 'mock' as const;
  /** `entryUrl` is the public origin users browse (the web app proxies /auth/* to the API). */
  constructor(private readonly entryUrl: string) {}

  authorizationUrl(state: string): string {
    return `${this.entryUrl}/auth/mock/sign-in?state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(code: string): Promise<IdentityUser> {
    const user = MOCK_USERS.find((u) => u.subject === code);
    if (!user) throw new Error('Unknown mock user');
    return { ...user, idpSessionId: `mocksid_${Date.now().toString(36)}` };
  }

  logoutUrl(): string | null {
    return null;
  }
}

interface WorkOSLike {
  userManagement: {
    getAuthorizationUrl(opts: { provider: string; clientId: string; redirectUri: string; state?: string }): string;
    authenticateWithCode(opts: { clientId: string; code: string }): Promise<{
      user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
      accessToken: string;
    }>;
    getLogoutUrl(opts: { sessionId: string; returnTo?: string }): string;
  };
}

/**
 * WorkOS/AuthKit provider (config-gated, unverified live). The SDK is loaded
 * lazily so mock mode never touches it.
 */
export class WorkOSIdentityProvider implements IdentityProvider {
  readonly kind = 'workos' as const;
  private client: WorkOSLike | null = null;

  constructor(private readonly config: NonNullable<AppConfig['auth']['workos']>) {}

  private async sdk(): Promise<WorkOSLike> {
    if (this.client) return this.client;
    const mod = (await import('@workos-inc/node')) as unknown as { WorkOS: new (apiKey: string, opts: { clientId: string }) => WorkOSLike };
    this.client = new mod.WorkOS(this.config.apiKey, { clientId: this.config.clientId });
    return this.client;
  }

  authorizationUrl(state: string): string {
    // Built without the SDK so the URL is deterministic and inspectable.
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      provider: 'authkit',
      state,
    });
    return `https://api.workos.com/user_management/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<IdentityUser> {
    const workos = await this.sdk();
    const result = await workos.userManagement.authenticateWithCode({ clientId: this.config.clientId, code });
    let sid: string | undefined;
    try {
      const claims = decodeJwt(result.accessToken);
      if (typeof claims.sid === 'string') sid = claims.sid;
    } catch {
      sid = undefined;
    }
    const name = [result.user.firstName, result.user.lastName].filter(Boolean).join(' ').trim();
    const user: IdentityUser = { subject: result.user.id, email: result.user.email };
    if (name) user.displayName = name;
    if (sid) user.idpSessionId = sid;
    return user;
  }

  logoutUrl(idpSessionId: string | undefined, returnTo: string): string | null {
    if (!idpSessionId) return null;
    const params = new URLSearchParams({ session_id: idpSessionId, return_to: returnTo });
    return `https://api.workos.com/user_management/sessions/logout?${params.toString()}`;
  }
}

export function createIdentityProvider(config: AppConfig): IdentityProvider {
  if (config.auth.mode === 'workos' && config.auth.workos) return new WorkOSIdentityProvider(config.auth.workos);
  return new MockIdentityProvider(config.webPublicUrl);
}
