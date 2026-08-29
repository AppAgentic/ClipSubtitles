import path from 'node:path';
import { loadConfig } from '../config';
import { createAppContext } from '../context';
import { findRepoRoot, loadDotEnv } from '../env';
import { TaskWorker } from '../worker/worker';

loadDotEnv();
if (!process.env.DATA_DIR) process.env.DATA_DIR = path.join(findRepoRoot(), '.data');
const config = loadConfig();
// The Remotion renderer is loaded lazily so the default worker never pulls React/Chromium tooling.
const overrides =
  config.renderer === 'remotion'
    ? { renderer: new (await import('@clipsubtitles/render-remotion')).RemotionRenderer() }
    : {};
const ctx = createAppContext(config, overrides);
const worker = new TaskWorker(ctx);
worker.start();
console.log(`ClipSubtitles worker ${worker.workerId} started (renderer: ${ctx.renderer.id}, providers: ${config.transcription.providers.join(',')})`);

async function shutdown(signal: string): Promise<void> {
  ctx.logger.info('worker shutting down', { signal });
  await worker.stop();
  ctx.db.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
