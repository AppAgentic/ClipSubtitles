import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { FfmpegCompositeRenderer, type Renderer } from '@clipsubtitles/render';
import {
  FileObjectStore,
  GcsObjectStore,
  PostgresStore,
  S3ObjectStore,
  SqliteStore,
  type DataStore,
  type ObjectStore,
} from '@clipsubtitles/storage';
import { createProviderRegistry, type ProviderRegistry } from '@clipsubtitles/transcription';
import { createIdentityProvider, type IdentityProvider } from './auth/identity-provider';
import { createRateLimiters, type RateLimiters } from './auth/ratelimit';
import { LocalTokenVerifier, WorkOSTokenVerifier, type TokenVerifier } from './auth/tokens';
import type { AppConfig } from './config';
import { createLogger, type Logger } from './logging';
import { createTaskDispatcher, type TaskDispatcher } from './tasks/dispatcher';
import { createBillingProvider, type BillingProvider } from './billing/provider';

export interface Clock {
  now(): number;
  iso(): string;
}

export interface AppContext {
  config: AppConfig;
  db: DataStore;
  store: ObjectStore;
  logger: Logger;
  providers: ProviderRegistry;
  renderer: Renderer;
  identity: IdentityProvider;
  verifier: TokenVerifier;
  limiters: RateLimiters;
  clock: Clock;
  taskDispatcher: TaskDispatcher;
  billing: BillingProvider;
}

export interface ContextOverrides {
  db?: DataStore;
  store?: ObjectStore;
  logger?: Logger;
  providers?: ProviderRegistry;
  renderer?: Renderer;
  identity?: IdentityProvider;
  verifier?: TokenVerifier;
  clock?: Clock;
  taskDispatcher?: TaskDispatcher;
  billing?: BillingProvider;
}

export function systemClock(): Clock {
  return { now: () => Date.now(), iso: () => new Date().toISOString() };
}

/** Test clock that can be advanced deterministically. */
export function manualClock(
  start = Date.parse('2026-08-29T10:00:00.000Z'),
): Clock & { advance(ms: number): void; set(ms: number): void } {
  let t = start;
  return {
    now: () => t,
    iso: () => new Date(t).toISOString(),
    advance: (ms) => {
      t += ms;
    },
    set: (ms) => {
      t = ms;
    },
  };
}

/**
 * Open the configured persistence adapter. SQLite is the local/test driver;
 * PostgreSQL uses a pooled connection whose credentials come from the injected
 * environment only — nothing here logs or persists the password.
 */
export async function openDataStore(config: AppConfig): Promise<DataStore> {
  if (config.database.driver === 'sqlite') {
    return SqliteStore.open({ path: config.database.path });
  }
  const pg = config.database.postgres;
  return PostgresStore.open({
    host: pg.host,
    port: pg.port,
    database: pg.database,
    user: pg.user,
    ...(pg.password !== undefined ? { password: pg.password } : {}),
    ...(pg.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
    max: pg.poolMax,
    connectionTimeoutMillis: pg.connectionTimeoutMs,
    statement_timeout: pg.statementTimeoutMs,
    application_name: 'clipsubtitles',
  });
}

export async function createAppContext(
  config: AppConfig,
  overrides: ContextOverrides = {},
): Promise<AppContext> {
  mkdirSync(config.dataDir, { recursive: true });
  mkdirSync(config.workDir, { recursive: true });
  const logger = overrides.logger ?? createLogger(config.logLevel, { service: 'clipsubtitles' });
  const db = overrides.db ?? (await openDataStore(config));
  const store =
    overrides.store ??
    (config.objectStore.driver === 'gcs'
      ? new GcsObjectStore({
          bucket: config.objectStore.bucket,
          cacheDir: path.join(config.workDir, 'object-cache'),
          ...(config.objectStore.prefix ? { prefix: config.objectStore.prefix } : {}),
        })
      : config.objectStore.driver === 'r2'
        ? new S3ObjectStore({
            bucket: config.objectStore.bucket,
            endpoint: config.objectStore.endpoint,
            accessKeyId: config.objectStore.accessKeyId,
            secretAccessKey: config.objectStore.secretAccessKey,
            cacheDir: path.join(config.workDir, 'object-cache'),
            ...(config.objectStore.prefix ? { prefix: config.objectStore.prefix } : {}),
          })
        : new FileObjectStore(config.objectStoreDir));
  const providers =
    overrides.providers ??
    createProviderRegistry({
      ...process.env,
      TRANSCRIPTION_PROVIDERS: config.transcription.providers.join(','),
    });
  const renderer =
    overrides.renderer ?? new FfmpegCompositeRenderer({ ffmpegPath: config.ffmpegPath });
  const identity = overrides.identity ?? createIdentityProvider(config);
  const verifier =
    overrides.verifier ??
    (config.auth.mode === 'workos' && config.auth.workos
      ? new WorkOSTokenVerifier(
          config.auth.workos.issuer,
          `https://api.workos.com/sso/jwks/${config.auth.workos.clientId}`,
          `${config.apiPublicUrl}/api/mcp`,
        )
      : new LocalTokenVerifier(
          config.auth.localSecret,
          config.apiPublicUrl,
          `${config.apiPublicUrl}/api/mcp`,
        ));
  return {
    config,
    db,
    store,
    logger,
    providers,
    renderer,
    identity,
    verifier,
    limiters: createRateLimiters({
      perMinute: config.limits.rateLimitPerMinute,
      previewsPerHour: config.limits.previewsPerHour,
    }),
    clock: overrides.clock ?? systemClock(),
    taskDispatcher: overrides.taskDispatcher ?? createTaskDispatcher(config),
    billing: overrides.billing ?? createBillingProvider(config.billing),
  };
}
