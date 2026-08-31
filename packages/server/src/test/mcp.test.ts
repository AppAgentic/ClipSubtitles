import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  MCP_TOOL_NAMES,
  type CaptionProject,
  type RenderQuote,
  type Task,
} from '@clipsubtitles/contracts';
import { createHarness, type Harness } from './harness';

let h: Harness;
let baseUrl: string;
let closeServer: () => Promise<void>;

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: 'conformance-test', version: '0.0.1' });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  // SDK option types omit `| undefined`; the runtime contract is unaffected.
  await client.connect(transport as unknown as Parameters<Client['connect']>[0]);
  return client;
}

function structured<T>(result: Awaited<ReturnType<Client['callTool']>>): T {
  return result.structuredContent as T;
}

/** Tool errors are returned as a JSON error envelope in text content (never as structuredContent). */
function toolError(result: Awaited<ReturnType<Client['callTool']>>): {
  error: { code: string; message: string; errorRef?: string };
} {
  const content = result.content as Array<{ type: string; text?: string }>;
  return JSON.parse(content[0]?.text ?? '{}') as {
    error: { code: string; message: string; errorRef?: string };
  };
}

beforeAll(async () => {
  h = await createHarness();
  const listening = await h.listen();
  baseUrl = listening.baseUrl;
  closeServer = listening.close;
  await h.ensureDemoFixture();
});

afterAll(async () => {
  await closeServer();
  await h.cleanup();
});

