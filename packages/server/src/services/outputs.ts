import type { RenderOutputFile } from '@clipsubtitles/render';
import { createExport, deleteExportsForTask, getTaskById, transaction, type ExportRecord } from '@clipsubtitles/storage';
import type { AppContext } from '../context';

/** Every blob a render task produces lives under this prefix, so cleanup never depends on database rows. */
export function exportPrefix(workspaceId: string, taskId: string): string {
  return `${workspaceId}/exports/${taskId}`;
}

/**
 * Remove all outputs of a task: export rows and every blob under the task's
 * prefix — including blobs that never got a row (a crash or failed insert
 * between the object-store write and the database write).
 *
 * Throws if the blob cleanup fails: a retry must not proceed on top of
 * outputs it could not clear. Callers at a terminal boundary (publish
 * failure, cancelled/failed task) catch and log; the pre-render discard in
 * the handlers lets it propagate so the attempt fails instead.
 */
export async function discardTaskOutputs(ctx: AppContext, task: { id: string; workspaceId: string }): Promise<{ rows: number; blobs: number }> {
  const rows = deleteExportsForTask(ctx.db, task.id);
  const blobs = await ctx.store.deletePrefix(exportPrefix(task.workspaceId, task.id));
  return { rows, blobs };
}

/**
 * Cleanup hook for terminal task states decided outside the handler (permanent
 * failure, cancellation, lease reclaim). Only render tasks own outputs; the
 * caller must own the task (or it must be terminal) so a live retry elsewhere
 * cannot lose its work.
 */
export async function discardOutputsForTaskId(ctx: AppContext, taskId: string): Promise<void> {
  const task = getTaskById(ctx.db, taskId);
  if (!task || (task.kind !== 'render_export' && task.kind !== 'render_preview')) return;
  await discardTaskOutputs(ctx, task).catch((err) => ctx.logger.warn('output cleanup failed', { taskId, error: err instanceof Error ? err.message : String(err) }));
}

export interface PublishMeta {
  projectId: string;
  projectVersion: number;
  contentHash: string;
  expiresAt: string;
}

/**
 * Publish rendered files as exports.
 *
 * Order matters: blobs are written first (their keys are deterministic per
 * task, so a retry overwrites rather than duplicates), then every export row
 * is inserted in ONE transaction. If anything fails after the first blob is
 * written — a row insert, a second file move — all rows roll back and every
 * blob under the task prefix is deleted, so a failed publish leaves neither
 * orphaned blobs nor half-visible exports. The caller's task then fails or
 * retries normally.
 */
export async function publishOutputs(ctx: AppContext, task: { id: string; workspaceId: string }, files: RenderOutputFile[], meta: PublishMeta): Promise<ExportRecord[]> {
  const prefix = exportPrefix(task.workspaceId, task.id);
  try {
    const stored: Array<{ file: RenderOutputFile; key: string; bytes: number; sha256: string }> = [];
    for (const file of files) {
      const key = `${prefix}/${file.fileName}`;
      const s = await ctx.store.putFile(key, file.path, { move: true });
      stored.push({ file, key, bytes: s.bytes, sha256: s.sha256 });
    }
    const now = ctx.clock.iso();
    return transaction(ctx.db, () =>
      stored.map(({ file, key, bytes, sha256 }) =>
        createExport(ctx.db, {
          workspaceId: task.workspaceId,
          projectId: meta.projectId,
          taskId: task.id,
          kind: file.kind,
          storageKey: key,
          fileName: file.fileName,
          mimeType: file.mimeType,
          bytes,
          sha256,
          ...(file.width !== undefined ? { width: file.width } : {}),
          ...(file.height !== undefined ? { height: file.height } : {}),
          ...(file.durationMs !== undefined ? { durationMs: file.durationMs } : {}),
          projectVersion: meta.projectVersion,
          contentHash: meta.contentHash,
          expiresAt: meta.expiresAt,
          now,
        }),
      ),
    );
  } catch (err) {
    // Best effort at this boundary: the original failure is what the task reports;
    // anything left behind is removed again when the task retries or ends.
    await discardTaskOutputs(ctx, task).catch((cleanupErr) =>
      ctx.logger.warn('output cleanup after failed publish failed', { taskId: task.id, error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr) }),
    );
    throw err;
  }
}
