import { SCOPES, type Scope } from '@clipsubtitles/contracts';
import { MOCK_USERS } from '../auth/identity-provider';
import { mintLocalToken, parseScopes } from '../auth/tokens';
import { loadConfig } from '../config';
import { loadDotEnv } from '../env';

/**
 * Mint a local bearer token for MCP/REST testing (AUTH_MODE=mock only).
 *   pnpm dev:token [--subject "mock|joe"] [--client dev-cli] [--scopes captions:read,captions:write] [--ttl 3600]
 */
loadDotEnv();
const config = loadConfig();
if (config.auth.mode !== 'mock') {
  console.error('dev:token only works with AUTH_MODE=mock. In workos mode, obtain tokens from AuthKit.');
  process.exit(1);
}
const argv = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback;
};
const subject = opt('subject', MOCK_USERS[0]?.subject ?? 'mock|joe');
const clientId = opt('client', 'dev-cli');
const scopes: Scope[] = parseScopes(opt('scopes', SCOPES.join(',')));
const ttl = Number(opt('ttl', String(config.auth.tokenTtlSeconds)));
const user = MOCK_USERS.find((u) => u.subject === subject);

mintLocalToken({
  secret: config.auth.localSecret,
  issuer: config.apiPublicUrl,
  audience: `${config.apiPublicUrl}/api/mcp`,
  subject,
  clientId,
  scopes: scopes.length ? scopes : [...SCOPES],
  ttlSeconds: Number.isFinite(ttl) ? ttl : config.auth.tokenTtlSeconds,
  ...(user?.email ? { email: user.email } : {}),
  ...(user?.displayName ? { displayName: user.displayName } : {}),
}).then(({ token, expiresAt }) => {
  console.log(token);
  console.error(`\nsubject=${subject} client=${clientId} scopes=${(scopes.length ? scopes : SCOPES).join(' ')} expires=${new Date(expiresAt * 1000).toISOString()}`);
  console.error(`curl -H "Authorization: Bearer $TOKEN" ${config.apiPublicUrl}/v1/me`);
});
