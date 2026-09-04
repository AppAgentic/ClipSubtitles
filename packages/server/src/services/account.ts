import type { Connection, Export, Me, Workspace } from '@clipsubtitles/contracts';
import type { GrantRecord, WorkspaceRecord } from '@clipsubtitles/storage';
import type { Principal } from '../auth/principal';
import type { AppContext } from '../context';
import { ApiError } from '../errors';
import { audit } from './audit';
import { creditBalance } from './billing';
import { exportView } from './views';

function workspaceView(ctx: AppContext, ws: WorkspaceRecord): Workspace {
  return {
    id: ws.id,
    name: ws.name,
    retention: {
      sourceDays: ctx.config.limits.sourceRetentionDays,
      exportDays: ctx.config.limits.exportRetentionDays,
    },
    createdAt: ws.createdAt,
  };
}

export async function getMe(ctx: AppContext, principal: Principal): Promise<Me> {
  const ws = await ctx.db.getWorkspace(principal.workspaceId);
  if (!ws) throw new ApiError('INTERNAL');
  const me: Me = {
    user: { id: principal.userId },
    workspace: workspaceView(ctx, ws),
    scopes: principal.scopes,
    authKind: principal.kind,
    isAdmin: false,
    credits: await creditBalance(ctx, principal.workspaceId),
  };
  const user = await ctx.db.getUser(principal.userId);
  me.isAdmin = Boolean(user?.email && ctx.config.adminEmails.includes(user.email.toLowerCase()));
  if (principal.displayName) me.user.displayName = principal.displayName;
  if (principal.emailMasked) me.user.emailMasked = principal.emailMasked;
  return me;
}

export async function updateWorkspaceSettings(
  ctx: AppContext,
  principal: Principal,
  patch: { name?: string },
): Promise<Workspace> {
  const ws = await ctx.db.updateWorkspace(principal.workspaceId, patch, ctx.clock.iso());
  await audit(ctx, {
    principal,
    action: 'workspace.update',
    targetType: 'workspace',
    targetId: ws.id,
    metadata: { changedFields: ['name'] },
  });
  return workspaceView(ctx, ws);
}

function connectionView(g: GrantRecord): Connection {
  const c: Connection = {
    id: g.id,
    clientId: g.clientId,
    scopes: g.scopes,
    createdAt: g.createdAt,
  };
  if (g.clientName) c.clientName = g.clientName;
  if (g.lastUsedAt) c.lastUsedAt = g.lastUsedAt;
  if (g.revokedAt) c.revokedAt = g.revokedAt;
  return c;
}

export async function listConnections(
  ctx: AppContext,
  principal: Principal,
): Promise<Connection[]> {
  return (await ctx.db.listGrants(principal.workspaceId)).map(connectionView);
}

/** Revoke an agent connection: subsequent bearer tokens for that client are rejected. */
export async function revokeConnection(
  ctx: AppContext,
  principal: Principal,
  grantId: string,
): Promise<Connection> {
  const ok = await ctx.db.revokeGrant(principal.workspaceId, grantId, ctx.clock.iso());
  const grants = await ctx.db.listGrants(principal.workspaceId);
  const grant = grants.find((g) => g.id === grantId);
  if (!grant) throw new ApiError('NOT_FOUND');
  await audit(ctx, {
    principal,
    action: 'connection.revoke',
    targetType: 'grant',
    targetId: grantId,
    metadata: { changed: ok },
  });
  return connectionView(grant);
}

export async function listExports(
  ctx: AppContext,
  principal: Principal,
  opts: { projectId?: string; limit?: number } = {},
): Promise<Export[]> {
  const rows = await ctx.db.listExports(principal.workspaceId, {
    ...opts,
    limit: opts.limit ?? 50,
  });
  return rows.map((e) => exportView(ctx, e));
}

export async function getExportView(
  ctx: AppContext,
  principal: Principal,
  exportId: string,
): Promise<Export> {
  const e = await ctx.db.getExport(principal.workspaceId, exportId);
  if (!e) throw new ApiError('NOT_FOUND');
  if (e.status === 'purged') throw new ApiError('RETENTION_EXPIRED');
  return exportView(ctx, e);
}
