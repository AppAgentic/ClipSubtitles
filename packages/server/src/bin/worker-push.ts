import path from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { loadConfig } from '../config';
import { createAppContext } from '../context';
import { findRepoRoot, loadDotEnv } from '../env';
import { flushTaskDispatchOutbox } from '../services/task-dispatch';
import { TaskWorker } from '../worker/worker';

loadDotEnv();
if (!process.env.DATA_DIR) process.env.DATA_DIR = path.join(findRepoRoot(), '.data');
const config = loadConfig();
if (config.tasks.driver !== 'cloud-tasks')
  throw new Error('worker-push requires TASK_DISPATCHER=cloud-tasks');
const taskConfig = config.tasks;
const ctx = await createAppContext(config);
const worker = new TaskWorker(ctx);
const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true, service: 'clipsubtitles-worker', mode: 'push' }));
app.post('/internal/tasks/:taskId', async (c) => {
  const queue = c.req.header('x-cloudtasks-queuename');
  const taskName = c.req.header('x-cloudtasks-taskname');
  if (queue !== taskConfig.queue || !taskName)
    return c.json({ error: 'cloud_tasks_headers_required' }, 403);
  const outcome = await worker.runTaskById(c.req.param('taskId'));
  if (outcome === 'retry' || outcome === 'busy')
    return c.json({ outcome }, 503, { 'Retry-After': '2' });
  return c.body(null, 204);
});
app.post('/internal/maintenance', async (c) => {
  const scheduler = c.req.header('x-cloudscheduler');
  const jobName = c.req.header('x-cloudscheduler-jobname');
  if (scheduler !== 'true' || !jobName)
    return c.json({ error: 'cloud_scheduler_headers_required' }, 403);
  await worker.maintenance(true);
  const outbox = await flushTaskDispatchOutbox(ctx, 1_000);
  return c.json({ ok: true, outbox }, 200);
});

const server = serve({ fetch: app.fetch, port: config.apiPort, hostname: '0.0.0.0' });
let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  void worker.stop().finally(() => {
    server.close(() => {
      void ctx.db.close().finally(() => process.exit(0));
    });
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
