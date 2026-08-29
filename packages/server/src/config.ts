import path from 'node:path';
import { z } from 'zod';
import { createProxyTrust } from './auth/client-ip';

const boolish = z
  .string()
  .optional()
  .transform((v) => v === '1' || v === 'true' || v === 'yes');

const intish = (fallback: number, min = 0) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v === undefined || v === '' ? fallback : Number(v);
      return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
    });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  DATA_DIR: z.string().default('.data'),
  API_PORT: intish(3101, 1),
  API_PUBLIC_URL: z.string().default('http://localhost:3101'),
  WEB_PUBLIC_URL: z.string().default('http://localhost:3100'),
  AUTH_MODE: z.enum(['mock', 'workos']).default('mock'),
  AUTH_LOCAL_SECRET: z.string().default('local-dev-secret-change-me-please-0123456789'),
  WORKOS_API_KEY: z.string().optional(),
  WORKOS_CLIENT_ID: z.string().optional(),
  WORKOS_AUTHKIT_ISSUER: z.string().optional(),
  WORKOS_REDIRECT_URI: z.string().optional(),
  WORKOS_WEBHOOK_SECRET: z.string().optional(),
  TRANSCRIPTION_PROVIDERS: z.string().default('mock'),
  RENDERER: z.enum(['ffmpeg', 'remotion']).default('ffmpeg'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  MAX_UPLOAD_BYTES: intish(500 * 1024 * 1024, 1),
  MAX_SOURCE_DURATION_SECONDS: intish(600, 1),
  MAX_REMOTE_SOURCE_BYTES: intish(500 * 1024 * 1024, 1),
  ALLOW_PRIVATE_SOURCE_URLS: boolish,
  SOURCE_RETENTION_DAYS: intish(30, 1),
  EXPORT_RETENTION_DAYS: intish(7, 1),
  SIGNED_URL_TTL_SECONDS: intish(900, 30),
  QUOTE_TTL_SECONDS: intish(900, 30),
  RATE_LIMIT_PER_MINUTE: intish(120, 1),
  PREVIEWS_PER_HOUR: intish(30, 1),
  INITIAL_CREDIT_GRANT: intish(500, 0),
  MAX_JSON_BODY_BYTES: intish(1024 * 1024, 1024),
  WORKER_POLL_MS: intish(500, 50),
  WORKER_LEASE_MS: intish(60_000, 5_000),
  /** Comma-separated proxy IPs/CIDRs whose forwarding headers may be trusted. Empty = never trust X-Forwarded-For / X-Real-IP. */
  TRUSTED_PROXIES: z.string().default(''),
});

