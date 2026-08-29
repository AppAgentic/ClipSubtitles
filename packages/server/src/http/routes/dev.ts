import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Hono } from 'hono';
import { z } from 'zod';
import { SCOPES, type Scope } from '@clipsubtitles/contracts';
import {
  DEFAULT_SEGMENTATION,
  computeContentHash,
  defaultStyle,
  segmentationForStyle,
} from '@clipsubtitles/core';
import { BENCHMARK_CASES, resolveRepoRoot } from '@clipsubtitles/transcription';
import { MOCK_USERS } from '../../auth/identity-provider';
import { authenticate, type AppEnv } from '../../auth/middleware';
import { mintLocalToken, parseScopes, randomToken } from '../../auth/tokens';
import type { AppContext } from '../../context';
import { ApiError } from '../../errors';
import { audit } from '../../services/audit';
import { finalizeSourceAsset, sourceStorageKey } from '../../services/uploads';
import { buildProjectView } from '../../services/views';
import { mockPickerHtml } from './auth';

const TokenRequest = z
  .object({
    subject: z.string().min(1).max(200).optional(),
    clientId: z.string().min(1).max(200).optional(),
    scopes: z.array(z.enum(SCOPES)).optional(),
    ttlSeconds: z
      .number()
      .int()
      .min(60)
      .max(30 * 24 * 3600)
      .optional(),
  })
  .strict();

interface DevClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
}

interface DevCode {
  subject: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: Scope[];
  expiresAt: number;
}

function demoFixturePath(id: string): string {
  return path.join(resolveRepoRoot(), 'fixtures', 'generated', 'demo', `${id}.mp4`);
}

/**
 * Local-only helpers, registered when AUTH_MODE=mock outside production:
 * token minting, fixture projects, and a minimal OAuth 2.1 authorization
 * server (PKCE + DCR) so real MCP clients can connect end-to-end locally.
 */
