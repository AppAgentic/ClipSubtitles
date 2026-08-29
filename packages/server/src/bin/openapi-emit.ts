import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openDatabase } from '@clipsubtitles/storage';
import { testConfig } from '../config';
import { createAppContext } from '../context';
import { findRepoRoot } from '../env';
import { createApp } from '../http/app';

/** Emit docs/api/openapi.json from the live route definitions. */
async function main(): Promise<void> {
  const root = findRepoRoot();
  const config = testConfig({ DATA_DIR: path.join(root, '.data', 'openapi-emit'), API_PUBLIC_URL: 'https://api.clipsubtitles.com', WEB_PUBLIC_URL: 'https://clipsubtitles.com' });
  const ctx = createAppContext(config, { db: openDatabase({ path: ':memory:' }) });
  const app = createApp(ctx);
  const res = await app.request('/openapi.json');
  const doc = await res.json();
  const out = path.join(root, 'docs', 'api', 'openapi.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`Wrote ${out} (${Object.keys((doc as { paths: Record<string, unknown> }).paths).length} paths)`);
  ctx.db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
