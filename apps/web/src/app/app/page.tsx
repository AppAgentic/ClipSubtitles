'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Export, ProjectSummary, Task } from '@clipsubtitles/contracts';
import { AppShell } from '@/components/shell/AppShell';
import {
  Button,
  Chip,
  EmptyState,
  LinkButton,
  Panel,
  Progress,
  statusTone,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { notifyCreditsChanged, useInterval } from '@/lib/hooks';
import { bytes, relativeTime, timecode, titleCase } from '@/lib/format';

export default function AppHomePage() {
  return <AppShell render={() => <Library />} />;
}

function Library() {
  const router = useRouter();
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [exports, setExports] = useState<Export[]>([]);
  const [fixtures, setFixtures] = useState<
    Array<{ id: string; title: string; available: boolean }>
  >([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, t, e] = await Promise.all([api.listProjects(), api.listTasks(), api.listExports()]);
      setProjects(p.projects);
      setTasks(t.tasks);
      setExports(e.exports);
    } catch (err) {
      toast.push('error', errorMessage(err));
    }
  }, [toast]);

  useEffect(() => {
    void load();
    api
      .devFixtures()
      .then((f) => setFixtures(f.fixtures.filter((x) => x.available)))
      .catch(() => setFixtures([]));
  }, [load]);

  const hasActive = tasks.some((t) => t.status === 'queued' || t.status === 'running');
  useInterval(() => void load(), hasActive ? 2000 : 15000);
  // A render finishing in the background settles credits: refresh the header balance when active tasks drain.
  const activeRenderCount = tasks.filter(
    (t) => t.kind === 'render_export' && (t.status === 'queued' || t.status === 'running'),
  ).length;
  const prevActiveRender = useRef(activeRenderCount);
  useEffect(() => {
    if (prevActiveRender.current > 0 && activeRenderCount === 0) notifyCreditsChanged();
    prevActiveRender.current = activeRenderCount;
  }, [activeRenderCount]);

  const useDemo = async (id: string) => {
    setBusy(id);
    try {
      const res = await api.createFixtureProject(id);
      router.push(`/studio/${res.project.id}`);
    } catch (err) {
      toast.push('error', errorMessage(err));
      setBusy(null);
    }
  };

  const remove = async (p: ProjectSummary) => {
    if (!window.confirm(`Delete "${p.title}" and its media now? This cannot be undone.`)) return;
    try {
      await api.deleteProject(p.id);
      toast.push('ok', 'Project and media deleted.');
      void load();
    } catch (err) {
      toast.push('error', errorMessage(err));
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className="rise mb-5 flex items-end justify-between">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Library</h1>
            <p className="text-[13px] text-ink-mute">
              Your videos, current progress and recent downloads in one place.
            </p>
          </div>
          <LinkButton href="/app/new" variant="primary">
            Caption a video
          </LinkButton>
        </div>

        {projects === null ? (
          <div className="text-[13px] text-ink-mute">Loading projects…</div>
        ) : projects.length === 0 ? (
          <div className="rise rise-1">
            <EmptyState
              title="Caption your first video."
              body="Upload a short video, review the words, choose a style and preview the result before you export."
              actions={
                <>
                  <LinkButton href="/app/new" variant="primary">
                    Choose a video
                  </LinkButton>
                  {fixtures.map((f) => (
                    <Button key={f.id} onClick={() => void useDemo(f.id)} loading={busy === f.id}>
                      Use demo: {f.title}
                    </Button>
                  ))}
                </>
              }
            />
          </div>
        ) : (
          <Panel className="rise rise-1 table-scroll overflow-hidden">
            <table className="w-full text-left text-[13px]">
              <thead className="text-[10px] uppercase tracking-[0.14em] text-ink-mute">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 font-medium">Video</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Length</th>
                  <th className="px-3 py-2.5 text-right font-medium">Captions</th>
                  <th className="px-3 py-2.5 text-right font-medium">Updated</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr
                    key={p.id}
                    className="group border-b border-line/60 transition-colors last:border-b-0 hover:bg-panel-2/60"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/studio/${p.id}`}
                        className="font-medium text-ink hover:text-signal"
                      >
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Chip
                        tone={statusTone(p.status)}
                        dot={p.status === 'transcribing' || p.status === 'importing'}
                      >
                        {titleCase(p.status)}
                      </Chip>
                    </td>
                    <td className="mono px-3 py-3 text-right text-ink-dim">
                      {p.durationMs !== undefined ? timecode(p.durationMs, false) : '—'}
                    </td>
                    <td className="mono px-3 py-3 text-right text-ink-dim">{p.pageCount}</td>
                    <td className="mono px-3 py-3 text-right text-ink-mute">
                      {relativeTime(p.updatedAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <LinkButton href={`/studio/${p.id}`} size="sm">
                          Open
                        </LinkButton>
                        <Button size="sm" variant="danger" onClick={() => void remove(p)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        {projects && projects.length > 0 && fixtures.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-mute">
            <span>Local demo clips:</span>
            {fixtures.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant="subtle"
                onClick={() => void useDemo(f.id)}
                loading={busy === f.id}
              >
                {f.title}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <aside className="flex flex-col gap-4">
        <Panel
          title="In progress"
          className="rise rise-2"
          aside={
            hasActive ? (
              <Chip tone="signal" dot>
                working
              </Chip>
            ) : null
          }
        >
          <TaskList tasks={tasks} onChanged={() => void load()} />
        </Panel>
        <Panel title="Recent exports" className="rise rise-3">
          <ExportList exports={exports.slice(0, 6)} />
        </Panel>
      </aside>
    </div>
  );
}

export function TaskList({
  tasks,
  onChanged,
  compact = false,
}: {
  tasks: Task[];
  onChanged?: () => void;
  compact?: boolean;
}) {
  const toast = useToast();
  const cancel = async (t: Task) => {
    try {
      await api.cancelTask(t.id);
      if (t.kind === 'render_export') notifyCreditsChanged();
      onChanged?.();
    } catch (err) {
      toast.push('error', errorMessage(err));
    }
  };
  if (tasks.length === 0)
    return <div className="px-4 py-3 text-[12px] text-ink-mute">Nothing in progress.</div>;
  return (
    <ul className="divide-y divide-line/70">
      {tasks.slice(0, compact ? 4 : 8).map((t) => {
        const active = t.status === 'queued' || t.status === 'running';
        return (
          <li key={t.id} className="px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-ink">{taskKindLabel(t.kind)}</span>
              <Chip tone={statusTone(t.status)} dot={active}>
                {taskStatusLabel(t.status)}
              </Chip>
            </div>
            <div className="mono mt-1 flex items-center justify-between text-[11px] text-ink-mute">
              <span>
                {t.projectId ? (
                  <Link href={`/studio/${t.projectId}`} className="hover:text-signal">
                    Open video
                  </Link>
                ) : (
                  'Background work'
                )}
              </span>
              <span>{relativeTime(t.updatedAt)}</span>
            </div>
            {active ? (
              <div className="mt-2 flex items-center gap-2">
                <Progress value={t.progress} className="flex-1" />
                <button
                  type="button"
                  onClick={() => void cancel(t)}
                  className="text-[11px] text-ink-mute hover:text-danger"
                >
                  cancel
                </button>
              </div>
            ) : null}
            {t.error ? (
              <div className="mt-1 text-[11px] text-danger">
                We could not finish this step. Try again or contact support.
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ExportList({ exports }: { exports: Export[] }) {
  if (exports.length === 0)
    return <div className="px-4 py-3 text-[12px] text-ink-mute">No finished files yet.</div>;
  return (
    <ul className="divide-y divide-line/70">
      {exports.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="mono rounded border border-line-strong px-1.5 py-[1px] text-[10px] uppercase text-ink-dim">
                {e.kind}
              </span>
              <span className="truncate text-[12px] text-ink">{e.fileName}</span>
            </div>
            <div className="mono mt-0.5 text-[11px] text-ink-mute">
              {bytes(e.bytes)} · available until {relativeTime(e.expiresAt)}
            </div>
          </div>
          {e.downloadUrl ? (
            <a
              href={`${e.downloadUrl}&download=1`}
              className="shrink-0 text-[12px] text-signal hover:text-signal-soft"
            >
              Download
            </a>
          ) : (
            <span className="text-[11px] text-ink-mute">removed</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function taskKindLabel(kind: Task['kind']): string {
  switch (kind) {
    case 'import_source':
      return 'Importing video';
    case 'finalize_upload':
      return 'Preparing video';
    case 'generate_captions':
      return 'Creating captions';
    case 'render_preview':
      return 'Creating preview';
    case 'render_export':
      return 'Creating export';
    case 'retention_sweep':
      return 'Cleaning up old files';
  }
}

function taskStatusLabel(status: Task['status']): string {
  switch (status) {
    case 'queued':
      return 'Waiting';
    case 'running':
      return 'Working';
    case 'succeeded':
      return 'Complete';
    case 'failed':
      return 'Needs attention';
    case 'cancelled':
      return 'Cancelled';
  }
}
