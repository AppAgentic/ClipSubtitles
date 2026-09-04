import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { SCOPES, type Scope } from '@clipsubtitles/contracts';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hmacSign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function hmacVerify(secret: string, payload: string, signature: string): boolean {
  const expected = Buffer.from(hmacSign(secret, payload));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function parseScopes(value: unknown): Scope[] {
  const raw: string[] = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : [];
  return raw.filter((s): s is Scope => (SCOPES as readonly string[]).includes(s));
}

function rawScopes(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(/[\s,]+/).filter(Boolean)
      : [];
}

/**
 * WorkOS Connect currently issues standard OIDC scopes rather than the
 * product's internal tool labels. A validated, correctly-audienced token with
 * `openid` represents an authenticated ClipSubtitles connection; application
 * read/write policy (including paid-render approval) remains enforced here.
 */
export function workOSInternalScopes(value: unknown): Scope[] {
  const explicit = parseScopes(value);
  if (explicit.length > 0) return explicit;
  return rawScopes(value).includes('openid') ? [...SCOPES] : [];
}

export interface VerifiedToken {
  subject: string;
  clientId: string;
  scopes: Scope[];
  jti: string | undefined;
  expiresAt: number | undefined;
  idpSessionId: string | undefined;
  email: string | undefined;
  displayName: string | undefined;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

export class TokenVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenVerificationError';
  }
}

/** WorkOS Connect publishes its signing keys on the configured AuthKit domain. */
export function workOSConnectJwksUrl(issuer: string): string {
  return `${issuer.replace(/\/$/, '')}/oauth2/jwks`;
}

function claimsToVerified(payload: JWTPayload, scopes = parseScopes(payload.scope ?? payload.scp ?? payload.scopes)): VerifiedToken {
  const clientId =
    (typeof payload.client_id === 'string' && payload.client_id) ||
    (typeof payload.azp === 'string' && payload.azp) ||
    (typeof payload.aud === 'string' && payload.aud) ||
    'unknown-client';
  return {
    subject: String(payload.sub ?? ''),
    clientId,
    scopes,
    jti: typeof payload.jti === 'string' ? payload.jti : undefined,
    expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
    idpSessionId: typeof payload.sid === 'string' ? payload.sid : undefined,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    displayName: typeof payload.name === 'string' ? payload.name : undefined,
  };
}

/** Local/mock verifier: HS256 tokens minted by `pnpm dev:token` or the dev OAuth server. */
export class LocalTokenVerifier implements TokenVerifier {
  private readonly key: Uint8Array;
  constructor(secret: string, private readonly issuer: string, private readonly audience: string) {
    this.key = new TextEncoder().encode(secret);
  }
  async verify(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: this.issuer, audience: this.audience, algorithms: ['HS256'] });
      if (!payload.sub) throw new TokenVerificationError('missing sub');
      return claimsToVerified(payload);
    } catch (err) {
      throw new TokenVerificationError(err instanceof Error ? err.message : 'invalid token');
    }
  }
}

export interface MintLocalTokenInput {
  secret: string;
  issuer: string;
  audience: string;
  subject: string;
  clientId: string;
  scopes: Scope[];
  ttlSeconds: number;
  email?: string;
  displayName?: string;
  idpSessionId?: string;
}

export async function mintLocalToken(input: MintLocalTokenInput): Promise<{ token: string; jti: string; expiresAt: number }> {
  const jti = randomToken(16);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + input.ttlSeconds;
  const jwt = new SignJWT({
    scope: input.scopes.join(' '),
    client_id: input.clientId,
    ...(input.email ? { email: input.email } : {}),
    ...(input.displayName ? { name: input.displayName } : {}),
    ...(input.idpSessionId ? { sid: input.idpSessionId } : {}),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(input.issuer)
    .setAudience(input.audience)
    .setSubject(input.subject)
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt);
  const token = await jwt.sign(new TextEncoder().encode(input.secret));
  return { token, jti, expiresAt };
}

/**
 * WorkOS/AuthKit verifier: RS256 access tokens validated against the AuthKit
 * JWKS. Config-gated; requires network access to the issuer. Not exercised
 * live in this repository.
 */
export class WorkOSTokenVerifier implements TokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  constructor(private readonly issuer: string, jwksUrl: string, private readonly audience?: string) {
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  async verify(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        algorithms: ['RS256'],
        ...(this.audience ? { audience: this.audience } : {}),
      });
      if (!payload.sub) throw new TokenVerificationError('missing sub');
      const scopeClaim = payload.scope ?? payload.scp ?? payload.scopes;
      return claimsToVerified(payload, workOSInternalScopes(scopeClaim));
    } catch (err) {
      throw new TokenVerificationError(err instanceof Error ? err.message : 'invalid token');
    }
  }
}
