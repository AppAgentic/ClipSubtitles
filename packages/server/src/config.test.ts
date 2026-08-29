import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const base = {
  NODE_ENV: 'test',
  AUTH_LOCAL_SECRET: 'test-secret-that-is-at-least-32-characters',
};

describe('object store configuration', () => {
  it('requires the complete R2 credential set', () => {
    expect(() => loadConfig({ ...base, OBJECT_STORE: 'r2', R2_BUCKET: 'media' })).toThrowError(
      ConfigError,
    );
  });

  it('builds an R2 store configuration without exposing credentials elsewhere', () => {
    const config = loadConfig({
      ...base,
      OBJECT_STORE: 'r2',
      R2_BUCKET: 'clipsubtitles-media',
      R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
      R2_ACCESS_KEY_ID: 'access-id',
      R2_SECRET_ACCESS_KEY: 'secret-value',
      R2_PREFIX: 'production',
    });
    expect(config.objectStore).toEqual({
      driver: 'r2',
      bucket: 'clipsubtitles-media',
      endpoint: 'https://example.r2.cloudflarestorage.com',
      accessKeyId: 'access-id',
      secretAccessKey: 'secret-value',
      prefix: 'production',
    });
  });
});

describe('database configuration', () => {
  it('requires complete PostgreSQL connection coordinates', () => {
    expect(() => loadConfig({ ...base, DB_DRIVER: 'postgres' })).toThrowError(
      'DB_DRIVER=postgres requires POSTGRES_HOST, POSTGRES_DATABASE, and POSTGRES_USER',
    );
  });

  it('builds PostgreSQL configuration without copying the password outside the database block', () => {
    const config = loadConfig({
      ...base,
      DB_DRIVER: 'postgres',
      POSTGRES_HOST: '/cloudsql/example:europe-west2:clipsubtitles',
      POSTGRES_DATABASE: 'clipsubtitles',
      POSTGRES_USER: 'clipsubtitles-api',
      POSTGRES_PASSWORD: 'injected-secret',
    });
    expect(config.database).toMatchObject({
      driver: 'postgres',
      postgres: {
        host: '/cloudsql/example:europe-west2:clipsubtitles',
        database: 'clipsubtitles',
        user: 'clipsubtitles-api',
        password: 'injected-secret',
      },
    });
    expect(
      JSON.stringify({ ...config, database: { driver: config.database.driver } }),
    ).not.toContain('injected-secret');
  });
});
