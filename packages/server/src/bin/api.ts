import path from 'node:path';
import { serve } from '@hono/node-server';
import { loadConfig } from '../config';
import { createAppContext } from '../context';
import { findRepoRoot, loadDotEnv } from '../env';
import { createApp } from '../http/app';

loadDotEnv();
if (!process.env.DATA_DIR) process.env.DATA_DIR = path.join(findRepoRoot(), '.data');
const config = loadConfig();
const ctx = createAppContext(config);
const app = createApp(ctx);

const server = serve({ fetch: app.fetch, port: config.apiPort, hostname: '0.0.0.0' }, (info) => {
  ctx.logger.info('api listening', { port: info.port, apiPublicUrl: config.apiPublicUrl, authMode: config.auth.mode, providers: config.transcription.providers, renderer: ctx.renderer.id });
  console.log(`ClipSubtitles API  → ${config.apiPublicUrl}  (auth: ${config.auth.mode}, providers: ${config.transcription.providers.join(',')})`);
  console.log(`MCP endpoint       → ${config.apiPublicUrl}/api/mcp`);
  console.log(`OpenAPI            → ${config.apiPublicUrl}/openapi.json`);
});

function shutdown(signal: string): void {
  ctx.logger.info('shutting down', { signal });
  server.close(() => {
    ctx.db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