export interface WorkOSConfig {
  apiKey: string;
  clientId: string;
  issuer: string;
  redirectUri: string;
  webhookSecret?: string;
}

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  dataDir: string;
  dbPath: string;
  objectStoreDir: string;
  workDir: string;
  apiPort: number;
  apiPublicUrl: string;
  webPublicUrl: string;
  auth: {
    mode: 'mock' | 'workos';
    localSecret: string;
    workos: WorkOSConfig | null;
    sessionTtlSeconds: number;
    tokenTtlSeconds: number;
  };
  transcription: { providers: string[] };
  renderer: 'ffmpeg' | 'remotion';
  ffmpegPath: string;
  ffprobePath: string;
  limits: {
    maxUploadBytes: number;
    maxSourceDurationMs: number;
    maxRemoteSourceBytes: number;
    allowPrivateSourceUrls: boolean;
    sourceRetentionDays: number;
    exportRetentionDays: number;
    signedUrlTtlSeconds: number;
    quoteTtlSeconds: number;
    rateLimitPerMinute: number;
    previewsPerHour: number;
    initialCreditGrant: number;
    maxJsonBodyBytes: number;
  };
  worker: { pollMs: number; leaseMs: number };
  /**
   * Proxy addresses/CIDRs whose X-Forwarded-For / X-Real-IP headers are
   * honoured for client-IP resolution. Empty (the default) means the socket
   * peer is always the client — forwarding headers are never trusted.
   */
  trustedProxies: string[];
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) throw new ConfigError(`Invalid environment: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  const e = parsed.data;
  const dataDir = path.resolve(e.DATA_DIR);
  let workos: WorkOSConfig | null = null;
  if (e.AUTH_MODE === 'workos') {
    if (!e.WORKOS_API_KEY || !e.WORKOS_CLIENT_ID || !e.WORKOS_AUTHKIT_ISSUER) {
      throw new ConfigError('AUTH_MODE=workos requires WORKOS_API_KEY, WORKOS_CLIENT_ID, and WORKOS_AUTHKIT_ISSUER.');
    }
    workos = {
      apiKey: e.WORKOS_API_KEY,
      clientId: e.WORKOS_CLIENT_ID,
      issuer: e.WORKOS_AUTHKIT_ISSUER.replace(/\/$/, ''),
      // The callback is reached through the web origin (proxied to the API) so the session cookie lands on the web host.
      redirectUri: e.WORKOS_REDIRECT_URI ?? `${e.WEB_PUBLIC_URL.replace(/\/$/, '')}/auth/callback`,
      ...(e.WORKOS_WEBHOOK_SECRET ? { webhookSecret: e.WORKOS_WEBHOOK_SECRET } : {}),
    };
  }
  if (e.NODE_ENV === 'production' && e.AUTH_LOCAL_SECRET.startsWith('local-dev-secret')) {
    throw new ConfigError('AUTH_LOCAL_SECRET must be set to a strong secret in production.');
  }
  if (e.AUTH_LOCAL_SECRET.length < 32) throw new ConfigError('AUTH_LOCAL_SECRET must be at least 32 characters.');
  const trustedProxies = e.TRUSTED_PROXIES.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    createProxyTrust(trustedProxies);
  } catch (err) {
    throw new ConfigError(`TRUSTED_PROXIES: ${err instanceof Error ? err.message : String(err)}`);
  }
  return {
    env: e.NODE_ENV,
    logLevel: e.LOG_LEVEL,
    dataDir,
    dbPath: path.join(dataDir, 'clipsubtitles.sqlite'),
    objectStoreDir: path.join(dataDir, 'objects'),
    workDir: path.join(dataDir, 'work'),
    apiPort: e.API_PORT,
    apiPublicUrl: e.API_PUBLIC_URL.replace(/\/$/, ''),
    webPublicUrl: e.WEB_PUBLIC_URL.replace(/\/$/, ''),
    auth: {
      mode: e.AUTH_MODE,
      localSecret: e.AUTH_LOCAL_SECRET,
      workos,
      sessionTtlSeconds: 7 * 24 * 3600,
      tokenTtlSeconds: 3600,
    },
    transcription: { providers: e.TRANSCRIPTION_PROVIDERS.split(',').map((s) => s.trim()).filter(Boolean) },
    renderer: e.RENDERER,
    ffmpegPath: e.FFMPEG_PATH,
    ffprobePath: e.FFPROBE_PATH,
    limits: {
      maxUploadBytes: e.MAX_UPLOAD_BYTES,
      maxSourceDurationMs: e.MAX_SOURCE_DURATION_SECONDS * 1000,
      maxRemoteSourceBytes: e.MAX_REMOTE_SOURCE_BYTES,
      allowPrivateSourceUrls: e.ALLOW_PRIVATE_SOURCE_URLS,
      sourceRetentionDays: e.SOURCE_RETENTION_DAYS,
      exportRetentionDays: e.EXPORT_RETENTION_DAYS,
      signedUrlTtlSeconds: e.SIGNED_URL_TTL_SECONDS,
      quoteTtlSeconds: e.QUOTE_TTL_SECONDS,
      rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
      previewsPerHour: e.PREVIEWS_PER_HOUR,
      initialCreditGrant: e.INITIAL_CREDIT_GRANT,
      maxJsonBodyBytes: e.MAX_JSON_BODY_BYTES,
    },
    worker: { pollMs: e.WORKER_POLL_MS, leaseMs: e.WORKER_LEASE_MS },
    trustedProxies,
  };
}

/** Config for tests: isolated temp data dir, mock auth, mock transcription. */
export function testConfig(overrides: Partial<NodeJS.ProcessEnv> & { DATA_DIR: string }): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    AUTH_MODE: 'mock',
    TRANSCRIPTION_PROVIDERS: 'mock',
    RATE_LIMIT_PER_MINUTE: '1000',
    PREVIEWS_PER_HOUR: '1000',
    QUOTE_TTL_SECONDS: '900',
    ...overrides,
  });
}
