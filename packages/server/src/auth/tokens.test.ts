import { describe, expect, it } from 'vitest';
import { workOSConnectJwksUrl } from './tokens';

describe('WorkOS Connect metadata', () => {
  it('derives the signing-key endpoint from the configured AuthKit domain', () => {
    expect(workOSConnectJwksUrl('https://example.authkit.app')).toBe(
      'https://example.authkit.app/oauth2/jwks',
    );
    expect(workOSConnectJwksUrl('https://auth.example.com/')).toBe(
      'https://auth.example.com/oauth2/jwks',
    );
  });
});
