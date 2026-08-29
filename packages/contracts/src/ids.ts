import { z } from 'zod';

/**
 * Every persistent record carries a prefixed, time-sortable identifier.
 * The prefix makes IDs self-describing in logs, tool calls, and URLs.
 */
export const ID_PREFIXES = {
  user: 'usr',
  workspace: 'ws',
  session: 'ses',
  grant: 'grant',
  project: 'proj',
  asset: 'asset',
  upload: 'upl',
  revision: 'rev',
  word: 'w',
  page: 'pg',
  task: 'task',
  quote: 'quote',
  export: 'exp',
  reservation: 'rsv',
  ledger: 'led',
  audit: 'aud',
  errorRef: 'err',
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

const ID_BODY = '[0-9a-hjkmnp-tv-z]{16,32}';

export function idSchema(kind: IdKind) {
  const prefix = ID_PREFIXES[kind];
  return z
    .string()
    .regex(new RegExp(`^${prefix}_${ID_BODY}$`), `must be a ${kind} id (${prefix}_…)`)
    .describe(`${kind} identifier`);
}

export const ProjectIdSchema = idSchema('project');
export const TaskIdSchema = idSchema('task');
export const QuoteIdSchema = idSchema('quote');
export const ExportIdSchema = idSchema('export');
export const AssetIdSchema = idSchema('asset');
export const RevisionIdSchema = idSchema('revision');
export const WordIdSchema = idSchema('word');
export const PageIdSchema = idSchema('page');
export const WorkspaceIdSchema = idSchema('workspace');
export const GrantIdSchema = idSchema('grant');
export const UploadIdSchema = idSchema('upload');

/** Client-supplied idempotency keys: opaque, bounded, printable. */
export const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'idempotency keys may contain letters, digits, ., _, :, -')
  .describe('Client-generated idempotency key (8-128 chars)');
