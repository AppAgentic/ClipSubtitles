import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import {
  CONTENT_NOTICE,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  type McpToolDescriptor,
  type McpToolName,
} from '@clipsubtitles/contracts';
import { newId } from '@clipsubtitles/core';
import type { Principal } from '../auth/principal';
import type { AppContext } from '../context';
import { ApiError, toApiError } from '../errors';
import { withIdempotency } from '../http/idempotent';
import { audit } from '../services/audit';
import { createRenderQuote, startGeneration, startPreview, startRender } from '../services/captions';
import { createProject, getProjectView, patchProject } from '../services/projects';
import { cancelTask, getTaskView } from '../services/tasks';

type Handlers = { [K in McpToolName]: (ctx: AppContext, principal: Principal, input: unknown) => Promise<unknown> };

function pointer(p: { id: string; title: string; status: string; version: number }) {
  return { id: p.id, title: p.title, status: p.status, version: p.version };
}

function taskPointer(t: { id: string; status: string; progress: number }) {
  return { id: t.id, status: t.status, progress: t.progress };
}

export const TOOL_HANDLERS: Handlers = {
  async create_caption_project(ctx, principal, raw) {
    const input = (MCP_TOOLS[0] as McpToolDescriptor<z.ZodObject, z.ZodObject>).inputSchema.parse(raw) as {
      title?: string;
      sourceUrl?: string;
      language?: string;
      idempotencyKey?: string;
    };
    const out = await withIdempotency(ctx, { workspaceId: principal.workspaceId, scope: 'projects.create', key: input.idempotencyKey, payload: input }, () =>
      createProject(ctx, principal, input),
    );
    const res = out.body;
    const nextSteps = res.uploadTarget
      ? [
          `Ask the user to open ${res.uploadTarget.webUploadUrl} and upload the video (expires ${res.uploadTarget.expiresAt}).`,
          'Then call generate_captions with the projectId.',
        ]
      : ['Poll get_caption_task with importTask.id until it succeeds, then call generate_captions.'];
    return {
      project: pointer(res.project),
      ...(res.uploadTarget ? { uploadTarget: { webUploadUrl: res.uploadTarget.webUploadUrl, expiresAt: res.uploadTarget.expiresAt } } : {}),
      ...(res.importTask ? { importTask: taskPointer(res.importTask) } : {}),
      nextSteps,
    };
  },

  async generate_captions(ctx, principal, raw) {
    const input = MCP_TOOLS[1].inputSchema.parse(raw);
    const { projectId, ...rest } = input;
    const out = await withIdempotency(ctx, { workspaceId: principal.workspaceId, scope: `captions:${projectId}`, key: rest.idempotencyKey, payload: input, status: 202 }, () =>
      startGeneration(ctx, principal, projectId, rest),
    );
    return { task: taskPointer(out.body.task), project: pointer(out.body.project) };
  },

  async get_caption_project(ctx, principal, raw) {
    const input = MCP_TOOLS[2].inputSchema.parse(raw);
    return {
      project: getProjectView(ctx, principal, input.projectId, {
        includePages: input.pages ?? true,
        includeWords: input.words ?? false,
        ...(input.wordsOffset !== undefined ? { wordsOffset: input.wordsOffset } : {}),
        ...(input.wordsLimit !== undefined ? { wordsLimit: input.wordsLimit } : {}),
      }),
    };
  },

  async update_caption_project(ctx, principal, raw) {
    const input = MCP_TOOLS[3].inputSchema.parse(raw);
    const res = patchProject(ctx, principal, input.projectId, { expectedVersion: input.expectedVersion, ops: input.ops });
    return { project: res.project, applied: res.applied };
  },

  async render_caption_preview(ctx, principal, raw) {
    const input = MCP_TOOLS[4].inputSchema.parse(raw);
    const decision = ctx.limiters.previews.take(`p:${principal.workspaceId}`, ctx.clock.now());
    if (!decision.ok) throw new ApiError('RATE_LIMITED', 'Preview limit reached for this workspace. Try again later.');
    const { projectId, ...rest } = input;
    const out = await withIdempotency(ctx, { workspaceId: principal.workspaceId, scope: `previews:${projectId}`, key: rest.idempotencyKey, payload: input, status: 202 }, () =>
      startPreview(ctx, principal, projectId, rest),
    );
    return { task: taskPointer(out.body) };
  },

  async render_caption_export(ctx, principal, raw) {
    const input = MCP_TOOLS[5].inputSchema.parse(raw);
    if (!input.approval) {
      const quote = createRenderQuote(ctx, principal, input.projectId, {
        ...(input.settings ? { settings: input.settings } : {}),
        ...(input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : {}),
      });
      return {
        status: 'quote_required',
        quote,
        approvalInstructions: `Show the user: ${quote.creditCost} credits for ${quote.settings.outputs.join(', ')} at ${quote.settings.resolution} (project v${quote.projectVersion}, expires ${quote.expiresAt}). If they approve, call render_caption_export again with approval {quoteId: "${quote.id}", approvedCreditCost: ${quote.creditCost}} and an idempotencyKey.`,
      };
    }
    const approval = input.approval;
    const key = input.idempotencyKey ?? `mcp:${approval.quoteId}`;
    const out = await withIdempotency(ctx, { workspaceId: principal.workspaceId, scope: `renders:${input.projectId}`, key, payload: approval, status: 202 }, () =>
      startRender(ctx, principal, input.projectId, { quoteId: approval.quoteId, approvedCreditCost: approval.approvedCreditCost, idempotencyKey: key }),
    );
    return { status: 'render_started', quote: out.body.quote, task: taskPointer(out.body.task) };
  },

  async get_caption_task(ctx, principal, raw) {
    const input = MCP_TOOLS[6].inputSchema.parse(raw);
    const view = getTaskView(ctx, principal, input.taskId);
    return { task: view.task, ...(view.exports ? { exports: view.exports } : {}) };
  },

  async cancel_caption_task(ctx, principal, raw) {
    const input = MCP_TOOLS[7].inputSchema.parse(raw);
    return { task: cancelTask(ctx, principal, input.taskId) };
  },
};

