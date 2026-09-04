/**
 * MCP conformance smoke: connects a real Streamable HTTP client to an
 * in-process server and exercises discovery, tool listing, positive/negative
 * calls, scope enforcement, cost approval, cancellation, and redaction.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  MCP_TOOL_NAMES,
  type CaptionProject,
  type RenderQuote,
  type Task,
} from '@clipsubtitles/contracts';
import { createHarness } from '../test/harness';

function check(ok: boolean, label: string): void {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) throw new Error(`conformance failed: ${label}`);
}

function toolError(result: unknown): { error: { code: string; errorRef?: string } } {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return JSON.parse(content[0]?.text ?? '{}') as { error: { code: string; errorRef?: string } };
}

async function main(): Promise<void> {
  const h = await createHarness({ LOG_LEVEL: 'warn' });
  const listening = await h.listen();
  try {
    await h.ensureDemoFixture();
    const unauth = await fetch(`${listening.baseUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: '{}',
    });
    check(
      unauth.status === 401 &&
        (unauth.headers.get('www-authenticate') ?? '').includes('resource_metadata'),
      'unauthenticated call → 401 + WWW-Authenticate resource_metadata',
    );
    const meta = (await fetch(`${listening.baseUrl}/.well-known/oauth-protected-resource`).then(
      (r) => r.json(),
    )) as { resource: string; scopes_supported: string[] };
    check(
      meta.resource.endsWith('/api/mcp') &&
        meta.scopes_supported.includes('openid') &&
        meta.scopes_supported.includes('offline_access'),
      'protected resource metadata (RFC 9728)',
    );

    const token = await h.token();
    const connect = async (c: Client, bearer: string) =>
      c.connect(
        new StreamableHTTPClientTransport(new URL(`${listening.baseUrl}/api/mcp`), {
          requestInit: { headers: { authorization: `Bearer ${bearer}` } },
        }) as unknown as Parameters<Client['connect']>[0],
      );
    const client = new Client({ name: 'clipsubtitles-conformance', version: '0.1.0' });
    await connect(client, token);
    const { tools } = await client.listTools();
    check(
      tools
        .map((t) => t.name)
        .sort()
        .join(',') === [...MCP_TOOL_NAMES].sort().join(','),
      `tools/list returns the ${MCP_TOOL_NAMES.length} contracted tools`,
    );
    check(
      tools.every(
        (t) =>
          t.annotations &&
          t.outputSchema &&
          (t.inputSchema as { additionalProperties?: boolean }).additionalProperties === false,
      ),
      'every tool has annotations, strict input schema, output schema',
    );

    const bad = await client.callTool({
      name: 'get_caption_task',
      arguments: { taskId: 'task_00000000000000000000' },
    });
    check(
      bad.isError === true &&
        bad.structuredContent === undefined &&
        toolError(bad).error.code === 'NOT_FOUND' &&
        Boolean(toolError(bad).error.errorRef),
      'negative fixture: unknown task → NOT_FOUND with errorRef, no stack, no structuredContent',
    );

    const readOnly = new Client({ name: 'readonly', version: '0.1.0' });
    await connect(readOnly, await h.token('mock|joe', ['captions:read']));
    const denied = await readOnly.callTool({
      name: 'generate_captions',
      arguments: { projectId: 'proj_00000000000000000000' },
    });
    check(
      denied.isError === true && toolError(denied).error.code === 'INSUFFICIENT_SCOPE',
      'scope fixture: captions:read token cannot write',
    );
    await readOnly.close();

    const fixture = await h.api<{ project: CaptionProject }>(
      'POST',
      '/dev/fixtures/clean-en-product-demo/projects',
      { token },
    );
    const projectId = fixture.body.project.id;
    const gen = (
      await client.callTool({
        name: 'generate_captions',
        arguments: { projectId, idempotencyKey: 'conf-gen' },
      })
    ).structuredContent as { task: { id: string } };
    await h.runTasks();
    const genDone = (
      await client.callTool({ name: 'get_caption_task', arguments: { taskId: gen.task.id } })
    ).structuredContent as { task: Task };
    check(genDone.task.status === 'succeeded', 'generate_captions → get_caption_task succeeded');

    const injected = (
      await client.callTool({
        name: 'get_caption_project',
        arguments: { projectId, words: true, wordsLimit: 2 },
      })
    ).structuredContent as { project: CaptionProject };
    check(
      injected.project.contentNotice.includes('untrusted'),
      'project payload carries the untrusted-content notice',
    );

    const quote = (
      await client.callTool({ name: 'render_caption_export', arguments: { projectId } })
    ).structuredContent as { status: string; quote: RenderQuote };
    check(
      quote.status === 'quote_required' && quote.quote.creditCost > 0,
      `cost approval fixture: quote_required (${quote.quote.creditCost} credits)`,
    );
    const wrong = await client.callTool({
      name: 'render_caption_export',
      arguments: {
        projectId,
        approval: { quoteId: quote.quote.id, approvedCreditCost: 1 },
        idempotencyKey: 'conf-wrong',
      },
    });
    check(wrong.isError === true, 'wrong approved cost rejected');
    const started = (
      await client.callTool({
        name: 'render_caption_export',
        arguments: {
          projectId,
          approval: { quoteId: quote.quote.id, approvedCreditCost: quote.quote.creditCost },
          idempotencyKey: 'conf-render',
        },
      })
    ).structuredContent as { status: string; task: { id: string } };
    check(started.status === 'render_started', 'approved render started');
    const retry = (
      await client.callTool({
        name: 'render_caption_export',
        arguments: {
          projectId,
          approval: { quoteId: quote.quote.id, approvedCreditCost: quote.quote.creditCost },
          idempotencyKey: 'conf-render',
        },
      })
    ).structuredContent as { task: { id: string } };
    check(
      retry.task.id === started.task.id,
      'retry fixture: same idempotency key → same task, no double charge',
    );
    const cancel = (
      await client.callTool({ name: 'cancel_caption_task', arguments: { taskId: started.task.id } })
    ).structuredContent as { task: Task };
    check(
      cancel.task.status === 'cancelled',
      'cancellation fixture: queued render cancelled, credits released',
    );
    const me = await h.api<{ credits: { reserved: number } }>('GET', '/v1/me', { token });
    check(me.body.credits.reserved === 0, 'no credits remain reserved after cancellation');
    await client.close();
    console.log('\nMCP conformance passed.');
  } finally {
    await listening.close();
    await h.cleanup();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
