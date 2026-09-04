import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  IdempotencyKeySchema,
  ProjectIdSchema,
  SUPPORTED_SOURCE_MIME_TYPES,
  TitleSchema,
} from '@clipsubtitles/contracts';
import { newId } from '@clipsubtitles/core';
import type { Principal } from '../auth/principal';
import type { AppContext } from '../context';
import { ApiError, toApiError } from '../errors';
import { withIdempotency } from '../http/idempotent';
import { audit } from '../services/audit';
import { createProject, createUploadTarget, getProjectView } from '../services/projects';

/** Below the Cloud Run HTTP/1 request limit; larger files use the web direct-upload lane. */
export const WIDGET_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;
const Input = z.object({
  title: TitleSchema.optional(),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(SUPPORTED_SOURCE_MIME_TYPES),
  bytes: z.number().int().positive(),
  idempotencyKey: IdempotencyKeySchema.optional(),
  projectId: ProjectIdSchema.optional(),
}).strict();
const Output = z.object({
  status: z.enum(['upload_required', 'already_uploaded']),
  project: z.object({ id: ProjectIdSchema, title: z.string(), status: z.string(), version: z.number() }),
  upload: z.object({ maxBytes: z.number(), acceptedMimeTypes: z.array(z.string()), expiresAt: z.string(), webUploadUrl: z.string() }).optional(),
});

export function registerUploadTool(server: McpServer, ctx: AppContext, principal: Principal): void {
  server.registerTool('prepare_caption_upload', {
    title: 'Prepare video upload',
    description: 'Widget-only: prepare a bounded native file upload for the signed-in user. Larger videos must use the web uploader.',
    inputSchema: Input,
    outputSchema: Output,
    annotations: { title: 'Prepare video upload', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    _meta: {
      ui: { visibility: ['app'] },
      'openai/visibility': 'private',
      'openai/widgetAccessible': true,
      'clipsubtitles/scope': 'captions:write',
      'clipsubtitles/cost': 'free',
    },
  }, async (raw): Promise<CallToolResult> => {
    try {
      if (!principal.scopes.includes('captions:write')) throw new ApiError('INSUFFICIENT_SCOPE');
      const input = Input.parse(raw);
      const maxBytes = Math.min(WIDGET_UPLOAD_MAX_BYTES, ctx.config.limits.maxUploadBytes);
      if (input.bytes > maxBytes)
        throw new ApiError('PAYLOAD_TOO_LARGE', 'This video is too large for an embedded upload. Use Upload in ClipSubtitles for larger videos.');
      // A request-local limit reaches the persisted single-use upload record and
      // storage byte counter. It never mutates the shared application context.
      const limited: AppContext = { ...ctx, config: { ...ctx.config, limits: { ...ctx.config.limits, maxUploadBytes: maxBytes } } };
      const result = await withIdempotency(limited, {
        workspaceId: principal.workspaceId,
        scope: 'widget.prepare_upload',
        key: input.idempotencyKey,
        payload: input,
      }, async () => {
        if (input.projectId) {
          const project = await getProjectView(limited, principal, input.projectId);
          if (project.source?.status === 'ready') return { project, uploadTarget: undefined };
          const target = await createUploadTarget(limited, principal, input.projectId);
          return { project, uploadTarget: target };
        }
        return createProject(limited, principal, {
          fileName: input.fileName,
          ...(input.title ? { title: input.title } : {}),
        });
      });
      const target = result.body.uploadTarget;
      const p = result.body.project;
      const project = { id: p.id, title: p.title, status: p.status, version: p.version };
      if (!target && p.source?.status === 'ready') {
        await audit(ctx, { principal, action: 'mcp.prepare_caption_upload', outcome: 'ok' });
        return { content: [{ type: 'text', text: 'Video already uploaded.' }], structuredContent: { status: 'already_uploaded', project } };
      }
      if (!target || target.transport !== 'proxy') throw new ApiError('INTERNAL');
      const upload = {
        maxBytes: target.maxBytes,
        acceptedMimeTypes: target.acceptedMimeTypes,
        expiresAt: target.expiresAt,
        webUploadUrl: target.webUploadUrl,
      };
      await audit(ctx, { principal, action: 'mcp.prepare_caption_upload', outcome: 'ok' });
      return {
        content: [{ type: 'text', text: 'Video upload prepared.' }],
        structuredContent: { status: 'upload_required', project, upload },
        // Only the host/widget receives this capability. Never copy it into
        // model-visible content, structuredContent, or an audit event.
        _meta: { uploadTarget: { ...target, projectId: project.id } },
      };
    } catch (err) {
      const apiErr = toApiError(err);
      apiErr.errorRef ??= newId('errorRef');
      await audit(ctx, {
        principal, action: 'mcp.prepare_caption_upload',
        outcome: apiErr.code === 'INSUFFICIENT_SCOPE' ? 'denied' : 'error',
        errorRef: apiErr.errorRef, metadata: { code: apiErr.code },
      });
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(apiErr.toBody()) }] };
    }
  });
}