function summarize(name: McpToolName, output: unknown): string {
  const o = output as Record<string, unknown>;
  switch (name) {
    case 'get_caption_project': {
      const p = o.project as { id: string; status: string; version: number; pageCount: number; title: string };
      return `Project ${p.id} "${p.title}" · status ${p.status} · v${p.version} · ${p.pageCount} caption pages. ${CONTENT_NOTICE}`;
    }
    case 'render_caption_export': {
      const q = o.quote as { creditCost: number; id: string; expiresAt: string };
      return o.status === 'quote_required'
        ? `Quote ${q.id}: ${q.creditCost} credits, expires ${q.expiresAt}. Approval required before rendering.`
        : `Render started (task ${(o.task as { id: string }).id}); ${q.creditCost} credits reserved.`;
    }
    case 'get_caption_task':
    case 'cancel_caption_task': {
      const t = o.task as { id: string; status: string; progress: number; stage?: string };
      return `Task ${t.id}: ${t.status} ${t.progress}%${t.stage ? ` (${t.stage})` : ''}.`;
    }
    default:
      return `${name} ok.`;
  }
}

/**
 * Per-request MCP server bound to a verified principal. Tools call the same
 * services as REST; failures become bounded, redacted tool errors.
 */
export function createMcpServer(ctx: AppContext, principal: Principal): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_INFO.name, title: MCP_SERVER_INFO.title, version: MCP_SERVER_INFO.version },
    { capabilities: { tools: {} }, instructions: llmInstructions(ctx) },
  );
  for (const tool of MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.annotations.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: {
          title: tool.annotations.title,
          readOnlyHint: tool.annotations.readOnlyHint,
          destructiveHint: tool.annotations.destructiveHint,
          idempotentHint: tool.annotations.idempotentHint,
          openWorldHint: tool.annotations.openWorldHint,
        },
        _meta: { 'clipsubtitles/scope': tool.scope, 'clipsubtitles/cost': tool.cost },
      },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        const started = ctx.clock.now();
        try {
          if (!principal.scopes.includes(tool.scope)) throw new ApiError('INSUFFICIENT_SCOPE', `This tool requires the ${tool.scope} scope.`);
          const output = await TOOL_HANDLERS[tool.name](ctx, principal, args);
          audit(ctx, { principal, action: `mcp.${tool.name}`, outcome: 'ok', metadata: { latencyMs: ctx.clock.now() - started } });
          return {
            content: [{ type: 'text', text: summarize(tool.name, output) }],
            structuredContent: output as Record<string, unknown>,
          };
        } catch (err) {
          const apiErr = toApiError(err);
          const errorRef = apiErr.errorRef ?? newId('errorRef');
          apiErr.errorRef = errorRef;
          if (apiErr.code === 'INTERNAL') ctx.logger.error('mcp tool internal error', { tool: tool.name, errorRef, internal: apiErr.internal });
          audit(ctx, {
            principal,
            action: `mcp.${tool.name}`,
            outcome: apiErr.code === 'UNAUTHENTICATED' || apiErr.code === 'INSUFFICIENT_SCOPE' ? 'denied' : 'error',
            errorRef,
            metadata: { code: apiErr.code, latencyMs: ctx.clock.now() - started },
          });
          // Errors never carry structuredContent: clients validate it against the
          // success output schema. The public error envelope is returned as JSON text.
          const body = apiErr.toBody();
          return {
            isError: true,
            content: [{ type: 'text', text: JSON.stringify(body) }],
          };
        }
      },
    );
  }
  return server;
}

export function llmInstructions(ctx: AppContext): string {
  return [
    'ClipSubtitles turns a short video into accurate, editable, styled captions and rendered exports.',
    'Workflow: create_caption_project -> generate_captions -> get_caption_project -> (update_caption_project) -> render_caption_preview (free) -> render_caption_export (quote, then explicit approval) -> get_caption_task.',
    'Never rewrite spoken words yourself; use explicit per-word edit ops only when the user asks.',
    'Paid renders: always show the quote (credits, outputs, project version, expiry) and get explicit approval before passing approval.',
    CONTENT_NOTICE,
    `Web editor: ${ctx.config.webPublicUrl}.`,
  ].join(' ');
}
