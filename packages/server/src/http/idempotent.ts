import type { Context } from 'hono';
import { IdempotencyKeySchema } from '@clipsubtitles/contracts';
import { fingerprint } from '@clipsubtitles/core';
import { abortIdempotent, beginIdempotent, completeIdempotent } from '@clipsubtitles/storage';
import type { AppEnv } from '../auth/middleware';
import type { AppContext } from '../context';
import { ApiError } from '../errors';

/** Idempotency key from the header (preferred) or the body field. */
export function idempotencyKeyFrom(c: Context<AppEnv>, body: { idempotencyKey?: string | undefined } | undefined): string | undefined {
  const header = c.req.header('idempotency-key');
  const raw = header ?? body?.idempotencyKey;
  if (raw === undefined) return undefined;
  const parsed = IdempotencyKeySchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('VALIDATION_FAILED', undefined, { details: [{ path: 'idempotencyKey', message: 'Invalid idempotency key.' }] });
  return parsed.data;
}

export interface IdempotentOutcome<T> {
  status: number;
  body: T;
  replayed: boolean;
}

/**
 * Execute `run` exactly once per (workspace, scope, key). Replays return the
 * stored response; a reused key with a different payload is rejected.
 */
export async function withIdempotency<T>(
  ctx: AppContext,
  input: { workspaceId: string; scope: string; key: string | undefined; payload: unknown; status?: number },
  run: () => Promise<T> | T,
): Promise<IdempotentOutcome<T>> {
  const status = input.status ?? 201;
  if (!input.key) return { status, body: await run(), replayed: false };
  const begin = beginIdempotent(ctx.db, {
    workspaceId: input.workspaceId,
    scope: input.scope,
    key: input.key,
    fingerprint: fingerprint({ scope: input.scope, payload: input.payload }),
    now: ctx.clock.iso(),
  });
  if (begin.kind === 'replay') return { status: begin.statusCode, body: begin.response as T, replayed: true };
  if (begin.kind === 'mismatch') throw new ApiError('IDEMPOTENCY_KEY_REUSED');
  if (begin.kind === 'in_progress') throw new ApiError('IDEMPOTENCY_IN_PROGRESS');
  try {
    const body = await run();
    completeIdempotent(ctx.db, { workspaceId: input.workspaceId, scope: input.scope, key: input.key, statusCode: status, response: body, now: ctx.clock.iso() });
    return { status, body, replayed: false };
  } catch (err) {
    abortIdempotent(ctx.db, { workspaceId: input.workspaceId, scope: input.scope, key: input.key });
    throw err;
  }
}
