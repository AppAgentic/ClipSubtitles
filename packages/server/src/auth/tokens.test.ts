import { describe, expect, it } from 'vitest';
import { workOSConnectJwksUrl, workOSInternalScopes } from './tokens';

describe('WorkOS Connect metadata', () => {
  it('derives the signing-key endpoint from the configured AuthKit domain', () => {
    expect(workOSConnectJwksUrl('https://example.authkit.app')).toBe(
      'https://example.authkit.app/oauth2/jwks',
    );
    expect(workOSConnectJwksUrl('https://auth.example.com/')).toBe(
      'https://auth.example.com/oauth2/jwks',
    );
  });

  it('maps an authenticated WorkOS OIDC connection to application permissions', () => {
    expect(workOSInternalScopes('openid profile email offline_access')).toEqual([
      'captions:read',
      'captions:write',
    ]);
  });

  it('preserves an explicit internal scope and fails closed without openid', () => {
    expect(workOSInternalScopes('captions:read')).toEqual(['captions:read']);
    expect(workOSInternalScopes('profile email')).toEqual([]);
  });
});
