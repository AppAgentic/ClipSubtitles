'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Export } from '@clipsubtitles/contracts';
import { AppShell } from '@/components/shell/AppShell';
import { Chip, EmptyState, LinkButton, Panel, statusTone } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { bytes, relativeTime, shortHash } from '@/lib/format';

export default function ExportsPage() {
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
        <p className="text-[13px] text-ink-mute">Download links are short-lived and re-issued on every visit; files follow your workspace retention window.</p>
      </div>
      {exports === null ? (
        <div className="text-[13px] text-ink-mute">Loading…</div>
      ) : exports.length === 0 ? (
        <EmptyState title="No exports yet" body="Approve a render quote in any captioned project to produce MP4, transparent overlay, SRT, or VTT files." actions={<LinkButton href="/">Back to library</LinkButton>} />
      ) : (
        <Panel className="rise rise-1 table-scroll overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[10px] uppercase tracking-[0.14em] text-ink-mute">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 font-medium">File</th>
                <th className="px-3 py-2.5 font-medium">Project</th>
                <th className="px-3 py-2.5 text-right font-medium">Size</th>
                <th className="px-3 py-2.5 text-right font-medium">Version</th>
                <th className="px-3 py-2.5 text-right font-medium">Created</th>
                <th className="px-3 py-2.5 text-right font-medium">Expires</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {exports.map((e) => (
                <tr key={e.id} className="border-b border-line/60 last:border-b-0 hover:bg-panel-2/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Chip tone={statusTone(e.status)}>{e.kind}</Chip>
                      <span className="text-ink">{e.fileName}</span>
                    </div>
                    <div className="mono mt-0.5 text-[11px] text-ink-mute">sha256 {shortHash(e.sha256)}… · {e.mimeType}</div>
                  </td>
                  <td className="mono px-3 py-3 text-[12px]">
                    <Link href={`/projects/${e.projectId}`} className="text-ink-dim hover:text-signal">
                      {e.projectId.slice(0, 16)}…
                    </Link>
                  </td>
                  <td className="mono px-3 py-3 text-right text-ink-dim">{bytes(e.bytes)}</td>
                  <td className="mono px-3 py-3 text-right text-ink-dim">
                    v{e.projectVersion} · {shortHash(e.contentHash)}
                  </td>
                  <td className="mono px-3 py-3 text-right text-ink-mute">{relativeTime(e.createdAt)}</td>
                  <td className="mono px-3 py-3 text-right text-ink-mute">{relativeTime(e.expiresAt)}</td>
                  <td className="px-3 py-3 text-right">
                    {e.downloadUrl ? (
                      <a href={`${e.downloadUrl}&download=1`} className="text-[12px] text-signal hover:text-signal-soft">
                        Download
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
