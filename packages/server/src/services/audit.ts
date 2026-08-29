import { recordAudit, type AuditActorType, type AuditOutcome } from '@clipsubtitles/storage';
import type { Principal } from '../auth/principal';
import type { AppContext } from '../context';
import { redact } from '../logging';

export interface AuditInput {
  principal?: Principal | null;
  actorType?: AuditActorType;
  actorId?: string;
  workspaceId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  outcome?: AuditOutcome;
  errorRef?: string;
  metadata?: Record<string, unknown>;
}

/** Audit with mandatory redaction: task/tool/outcome metadata only, never content. */
export function audit(ctx: AppContext, input: AuditInput): void {
  const actorType = input.actorType ?? (input.principal ? (input.principal.kind === 'bearer' ? 'agent' : 'user') : 'system');
  const workspaceId = input.workspaceId ?? input.principal?.workspaceId;
  const actorId = input.actorId ?? input.principal?.userId;
  try {
    recordAudit(ctx.db, {
      ...(workspaceId ? { workspaceId } : {}),
      actorType,
      ...(actorId ? { actorId } : {}),
      action: input.action,
      ...(input.targetType ? { targetType: input.targetType } : {}),
      ...(input.targetId ? { targetId: input.targetId } : {}),
      outcome: input.outcome ?? 'ok',
      ...(input.errorRef ? { errorRef: input.errorRef } : {}),
      ...(input.metadata ? { metadata: redact(input.metadata) as Record<string, unknown> } : {}),
      now: ctx.clock.iso(),
    });
  } catch (err) {
    ctx.logger.warn('audit write failed', { error: err instanceof Error ? err.message : String(err) });
  }
}