export function registerDevRoutes(app: Hono<AppEnv>, ctx: AppContext): void {
  const clients = new Map<string, DevClient>();
  const codes = new Map<string, DevCode>();
  const issuer = ctx.config.apiPublicUrl;
  const audience = `${ctx.config.apiPublicUrl}/api/mcp`;

  app.post('/dev/tokens', async (c) => {
    const body = TokenRequest.parse(await c.req.json().catch(() => ({})));
    const subject = body.subject ?? MOCK_USERS[0]?.subject ?? 'mock|joe';
    const user = MOCK_USERS.find((u) => u.subject === subject);
    const minted = await mintLocalToken({
      secret: ctx.config.auth.localSecret,
      issuer,
      audience,
      subject,
      clientId: body.clientId ?? 'dev-cli',
      scopes: body.scopes ?? [...SCOPES],
      ttlSeconds: body.ttlSeconds ?? ctx.config.auth.tokenTtlSeconds,
      ...(user?.email ? { email: user.email } : {}),
      ...(user?.displayName ? { displayName: user.displayName } : {}),
    });
    return c.json(
      {
        accessToken: minted.token,
        tokenType: 'Bearer',
        expiresAt: minted.expiresAt,
        subject,
        scopes: body.scopes ?? [...SCOPES],
      },
      201,
    );
  });

  app.get('/dev/fixtures', (c) =>
    c.json({
      fixtures: BENCHMARK_CASES.filter((f) => f.demoVideo).map((f) => ({
        id: f.id,
        title: f.title,
        language: f.language,
        available: existsSync(demoFixturePath(f.id)),
      })),
      hint: 'Run `pnpm fixtures:build` to generate demo clips.',
    }),
  );

  app.post(
    '/dev/fixtures/:fixtureId/projects',
    authenticate(ctx, { modes: ['bearer', 'session'] }),
    async (c) => {
      const principal = c.get('principal');
      const fixtureId = c.req.param('fixtureId');
      const fixture = BENCHMARK_CASES.find((f) => f.id === fixtureId && f.demoVideo);
      const mp4 = demoFixturePath(fixtureId);
      if (!fixture || !existsSync(mp4))
        throw new ApiError('NOT_FOUND', 'Fixture not found. Run `pnpm fixtures:build`.');
      const style = defaultStyle();
      const now = ctx.clock.iso();
      const project = await ctx.db.createProject({
        workspaceId: principal.workspaceId,
        title: fixture.title,
        status: 'importing',
        style,
        segmentation: segmentationForStyle(style, DEFAULT_SEGMENTATION),
        contentHash: computeContentHash({ words: [], pages: [], style }),
        language: fixture.language,
        now,
      });
      const asset = await ctx.db.createAsset({
        workspaceId: principal.workspaceId,
        projectId: project.id,
        status: 'importing',
        origin: 'fixture',
        fileName: `${fixture.id}.mp4`,
        mimeType: 'video/mp4',
        now,
      });
      await ctx.db.updateProjectMeta(project.id, { sourceAssetId: asset.id }, now);
      const key = sourceStorageKey(principal.workspaceId, asset.id, `${fixture.id}.mp4`);
      const stored = await ctx.store.putFile(key, mp4, { contentType: 'video/mp4' });
      const truthKey = `${principal.workspaceId}/sources/${asset.id}/truth.json`;
      if (existsSync(`${mp4}.truth.json`)) {
        await ctx.store.putFile(truthKey, `${mp4}.truth.json`, { contentType: 'application/json' });
        await ctx.db.updateAsset(asset.id, { truthKey }, now);
      }
      const ready = await finalizeSourceAsset(
        ctx,
        { ...asset, ...(existsSync(`${mp4}.truth.json`) ? { truthKey } : {}) },
        { storageKey: key, bytes: stored.bytes, sha256: stored.sha256, mimeType: 'video/mp4' },
      );
      await audit(ctx, {
        principal,
        action: 'project.create',
        targetType: 'project',
        targetId: project.id,
        metadata: { origin: 'fixture', fixtureId, assetId: ready.id },
      });
      const fresh = await ctx.db.getProject(principal.workspaceId, project.id);
      return c.json(
        { project: fresh ? await buildProjectView(ctx, fresh, { includePages: false }) : null },
        201,
      );
    },
  );

  // --- Minimal OAuth 2.1 authorization server for local MCP clients ---------------------------------
  app.get('/.well-known/oauth-authorization-server', (c) =>
    c.json({
      issuer,
      authorization_endpoint: `${issuer}/dev/oauth/authorize`,
      token_endpoint: `${issuer}/dev/oauth/token`,
      registration_endpoint: `${issuer}/dev/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [...SCOPES],
      note: 'Local development authorization server (AUTH_MODE=mock). Production uses WorkOS/AuthKit.',
    }),
  );

  app.post('/dev/oauth/register', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      client_name?: string;
      redirect_uris?: string[];
    };
    const clientId = `dev-${randomToken(8)}`;
    const client: DevClient = {
      clientId,
      clientName:
        typeof body.client_name === 'string' ? body.client_name.slice(0, 120) : 'Local MCP client',
      redirectUris: Array.isArray(body.redirect_uris)
        ? body.redirect_uris.filter((u) => typeof u === 'string').slice(0, 10)
        : [],
    };
    clients.set(clientId, client);
    return c.json(
      {
        client_id: clientId,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code'],
        response_types: ['code'],
      },
      201,
    );
  });

  const authorizeParams = (src: Record<string, string | undefined>) => ({
    clientId: src.client_id ?? '',
    redirectUri: src.redirect_uri ?? '',
    state: src.state ?? '',
    codeChallenge: src.code_challenge ?? '',
    method: src.code_challenge_method ?? '',
    scope: parseScopes(src.scope ?? SCOPES.join(' ')),
  });

  app.get('/dev/oauth/authorize', (c) => {
    const p = authorizeParams(Object.fromEntries(Object.entries(c.req.query())));
    if (!p.clientId || !p.redirectUri || !p.codeChallenge || p.method !== 'S256')
      throw new ApiError(
        'VALIDATION_FAILED',
        'client_id, redirect_uri, and S256 code_challenge are required.',
      );
    const hidden = ['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'scope']
      .map(
        (k) =>
          `<input type="hidden" name="${k}" value="${(c.req.query(k) ?? '').replace(/"/g, '&quot;')}">`,
      )
      .join('');
    return c.html(mockPickerHtml(ctx, p.state, `${issuer}/dev/oauth/authorize`, hidden));
  });

  app.post('/dev/oauth/authorize', async (c) => {
    const form = await c.req.parseBody();
    const str = (k: string) => (typeof form[k] === 'string' ? (form[k] as string) : undefined);
    const p = authorizeParams({
      client_id: str('client_id'),
      redirect_uri: str('redirect_uri'),
      state: str('state'),
      code_challenge: str('code_challenge'),
      code_challenge_method: str('code_challenge_method'),
      scope: str('scope'),
    });
    const subject = str('subject') ?? '';
    if (!MOCK_USERS.some((u) => u.subject === subject))
      throw new ApiError('VALIDATION_FAILED', 'Unknown mock user.');
    if (!p.clientId || !p.redirectUri || !p.codeChallenge) throw new ApiError('VALIDATION_FAILED');
    const client = clients.get(p.clientId);
    if (client && client.redirectUris.length && !client.redirectUris.includes(p.redirectUri))
      throw new ApiError('VALIDATION_FAILED', 'redirect_uri not registered.');
    const code = randomToken(24);
    codes.set(code, {
      subject,
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge,
      scope: p.scope.length ? p.scope : [...SCOPES],
      expiresAt: Date.now() + 5 * 60_000,
    });
    const redirect = new URL(p.redirectUri);
    redirect.searchParams.set('code', code);
    if (p.state) redirect.searchParams.set('state', p.state);
    return c.redirect(redirect.toString(), 302);
  });

  app.post('/dev/oauth/token', async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    const form = contentType.includes('application/json')
      ? ((await c.req.json()) as Record<string, string>)
      : Object.fromEntries(
          Object.entries(await c.req.parseBody()).map(([k, v]) => [
            k,
            typeof v === 'string' ? v : '',
          ]),
        );
    if (form.grant_type !== 'authorization_code')
      return c.json({ error: 'unsupported_grant_type' }, 400);
    const record = form.code ? codes.get(form.code) : undefined;
    if (!record || record.expiresAt < Date.now()) return c.json({ error: 'invalid_grant' }, 400);
    codes.delete(form.code as string);
    const verifier = form.code_verifier ?? '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (challenge !== record.codeChallenge)
      return c.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
    if (form.client_id && form.client_id !== record.clientId)
      return c.json({ error: 'invalid_client' }, 400);
    if (form.redirect_uri && form.redirect_uri !== record.redirectUri)
      return c.json({ error: 'invalid_grant' }, 400);
    const user = MOCK_USERS.find((u) => u.subject === record.subject);
    const minted = await mintLocalToken({
      secret: ctx.config.auth.localSecret,
      issuer,
      audience,
      subject: record.subject,
      clientId: record.clientId,
      scopes: record.scope,
      ttlSeconds: ctx.config.auth.tokenTtlSeconds,
      ...(user?.email ? { email: user.email } : {}),
      ...(user?.displayName ? { displayName: user.displayName } : {}),
    });
    return c.json(
      {
        access_token: minted.token,
        token_type: 'Bearer',
        expires_in: ctx.config.auth.tokenTtlSeconds,
        scope: record.scope.join(' '),
      },
      200,
    );
  });
}
