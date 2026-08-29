import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { serve, type ServerType } from '@hono/node-server';
import { SCOPES, type Scope } from '@clipsubtitles/contracts';
import { openDatabase } from '@clipsubtitles/storage';
import { BENCHMARK_CASES, buildFixtures, defaultFixturesDir, runTool } from '@clipsubtitles/transcription';
import { mintLocalToken } from '../auth/tokens';
import { testConfig, type AppConfig } from '../config';
import { createAppContext, manualClock, type AppContext } from '../context';
import { createApp, type App } from '../http/app';
import { TaskWorker } from '../worker/worker';

export interface Harness {
  dir: string;
  config: AppConfig;
  ctx: AppContext;
  app: App;
  worker: TaskWorker;
  clock: ReturnType<typeof manualClock>;
  token(subject?: string, scopes?: Scope[], clientId?: string): Promise<string>;
  api<T = unknown>(method: string, path: string, opts?: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: RequestInit['body'] }): Promise<{ status: number; body: T; headers: Headers }>;
  runTasks(max?: number): Promise<number>;
  makeSourceVideo(name?: string, seconds?: number): Promise<string>;
  ensureDemoFixture(): Promise<string>;
  listen(): Promise<{ baseUrl: string; close: () => Promise<void> }>;
  cleanup(): Promise<void>;
}

/** Reserve a free loopback port so signed URLs and OAuth metadata point at the test server. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

export async function createHarness(overrides: Partial<NodeJS.ProcessEnv> = {}): Promise<Harness> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'clipsubtitles-server-'));
  const port = await freePort();
  const config = testConfig({
    DATA_DIR: dir,
    ALLOW_PRIVATE_SOURCE_URLS: 'true',
    API_PORT: String(port),
    API_PUBLIC_URL: `http://127.0.0.1:${port}`,
    WEB_PUBLIC_URL: 'http://127.0.0.1:3100',
    ...overrides,
  });
  const clock = manualClock(Date.now());
  const ctx = createAppContext(config, { db: openDatabase({ path: ':memory:' }), clock });
  const app = createApp(ctx);
  const worker = new TaskWorker(ctx, { workerId: 'worker_test', heartbeatMs: 50, leaseMs: 30_000, pollMs: 5, maintenanceEveryMs: 0, retentionEveryMs: 3_600_000 });
  const servers: ServerType[] = [];

  const harness: Harness = {
    dir,
    config,
    ctx,
    app,
    worker,
    clock,
    async token(subject = 'mock|joe', scopes = [...SCOPES], clientId = 'test-client') {
      const { token } = await mintLocalToken({
        secret: config.auth.localSecret,
        issuer: config.apiPublicUrl,
        audience: `${config.apiPublicUrl}/api/mcp`,
        subject,
        clientId,
        scopes,
        ttlSeconds: 3600,
        email: `${subject.replace(/[^a-z]/gi, '')}@example.com`,
      });
      return token;
    },
    async api(method, p, opts = {}) {
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      if (opts.token) headers.authorization = `Bearer ${opts.token}`;
      let body: RequestInit['body'] | undefined = opts.raw;
      if (opts.body !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(opts.body);
      }
      const res = await app.request(p, { method, headers, ...(body !== undefined ? { body } : {}) });
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      return { status: res.status, body: parsed as never, headers: res.headers };
    },
    async runTasks(max = 20) {
      let ran = 0;
      for (let i = 0; i < max; i += 1) {
        if (!(await worker.runOnce())) break;
        ran += 1;
      }
      return ran;
    },
    async makeSourceVideo(name = 'source.mp4', seconds = 2) {
      const out = path.join(dir, name);
      await runTool('ffmpeg', [
        '-hide_banner', '-nostdin', '-y',
        '-f', 'lavfi', '-i', `testsrc2=size=320x568:rate=30:duration=${seconds}`,
        '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out,
      ]);
      return out;
    },
    async ensureDemoFixture() {
      const demo = BENCHMARK_CASES.find((c) => c.id === 'clean-en-product-demo')!;
      const built = await buildFixtures({ outDir: defaultFixturesDir(), cases: [demo] });
      return built[0]!.demoVideoPath as string;
    },
    async listen() {
      const server = serve({ fetch: app.fetch, port: config.apiPort, hostname: '127.0.0.1' });
      servers.push(server);
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      return {
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
      };
    },
    async cleanup() {
      await worker.stop();
      for (const s of servers) await new Promise<void>((resolve) => s.close(() => resolve()));
      ctx.db.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
  return harness;
}
