import type { Scope } from '@clipsubtitles/contracts';

/**
 * The verified identity attached to every authenticated request. Workspace
 * ownership is derived here — never from request input.
 */
export interface Principal {
  kind: 'session' | 'bearer';
  userId: string;
  workspaceId: string;
  subject: string;
  scopes: Scope[];
  sessionId?: string;
  grantId?: string;
  clientId?: string;
  tokenJti?: string;
  displayName?: string;
  emailMasked?: string;
}

export function hasScope(p: Principal, scope: Scope): boolean {
  return p.scopes.includes(scope);
}

export function maskEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const [local, domain] = email.split('@');
  if (!local || !domain) return undefined;
  const shown = local.length <= 2 ? local[0] ?? '' : local.slice(0, 2);
  return `${shown}***@${domain}`;
}
