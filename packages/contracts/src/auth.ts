import { z } from 'zod';
import { CreditBalanceSchema } from './billing';
import { GrantIdSchema, WorkspaceIdSchema } from './ids';

export const SCOPES = ['captions:read', 'captions:write'] as const;
export const ScopeSchema = z.enum(SCOPES);
export type Scope = z.infer<typeof ScopeSchema>;

export const RetentionPolicySchema = z.object({
  sourceDays: z.number().int().min(1).max(365),
  exportDays: z.number().int().min(1).max(90),
}).meta({ id: 'RetentionPolicy' });
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;

export const WorkspaceSchema = z.object({
  id: WorkspaceIdSchema,
  name: z.string().max(120),
  retention: RetentionPolicySchema,
  createdAt: z.iso.datetime(),
}).meta({ id: 'Workspace' });
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const UpdateWorkspaceRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    retention: RetentionPolicySchema.partial().optional(),
  })
  .strict();

export const AuthKindSchema = z.enum(['session', 'bearer']);

/** `GET /v1/me` — identity as derived from the verified credential, never from input. */
export const MeSchema = z.object({
  user: z.object({
    id: z.string().max(64),
    displayName: z.string().max(120).optional(),
    emailMasked: z.string().max(120).optional(),
  }),
  workspace: WorkspaceSchema,
  scopes: z.array(ScopeSchema),
  authKind: AuthKindSchema,
  credits: CreditBalanceSchema,
}).meta({ id: 'Me' });
export type Me = z.infer<typeof MeSchema>;

/** An OAuth grant (agent connection) that the user can revoke from the web surface. */
export const ConnectionSchema = z.object({
  id: GrantIdSchema,
  clientId: z.string().max(200),
  clientName: z.string().max(120).optional(),
  scopes: z.array(ScopeSchema),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().optional(),
  revokedAt: z.iso.datetime().optional(),
}).meta({ id: 'Connection' });
export type Connection = z.infer<typeof ConnectionSchema>;

export const ConnectionListSchema = z.object({ connections: z.array(ConnectionSchema).max(100) });
