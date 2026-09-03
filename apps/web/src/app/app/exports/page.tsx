'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Export } from '@clipsubtitles/contracts';
import { AppShell } from '@/components/shell/AppShell';
import { Chip, EmptyState, LinkButton, Panel, statusTone } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { bytes, relativeTime } from '@/lib/format';

export default function AppExportsPage() {
  return <AppShell render={() => <Exports />} />;
}

function Exports() {
  const toast = useToast();
  const [exports, setExports] = useState<Export[] | null>(null);
  useEffect(() => {
    api
      .listExports()
      .then((r) => setExports(r.exports))
      .catch((err) => toast.push('error', errorMessage(err)));
  }, [toast]);

  return (
    <div>
      <div className="rise mb-5">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Exports</h1>
        <p className="text-[13px] text-ink-mute">
          Download your finished videos and subtitle files before their displayed removal date.
        </p>
      </div>
      {exports === null ? (
        <div className="text-[13px] text-ink-mute">Loading…</div>
      ) : exports.length === 0 ? (
        <EmptyState
          title="No finished files yet"
          body="Caption a video, choose what you need and review the cost before exporting."
          actions={<LinkButton href="/app">Back to Library</LinkButton>}
        />
      ) : (
        <>
          <Panel className="rise rise-1 hidden overflow-hidden sm:block">
            <div className="table-scroll">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[10px] uppercase tracking-[0.14em] text-ink-mute">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 font-medium">File</th>
                    <th className="px-3 py-2.5 font-medium">Video</th>
                    <th className="px-3 py-2.5 text-right font-medium">Size</th>
                    <th className="px-3 py-2.5 text-right font-medium">Created</th>
                    <th className="px-3 py-2.5 text-right font-medium">Removed</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {exports.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-line/60 last:border-b-0 hover:bg-panel-2/60"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Chip tone={statusTone(e.status)}>{e.kind}</Chip>
                          <span className="text-ink">{e.fileName}</span>
                        </div>
                        <div className="mono mt-0.5 text-[11px] text-ink-mute">
                          {e.kind.toUpperCase()}
                        </div>
                      </td>
                      <td className="mono px-3 py-3 text-[12px]">
                        <Link
                          href={`/studio/${e.projectId}`}
                          className="text-ink-dim hover:text-signal"
                        >
                          Open video
                        </Link>
                      </td>
                      <td className="mono px-3 py-3 text-right text-ink-dim">{bytes(e.bytes)}</td>
                      <td className="mono px-3 py-3 text-right text-ink-mute">
                        {relativeTime(e.createdAt)}
                      </td>
                      <td className="mono px-3 py-3 text-right text-ink-mute">
                        {relativeTime(e.expiresAt)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {e.downloadUrl ? (
                          <a
                            href={`${e.downloadUrl}&download=1`}
                            className="text-[12px] text-signal hover:text-signal-soft"
                          >
                            Download
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <ul className="rise rise-1 space-y-2 sm:hidden" aria-label="Finished files">
            {exports.map((e) => (
              <li key={e.id} className="rounded-xl border border-line bg-panel p-4">
                <div className="flex min-w-0 items-start gap-2">
                  <Chip tone={statusTone(e.status)}>{e.kind}</Chip>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{e.fileName}</p>
                    <p className="mono mt-1 text-[11px] text-ink-mute">
                      {bytes(e.bytes)} · created {relativeTime(e.createdAt)} · removed{' '}
                      {relativeTime(e.expiresAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-4 border-t border-line/70 pt-3">
                  <Link
                    href={`/studio/${e.projectId}`}
                    className="text-[12px] text-ink-dim hover:text-signal"
                  >
                    Open video
                  </Link>
                  {e.downloadUrl ? (
                    <a
                      href={`${e.downloadUrl}&download=1`}
                      className="text-[12px] font-medium text-signal hover:text-signal-soft"
                      aria-label={`Download ${e.fileName}`}
                    >
                      Download
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
