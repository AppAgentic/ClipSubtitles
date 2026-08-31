'use client';

import { useEffect, useState } from 'react';
import type { Connection, LedgerEntry, Me } from '@clipsubtitles/contracts';
import { AppShell } from '@/components/shell/AppShell';
import { Button, Chip, Field, KV, Panel, Slider, TextInput } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';

export default function AppSettingsPage() {
  return <AppShell render={(me) => <Settings me={me} />} />;
}

function Settings({ me }: { me: Me }) {
  const toast = useToast();
  const [name, setName] = useState(me.workspace.name);
  const [sourceDays, setSourceDays] = useState(me.workspace.retention.sourceDays);
  const [exportDays, setExportDays] = useState(me.workspace.retention.exportDays);
  const [saving, setSaving] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  const load = () => {
    api
      .connections()
      .then((r) => setConnections(r.connections))
      .catch(() => undefined);
    api
      .ledger()
      .then((r) => setLedger(r.entries))
      .catch(() => undefined);
  };
  useEffect(load, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateWorkspace({ name, retention: { sourceDays, exportDays } });
      toast.push('ok', 'Settings saved.');
    } catch (err) {
      toast.push('error', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (c: Connection) => {
    if (
      !window.confirm(
        `Disconnect ${c.clientName ?? 'this agent'}? It will no longer be able to access your ClipSubtitles account.`,
      )
    )
      return;
    try {
      await api.revokeConnection(c.id);
      toast.push('ok', 'Agent disconnected.');
      load();
    } catch (err) {
      toast.push('error', errorMessage(err));
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-5">
        <Panel title="Account" className="rise p-4">
          <KV k="User" v={me.user.displayName ?? '—'} />
          <KV k="Email" v={me.user.emailMasked ?? '—'} mono />
        </Panel>
        <Panel title="Workspace and storage" className="rise rise-1 p-4">
          <div className="flex flex-col gap-4">
            <Field label="Workspace name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </Field>
            <Field
              label="Keep original videos"
              hint="Original uploads are automatically deleted after this many days."
            >
              <Slider
                value={sourceDays}
                min={1}
                max={365}
                onChange={setSourceDays}
                format={(v) => `${v} d`}
              />
            </Field>
            <Field
              label="Keep finished files"
              hint="Finished files are automatically deleted after this many days. You can create them again from a saved video project."
            >
              <Slider
                value={exportDays}
                min={1}
                max={90}
                onChange={setExportDays}
                format={(v) => `${v} d`}
              />
            </Field>
            <div>
              <Button variant="primary" onClick={() => void save()} loading={saving}>
                Save
              </Button>
            </div>
          </div>
        </Panel>
        <Panel title="Your data" className="rise rise-2 p-4">
          <p className="text-[12px] text-ink-dim">
            Deleting a video project removes its original video and finished files immediately.
            Caption text is used only to create your project and exports.
          </p>
        </Panel>
      </div>
      <div className="flex flex-col gap-5">
        <Panel
          title="Connected agents"
          className="rise rise-1"
          aside={<span className="text-[11px] text-ink-mute">{connections.length}</span>}
        >
          {connections.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-ink-mute">
              No agents are connected. Visit the developer guide when you want an AI agent to
              caption videos for you.
            </div>
          ) : (
            <ul className="divide-y divide-line/70">
              {connections.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="text-[13px] text-ink">{c.clientName ?? 'Connected agent'}</div>
                    <div className="mono mt-0.5 text-[11px] text-ink-mute">
                      Can work with your caption projects · last used{' '}
                      {c.lastUsedAt ? relativeTime(c.lastUsedAt) : 'never'}
                    </div>
                  </div>
                  {c.revokedAt ? (
                    <Chip tone="danger">disconnected</Chip>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => void revoke(c)}>
                      Disconnect
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Credit activity"
          className="rise rise-2"
          aside={
            <span className="mono text-[11px] text-ink-dim">{me.credits.available} available</span>
          }
        >
          {ledger.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-ink-mute">No entries.</div>
          ) : (
            <ul className="divide-y divide-line/70">
              {ledger.slice(0, 12).map((e) => (
                <li key={e.id} className="flex items-center justify-between px-4 py-2 text-[12px]">
                  <span className="text-ink-dim">{creditActivityLabel(e.kind)}</span>
                  <span className={`mono ${e.amount < 0 ? 'text-signal' : 'text-phosphor'}`}>
                    {e.amount > 0 ? '+' : ''}
                    {e.amount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function creditActivityLabel(kind: LedgerEntry['kind']): string {
  switch (kind) {
    case 'grant':
      return 'Credits added';
    case 'reserve':
      return 'Export started';
    case 'settle':
      return 'Export completed';
    case 'release':
      return 'Credits returned';
    case 'adjust':
      return 'Balance adjusted';
  }
}
