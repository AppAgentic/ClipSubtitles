import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createHarness, type Harness } from './harness';
import { WIDGET_UPLOAD_MAX_BYTES } from '../mcp/upload-tool';

let h: Harness, client: Client, baseUrl: string, close: () => Promise<void>, video: Buffer;
async function connect(subject: string, readOnly = false) {
  const c = new Client({ name: 'widget-upload-test', version: '1' });
  const bearer = await h.token(subject, readOnly ? ['captions:read'] : ['captions:read', 'captions:write']);
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/mcp`), { requestInit: { headers: { authorization: `Bearer ${bearer}` } } });
  await c.connect(transport as unknown as Parameters<Client['connect']>[0]);
  return c;
}
function target(result: CallToolResult) { return result._meta!.uploadTarget as { url: string; uploadId: string; projectId: string; maxBytes: number }; }
function projectId(result: CallToolResult) { return (result.structuredContent!.project as { id: string }).id; }
const args = (key: string) => ({ title: 'Widget upload test', fileName: 'native.mp4', mimeType: 'video/mp4', bytes: video.length, idempotencyKey: key });
async function prepare(key: string, extra = {}) { return await client.callTool({ name: 'prepare_caption_upload', arguments: { ...args(key), ...extra } }) as CallToolResult; }
function code(result: CallToolResult) { return JSON.parse((result.content[0] as { text: string }).text).error.code; }
beforeAll(async () => {
  h = await createHarness(); const listening = await h.listen(); baseUrl = listening.baseUrl; close = listening.close;
  client = await connect('mock|widget-upload'); video = await readFile(await h.makeSourceVideo('native.mp4', 2));
});
afterAll(async () => { await client.close(); await close(); await h.cleanup(); });

describe('private native widget uploads', () => {
  it('hides the signed capability, scopes CORS, and uploads a real MP4 exactly once', async () => {
    const result = await prepare('native-upload-1'); expect(result.isError).not.toBe(true);
    const upload = target(result), url = new URL(upload.url);
    expect(upload.projectId).toBe(projectId(result));
    const visible = JSON.stringify({ content: result.content, structuredContent: result.structuredContent });
    expect(visible).not.toContain(url.searchParams.get('sig'));
    expect(visible).not.toContain('/v1/uploads/');
    expect(visible).not.toContain(upload.uploadId);
    const record = await h.ctx.db.getUpload(url.searchParams.get('ws')!, upload.uploadId);
    expect(record!.maxBytes).toBe(WIDGET_UPLOAD_MAX_BYTES);
    expect(h.ctx.config.limits.maxUploadBytes).toBeGreaterThan(WIDGET_UPLOAD_MAX_BYTES);
    const preflight = await fetch(upload.url, { method: 'OPTIONS', headers: { origin: 'null', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    expect(preflight.headers.get('access-control-allow-methods')).toContain('PUT');
    expect(preflight.headers.get('access-control-allow-credentials')).toBeNull();
    const unrelated = await fetch(`${baseUrl}/v1/projects`, { method: 'OPTIONS', headers: { origin: 'null', 'access-control-request-method': 'POST' } });
    expect(unrelated.headers.get('access-control-allow-origin')).toBeNull();
    const put = await fetch(upload.url, { method: 'PUT', headers: { origin: 'null', 'content-type': 'video/mp4' }, body: new Uint8Array(video) });
    expect(put.status).toBe(200); expect(put.headers.get('access-control-allow-origin')).toBe('*');
    const body = await put.json() as { asset: { status: string; bytes: number } };
    expect(body.asset.status).toBe('ready'); expect(body.asset.bytes).toBe(video.length);
    expect((await h.app.request(`${url.pathname}${url.search}`, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: new Uint8Array(video) })).status).toBe(409);
    const completed = await prepare('native-ready-recovery', { projectId: projectId(result) });
    expect(completed.structuredContent!.status).toBe('already_uploaded');
    expect(projectId(completed)).toBe(projectId(result));
    expect(completed._meta).toBeUndefined();
  });
  it('rejects oversize before creating a project and persists the server byte cap', async () => {
    const created = await prepare('cap-fixture'); const upload = target(created), url = new URL(upload.url);
    const ws = url.searchParams.get('ws')!; const before = (await h.ctx.db.listProjects(ws)).length;
    const tooLarge = await prepare('too-large', { bytes: WIDGET_UPLOAD_MAX_BYTES + 1 });
    expect(tooLarge.isError).toBe(true); expect(code(tooLarge)).toBe('PAYLOAD_TOO_LARGE');
    expect(tooLarge._meta).toBeUndefined(); expect(tooLarge.structuredContent).toBeUndefined();
    expect((await h.ctx.db.listProjects(ws)).length).toBe(before);
    const declared = await h.app.request(`${url.pathname}${url.search}`, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(WIDGET_UPLOAD_MAX_BYTES + 1) }, body: new Uint8Array([1]) });
    expect(declared.status).toBe(413);
  });
  it('enforces write scope, workspace ownership and signature validation', async () => {
    const own = await prepare('own-project');
    const readonly = await connect('mock|widget-readonly', true), other = await connect('mock|widget-other');
    try {
      const denied = await readonly.callTool({ name: 'prepare_caption_upload', arguments: args('read-only') }) as CallToolResult;
      expect(code(denied)).toBe('INSUFFICIENT_SCOPE');
      const foreign = await other.callTool({ name: 'prepare_caption_upload', arguments: { ...args('foreign-upload'), projectId: projectId(own) } }) as CallToolResult;
      expect(code(foreign)).toBe('NOT_FOUND'); expect(foreign._meta).toBeUndefined();
      const tampered = new URL(target(own).url); tampered.searchParams.set('ws', 'other-workspace');
      const put = await fetch(tampered, { method: 'PUT', headers: { origin: 'null', 'content-type': 'video/mp4' }, body: new Uint8Array(video) });
      expect(put.status).toBe(401); expect(put.headers.get('access-control-allow-origin')).toBe('*');
    } finally { await readonly.close(); await other.close(); }
  });
  it('replays preparation without duplicates and renews expired or failed uploads on the same project', async () => {
    const first = await prepare('retry-start'); const again = await prepare('retry-start');
    expect(projectId(again)).toBe(projectId(first)); expect(target(again).url).toBe(target(first).url);
    const oldTime = h.clock.now();
    try {
      h.clock.advance(3601000);
      const expired = await fetch(target(first).url, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: new Uint8Array(video) });
      expect(expired.status).toBe(401);
      const fresh = await prepare('retry-fresh', { projectId: projectId(first) });
      expect(projectId(fresh)).toBe(projectId(first)); expect(target(fresh).url).not.toBe(target(first).url);
      const invalid = await fetch(target(fresh).url, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: new Uint8Array([1, 2, 3]) });
      expect(invalid.status).toBe(415);
      const recovered = await prepare('retry-after-invalid', { projectId: projectId(first) });
      expect(projectId(recovered)).toBe(projectId(first));
      const put = await fetch(target(recovered).url, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: new Uint8Array(video) });
      expect(put.status).toBe(200);
    } finally { h.clock.advance(oldTime - h.clock.now()); }
  });
});