describe('MCP conformance', () => {
  it('requires a bearer token and advertises resource metadata', async () => {
    const res = await fetch(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata="');
    const metaUrl = /resource_metadata="([^"]+)"/.exec(
      res.headers.get('www-authenticate') ?? '',
    )?.[1];
    const meta = await fetch(metaUrl!).then(
      (r) => r.json() as Promise<{ resource: string; authorization_servers: string[] }>,
    );
    expect(meta.resource).toBe(`${h.config.apiPublicUrl}/api/mcp`);
    expect(meta.authorization_servers.length).toBe(1);
  });

  it('lists exactly the nine contracted tools with annotations and schemas', async () => {
    const client = await connect(await h.token());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations?.title).toBeTruthy();
      expect(typeof tool.annotations?.readOnlyHint).toBe('boolean');
    }
    const getProject = tools.find((t) => t.name === 'get_caption_project')!;
    expect(getProject.annotations?.readOnlyHint).toBe(true);
    expect(
      (getProject.inputSchema as { additionalProperties?: boolean }).additionalProperties,
    ).toBe(false);
    await client.close();
  });

  it('lets an agent inspect every preset and bounded style control before editing', async () => {
    const client = await connect(await h.token('mock|style-reader', ['captions:read']));
    const catalog = structured<{
      presets: Array<{ preset: string; fontFamily: string; emoji: { mode: string } }>;
      guidance: string[];
    }>(await client.callTool({ name: 'get_caption_style_catalog', arguments: {} }));
    expect(catalog.presets).toHaveLength(13);
    expect(new Set(catalog.presets.map((preset) => preset.fontFamily)).size).toBe(5);
    expect(catalog.presets.every((preset) => preset.emoji.mode === 'off')).toBe(true);
    expect(catalog.guidance.join(' ')).toContain('SRT/VTT');
    await client.close();
  });

  it('returns bounded tool errors instead of throwing', async () => {
    const client = await connect(await h.token());
    const notFound = await client.callTool({
      name: 'get_caption_task',
      arguments: { taskId: 'task_00000000000000000000' },
    });
    expect(notFound.isError).toBe(true);
    expect(notFound.structuredContent).toBeUndefined();
    expect(toolError(notFound).error.code).toBe('NOT_FOUND');
    expect(toolError(notFound).error.errorRef).toMatch(/^err_/);
    const invalid = await client.callTool({
      name: 'get_caption_project',
      arguments: { projectId: 'nope', userId: 'u1' },
    });
    expect(invalid.isError).toBe(true);
    await client.close();
  });

  it('enforces scopes per tool', async () => {
    const client = await connect(await h.token('mock|joe', ['captions:read']));
    const res = await client.callTool({
      name: 'create_caption_project',
      arguments: { title: 'x' },
    });
    expect(res.isError).toBe(true);
    expect(toolError(res).error.code).toBe('INSUFFICIENT_SCOPE');
    await client.close();
  });

  it('runs the full agent workflow: create -> upload link -> generate -> inspect -> edit -> quote -> approve -> render -> download', async () => {
    const token = await h.token();
    const client = await connect(token);

    const created = structured<{
      project: { id: string; status: string };
      uploadTarget?: { webUploadUrl: string };
      nextSteps: string[];
    }>(
      await client.callTool({
        name: 'create_caption_project',
        arguments: { title: 'Agent flow', idempotencyKey: 'mcp-create-1' },
      }),
    );
    expect(created.project.status).toBe('awaiting_source');
    expect(created.uploadTarget?.webUploadUrl).toBe(
      `http://127.0.0.1:3100/studio/${created.project.id}/upload`,
    );
    const replay = structured<{ project: { id: string } }>(
      await client.callTool({
        name: 'create_caption_project',
        arguments: { title: 'Agent flow', idempotencyKey: 'mcp-create-1' },
      }),
    );
    expect(replay.project.id).toBe(created.project.id);

    // The human uploads via the web surface; here we use the local fixture helper instead.
    const fixture = await h.api<{ project: CaptionProject }>(
      'POST',
      '/dev/fixtures/clean-en-product-demo/projects',
      { token },
    );
    expect(fixture.status).toBe(201);
    const projectId = fixture.body.project.id;

    const gen = structured<{ task: { id: string } }>(
      await client.callTool({
        name: 'generate_captions',
        arguments: { projectId, preset: 'bold-pop', idempotencyKey: 'mcp-gen-1' },
      }),
    );
    await h.runTasks();
    const genDone = structured<{ task: Task }>(
      await client.callTool({ name: 'get_caption_task', arguments: { taskId: gen.task.id } }),
    );
    expect(genDone.task.status).toBe('succeeded');
    expect(genDone.task.result?.kind).toBe('generate_captions');

    const view = structured<{ project: CaptionProject }>(
      await client.callTool({
        name: 'get_caption_project',
        arguments: { projectId, words: true, wordsLimit: 5 },
      }),
    );
    expect(view.project.pages!.length).toBeGreaterThan(3);
    expect(view.project.transcript?.words?.length).toBe(5);
    expect(view.project.pages![0]!.text).toContain('Welcome');
    expect(view.project.style.preset).toBe('bold-pop');

    const firstWord = view.project.transcript!.words![0]!;
    const edited = structured<{ project: CaptionProject; applied: number }>(
      await client.callTool({
        name: 'update_caption_project',
        arguments: {
          projectId,
          expectedVersion: view.project.version,
          ops: [
            { op: 'replace_word_text', wordId: firstWord.id, text: 'Welcome,' },
            { op: 'set_position', position: 'bottom' },
          ],
        },
      }),
    );
    expect(edited.applied).toBe(2);
    expect(edited.project.version).toBe(view.project.version + 1);
    expect(edited.project.pages![0]!.text.startsWith('Welcome,')).toBe(true);

    const preview = structured<{ task: { id: string } }>(
      await client.callTool({
        name: 'render_caption_preview',
        arguments: { projectId, durationMs: 1500, resolution: '360p' },
      }),
    );
    await h.runTasks();
    const previewDone = structured<{
      task: Task;
      exports?: Array<{ kind: string; downloadUrl?: string }>;
    }>(await client.callTool({ name: 'get_caption_task', arguments: { taskId: preview.task.id } }));
    expect(previewDone.task.status).toBe('succeeded');
    expect(previewDone.exports?.[0]?.kind).toBe('preview');

    const quoted = structured<{
      status: string;
      quote: RenderQuote;
      approvalInstructions?: string;
    }>(
      await client.callTool({
        name: 'render_caption_export',
        arguments: {
          projectId,
          settings: {
            outputs: ['mp4', 'srt', 'vtt'],
            resolution: '720p',
            fps: 'source',
            quality: 'standard',
          },
        },
      }),
    );
    expect(quoted.status).toBe('quote_required');
    expect(quoted.quote.creditCost).toBeGreaterThan(0);
    expect(quoted.approvalInstructions).toContain(String(quoted.quote.creditCost));

    const wrong = await client.callTool({
      name: 'render_caption_export',
      arguments: {
        projectId,
        approval: { quoteId: quoted.quote.id, approvedCreditCost: quoted.quote.creditCost + 1 },
        idempotencyKey: 'mcp-render-wrong',
      },
    });
    expect(wrong.isError).toBe(true);
    expect(toolError(wrong).error.code).toBe('QUOTE_MISMATCH');

    const started = structured<{ status: string; task: { id: string } }>(
      await client.callTool({
        name: 'render_caption_export',
        arguments: {
          projectId,
          approval: { quoteId: quoted.quote.id, approvedCreditCost: quoted.quote.creditCost },
          idempotencyKey: 'mcp-render-1',
        },
      }),
    );
    expect(started.status).toBe('render_started');
    const dup = structured<{ status: string; task: { id: string } }>(
      await client.callTool({
        name: 'render_caption_export',
        arguments: {
          projectId,
          approval: { quoteId: quoted.quote.id, approvedCreditCost: quoted.quote.creditCost },
          idempotencyKey: 'mcp-render-1',
        },
      }),
    );
    expect(dup.task.id).toBe(started.task.id);

    await h.runTasks();
    const rendered = structured<{
      task: Task;
      exports?: Array<{ kind: string; downloadUrl?: string; bytes: number }>;
    }>(await client.callTool({ name: 'get_caption_task', arguments: { taskId: started.task.id } }));
    expect(rendered.task.status).toBe('succeeded');
    expect(rendered.exports?.map((e) => e.kind).sort()).toEqual(['mp4', 'srt', 'vtt']);
    const mp4 = rendered.exports!.find((e) => e.kind === 'mp4')!;
    const download = await fetch(mp4.downloadUrl!);
    expect(download.status).toBe(200);
    expect(Number(download.headers.get('content-length'))).toBe(mp4.bytes);

    const cancelled = await client.callTool({
      name: 'cancel_caption_task',
      arguments: { taskId: started.task.id },
    });
    expect(cancelled.isError).toBe(true);
    expect(toolError(cancelled).error.code).toBe('TASK_NOT_CANCELLABLE');
    await client.close();
  });
});
