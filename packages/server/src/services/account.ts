import type { Connection, Export, Me, RetentionPolicy, Workspace } from '@clipsubtitles/contracts';
import { getExport, getWorkspace, listExports as listExportRecords, listGrants, revokeGrant, updateWorkspace, type GrantRecord } from '@clipsubtitles/storage';
import type { Principal } from '../auth/principal';
import type { AppContext } from '../context';
import { ApiError } from '../errors';
import { audit } from './audit';
import { creditBalance } from './billing';
import { exportView } from './views';

function workspaceView(ws: NonNullable<ReturnType<typeof getWorkspace>>): Workspace {
  return { id: ws.id, name: ws.name, retention: ws.retention, createdAt: ws.createdAt };
}

export function getMe(ctx: AppContext, principal: Principal): Me {
  const ws = getWorkspace(ctx.db, principal.workspaceId);
  if (!ws) throw new ApiError('INTERNAL');
  const me: Me = {
    user: { id: principal.userId },
    workspace: workspaceView(ws),
    scopes: principal.scopes,
    authKind: principal.kind,
    credits: creditBalance(ctx, principal.workspaceId),
  };
  if (principal.displayName) me.user.displayName = principal.displayName;
  if (principal.emailMasked) me.user.emailMasked = principal.emailMasked;
  return me;
}

export function updateWorkspaceSettings(ctx: AppContext, principal: Principal, patch: { name?: string; retention?: Partial<RetentionPolicy> }): Workspace {
  const ws = updateWorkspace(ctx.db, principal.workspaceId, patch, ctx.clock.iso());
  audit(ctx, { principal, action: 'workspace.update', targetType: 'workspace', targetId: ws.id, metadata: { retention: ws.retention } });
  return workspaceView(ws);
}

function connectionView(g: GrantRecord): Connection {
  const c: Connection = { id: g.id, clientId: g.clientId, scopes: g.scopes, createdAt: g.createdAt };
  if (g.clientName) c.clientName = g.clientName;
  if (g.lastUsedAt) c.lastUsedAt = g.lastUsedAt;
  if (g.revokedAt) c.revokedAt = g.revokedAt;
  return c;
}

export function listConnections(ctx: AppContext, principal: Principal): Connection[] {
  return listGrants(ctx.db, principal.workspaceId).map(connectionView);
}

/** Revoke an agent connection: subsequent bearer tokens for that client are rejected. */
export function revokeConnection(ctx: AppContext, principal: Principal, grantId: string): Connection {
  const ok = revokeGrant(ctx.db, principal.workspaceId, grantId, ctx.clock.iso());
  const grants = listGrants(ctx.db, principal.workspaceId);
  const grant = grants.find((g) => g.id === grantId);
  if (!grant) throw new ApiError('NOT_FOUND');
  audit(ctx, { principal, action: 'connection.revoke', targetType: 'grant', targetId: grantId, metadata: { changed: ok } });
  return connectionView(grant);
}

export function listExports(ctx: AppContext, principal: Principal, opts: { projectId?: string; limit?: number } = {}): Export[] {
  return listExportRecords(ctx.db, principal.workspaceId, { ...opts, limit: opts.limit ?? 50 }).map((e) => exportView(ctx, e));
}

export function getExportView(ctx: AppContext, principal: Principal, exportId: string): Export {
  const e = getExport(ctx.db, principal.workspaceId, exportId);
  if (!e) throw new ApiError('NOT_FOUND');
  if (e.status === 'purged') throw new ApiError('RETENTION_EXPIRED');
  return exportView(ctx, e);
}
