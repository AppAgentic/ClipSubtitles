import { mkdirSync } from 'node:fs';
import { FfmpegCompositeRenderer, type Renderer } from '@clipsubtitles/render';
import { FileObjectStore, openDatabase, type Db, type ObjectStore } from '@clipsubtitles/storage';
import { createProviderRegistry, type ProviderRegistry } from '@clipsubtitles/transcription';
import { createIdentityProvider, type IdentityProvider } from './auth/identity-provider';
import { createRateLimiters, type RateLimiters } from './auth/ratelimit';
import { LocalTokenVerifier, WorkOSTokenVerifier, type TokenVerifier } from './auth/tokens';
import type { AppConfig } from './config';
import { createLogger, type Logger } from './logging';

export interface Clock {
  now(): number;
  iso(): string;
}

export interface AppContext {
  config: AppConfig;
  db: Db;
  store: ObjectStore;
  logger: Logger;
  providers: ProviderRegistry;
  renderer: Renderer;
  identity: IdentityProvider;
  verifier: TokenVerifier;
  limiters: RateLimiters;
  clock: Clock;
}

export interface ContextOverrides {
  db?: Db;
  store?: ObjectStore;
  logger?: Logger;
  providers?: ProviderRegistry;
  renderer?: Renderer;
  identity?: IdentityProvider;
  verifier?: TokenVerifier;
  clock?: Clock;
}

export function systemClock(): Clock {
  return { now: () => Date.now(), iso: () => new Date().toISOString() };
}

/** Test clock that can be advanced deterministically. */
export function manualClock(start = Date.parse('2026-08-29T10:00:00.000Z')): Clock & { advance(ms: number): void; set(ms: number): void } {
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

export function createAppContext(config: AppConfig, overrides: ContextOverrides = {}): AppContext {
  mkdirSync(config.dataDir, { recursive: true });
  mkdirSync(config.workDir, { recursive: true });
  const logger = overrides.logger ?? createLogger(config.logLevel, { service: 'clipsubtitles' });
  const db = overrides.db ?? openDatabase({ path: config.dbPath });
  const store = overrides.store ?? new FileObjectStore(config.objectStoreDir);
  const providers = overrides.providers ?? createProviderRegistry({ ...process.env, TRANSCRIPTION_PROVIDERS: config.transcription.providers.join(',') });
  const renderer = overrides.renderer ?? new FfmpegCompositeRenderer({ ffmpegPath: config.ffmpegPath });
  const identity = overrides.identity ?? createIdentityProvider(config);
  const verifier =
    overrides.verifier ??
    (config.auth.mode === 'workos' && config.auth.workos
      ? new WorkOSTokenVerifier(config.auth.workos.issuer, `https://api.workos.com/sso/jwks/${config.auth.workos.clientId}`)
      : new LocalTokenVerifier(config.auth.localSecret, config.apiPublicUrl, `${config.apiPublicUrl}/api/mcp`));
  return {
    config,
    db,
    store,
    logger,
    providers,
    renderer,
    identity,
    verifier,
    limiters: createRateLimiters({ perMinute: config.limits.rateLimitPerMinute, previewsPerHour: config.limits.previewsPerHour }),
    clock: overrides.clock ?? systemClock(),
  };
}
