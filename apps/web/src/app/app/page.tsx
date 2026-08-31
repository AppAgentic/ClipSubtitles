'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptionProject, Export, ProjectSummary, Task } from '@clipsubtitles/contracts';
import { AppShell } from '@/components/shell/AppShell';
import {
  Button,
  Chip,
  EmptyState,
  LinkButton,
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<CaptionProject | null>(null);
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
      setSelectedId((current) => current ?? p.projects[0]?.id ?? null);
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

  useEffect(() => {
    if (!selectedId) {
      setSelectedProject(null);
      return;
    }
    let cancelled = false;
    api
      .getProject(selectedId)
      .then((project) => {
        if (!cancelled) setSelectedProject(project);
      })
      .catch(() => {
        if (!cancelled) setSelectedProject(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

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

  const selectedSummary = projects?.find((project) => project.id === selectedId) ?? projects?.[0];

  return (
    <div className="dashboard-editorial">
      <section className="rise flex flex-col gap-5 border-b border-[#29241f] pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-signal">
            Your production desk
          </p>
          <h1 className="editorial-serif max-w-[760px] text-[36px] font-semibold leading-[1.02] tracking-[-0.045em] text-[#f3ece3] sm:text-[50px]">
            {greeting()} What are we creating today?
          </h1>
        </div>
        <LinkButton href="/app/new" variant="primary" size="lg" className="shrink-0">
          <span aria-hidden>＋</span> New video
        </LinkButton>
      </section>

      <section className="rise rise-1 mt-6 grid min-h-[132px] gap-5 rounded-xl border border-[#322c26] bg-[#11100e] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-7">
        <div className="flex items-center gap-4">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-[#4b4137] bg-[#1b1815] text-[23px] text-signal"
            aria-hidden
          >
            ↑
          </span>
          <div>
            <h2 className="editorial-serif text-[21px] font-semibold tracking-[-0.025em]">
              Start with a video
            </h2>
            <p className="mt-1 max-w-[580px] text-[12px] leading-relaxed text-ink-dim">
              Upload a clip or import a link. We’ll create the captions, then you can refine the
              words and choose the look.
            </p>
          </div>
        </div>
        <LinkButton href="/app/new" variant="ghost" className="w-full sm:w-auto">
          Choose a video <span aria-hidden>→</span>
        </LinkButton>
      </section>

      {projects === null ? (
        <DashboardSkeleton />
      ) : projects.length === 0 || !selectedSummary ? (
        <div className="rise rise-2 mt-6">
          <EmptyState
            title="Caption your first video."
            body="Upload a short video, review the words, choose a style and preview the result before you export."
            actions={
              <>
                <LinkButton href="/app/new" variant="primary">
                  Choose a video
                </LinkButton>
                {fixtures.map((fixture) => (
                  <Button
                    key={fixture.id}
                    onClick={() => void useDemo(fixture.id)}
                    loading={busy === fixture.id}
                  >
                    Try {fixture.title}
                  </Button>
                ))}
              </>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
            <SelectedProject
              summary={selectedSummary}
              project={selectedProject?.id === selectedSummary?.id ? selectedProject : null}
            />
            <section className="rise rise-3 overflow-hidden rounded-xl border border-[#332d27] bg-[#11100f]">
              <header className="flex items-center justify-between border-b border-[#2b2722] px-5 py-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                    Ready when you are
                  </p>
                  <h2 className="editorial-serif mt-1 text-[20px] font-semibold">Recent exports</h2>
                </div>
                <Link
                  href="/app/exports"
                  className="text-[12px] text-signal hover:text-signal-soft"
                >
                  View all
                </Link>
              </header>
              <ExportList exports={exports.slice(0, 5)} />
            </section>
          </div>

          <section className="rise rise-3 mt-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                  Your workspace
                </p>
                <h2 className="editorial-serif mt-1 text-[24px] font-semibold tracking-[-0.025em]">
                  Recent videos
                </h2>
              </div>
              <span className="mono text-[11px] text-ink-mute">{projects.length} saved</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {projects.slice(0, 6).map((project, index) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  index={index}
                  selected={project.id === selectedSummary?.id}
                  onSelect={() => setSelectedId(project.id)}
                  onDelete={() => void remove(project)}
                />
              ))}
            </div>
          </section>

          <section className="rise rise-4 mt-8 overflow-hidden rounded-xl border border-[#302a24] bg-[#100f0d]">
            <header className="flex items-center justify-between border-b border-[#29241f] px-5 py-4">
              <h2 className="editorial-serif text-[19px] font-semibold">In progress</h2>
              {hasActive ? (
                <Chip tone="signal" dot>
                  working
                </Chip>
              ) : (
                <span className="text-[11px] text-ink-mute">All caught up</span>
              )}
            </header>
            <TaskList tasks={tasks} onChanged={() => void load()} compact />
          </section>
        </>
      )}

      {projects && projects.length > 0 && fixtures.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-ink-mute">
          <span>Demo clips:</span>
          {fixtures.map((fixture) => (
            <Button
              key={fixture.id}
              size="sm"
              variant="subtle"
              onClick={() => void useDemo(fixture.id)}
              loading={busy === fixture.id}
            >
              {fixture.title}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SelectedProject({
  summary,
  project,
}: {
  summary: ProjectSummary;
  project: CaptionProject | null;
}) {
  return (
    <article className="rise rise-2 grid overflow-hidden rounded-xl border border-[#3a332b] bg-[#13110f] lg:grid-cols-[minmax(220px,0.8fr)_minmax(300px,1.2fr)]">
      <div className="relative min-h-[300px] overflow-hidden bg-[#070706] lg:min-h-[440px]">
        {project?.source?.playbackUrl ? (
          <video
            className="h-full w-full object-cover"
            src={project.source.playbackUrl}
            muted
            playsInline
            controls
            preload="metadata"
            aria-label={`Preview of ${summary.title}`}
          />
        ) : (
          <ProjectArtwork title={summary.title} index={0} large />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" />
        <div className="pointer-events-none absolute inset-x-5 bottom-5">
          <span className="inline-block rounded-md bg-black/70 px-3 py-2 text-[17px] font-bold leading-tight text-white shadow-lg">
            {summary.status === 'captioned'
              ? 'Your story, ready to share.'
              : projectStatusSentence(summary.status)}
          </span>
        </div>
      </div>
      <div className="flex flex-col p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.19em] text-signal">Continue editing</p>
            <h2 className="editorial-serif mt-2 text-[30px] font-semibold leading-tight tracking-[-0.04em] text-[#f3ece3]">
              {summary.title}
            </h2>
          </div>
          <Chip
            tone={statusTone(summary.status)}
            dot={summary.status === 'transcribing' || summary.status === 'importing'}
          >
            {titleCase(summary.status)}
          </Chip>
        </div>
        <dl className="mt-6 grid grid-cols-3 gap-3 border-y border-[#302a24] py-4 text-[11px]">
          <div>
            <dt className="text-ink-mute">Length</dt>
            <dd className="mono mt-1 text-[13px] text-ink">
              {summary.durationMs !== undefined ? timecode(summary.durationMs, false) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">Caption pages</dt>
            <dd className="mono mt-1 text-[13px] text-ink">{summary.pageCount}</dd>
          </div>
          <div>
            <dt className="text-ink-mute">Updated</dt>
            <dd className="mt-1 text-[13px] text-ink">{relativeTime(summary.updatedAt)}</dd>
          </div>
        </dl>
        <p className="mt-6 max-w-[44ch] text-[13px] leading-relaxed text-ink-dim">
          Review the words, find the right visual rhythm, preview the finished clip, then export
          when it feels right.
        </p>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-7">
          <LinkButton href={`/studio/${summary.id}`} variant="primary">
            Fix words
          </LinkButton>
          <LinkButton href={`/studio/${summary.id}?panel=styles`} variant="ghost">
            Try styles
          </LinkButton>
          <LinkButton href={`/studio/${summary.id}?preview=1`} variant="ghost">
            Preview
          </LinkButton>
          <LinkButton href={`/studio/${summary.id}/render`} variant="ghost">
            Export
          </LinkButton>
        </div>
      </div>
    </article>
  );
}

function ProjectCard({
  project,
  index,
  selected,
  onSelect,
  onDelete,
}: {
  project: ProjectSummary;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={`group overflow-hidden rounded-lg border bg-[#12110f] transition-[border,transform,background] hover:-translate-y-0.5 hover:bg-[#171411] ${selected ? 'border-signal/65' : 'border-[#322c26]'}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="grid w-full grid-cols-[112px_1fr] text-left"
      >
        <div className="h-[108px] overflow-hidden">
          <ProjectArtwork title={project.title} index={index} />
        </div>
        <div className="min-w-0 p-4">
          <div className="flex items-center justify-between gap-2">
            <Chip tone={statusTone(project.status)}>{titleCase(project.status)}</Chip>
            <span className="mono text-[10px] text-ink-mute">
              {project.durationMs !== undefined ? timecode(project.durationMs, false) : '—'}
            </span>
          </div>
          <h3 className="mt-3 truncate text-[14px] font-medium text-ink">{project.title}</h3>
          <p className="mt-1 text-[11px] text-ink-mute">
            Updated {relativeTime(project.updatedAt)}
          </p>
        </div>
      </button>
      <div className="flex items-center justify-between border-t border-[#2b2722] px-3 py-2">
        <Link
          href={`/studio/${project.id}`}
          className="text-[11px] text-signal hover:text-signal-soft"
        >
          Open video
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="text-[11px] text-ink-mute opacity-70 hover:text-danger group-hover:opacity-100"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function ProjectArtwork({
  title,
  index,
  large = false,
}: {
  title: string;
  index: number;
  large?: boolean;
}) {
  const backgrounds = [
    'from-[#43301e] via-[#1d1712] to-[#090909]',
    'from-[#25333a] via-[#171b1d] to-[#080909]',
    'from-[#3d2928] via-[#1e1414] to-[#090808]',
  ];
  return (
    <div
      className={`relative grid h-full w-full place-items-center bg-gradient-to-br ${backgrounds[index % backgrounds.length]}`}
    >
      <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_30%_20%,white_0,transparent_28%),linear-gradient(120deg,transparent_30%,white_31%,transparent_32%)]" />
      <span
        className={`editorial-serif relative text-center font-semibold text-white/80 ${large ? 'max-w-[11ch] text-[30px]' : 'max-w-[9ch] text-[16px]'}`}
      >
        {title}
      </span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-6 grid animate-pulse gap-5 xl:grid-cols-[1.7fr_0.8fr]">
      <div className="h-[450px] rounded-xl bg-[#171411]" />
      <div className="h-[450px] rounded-xl bg-[#141210]" />
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning.';
  if (hour < 18) return 'Good afternoon.';
  return 'Good evening.';
}

function projectStatusSentence(status: ProjectSummary['status']): string {
  switch (status) {
    case 'awaiting_source':
      return 'Add a video to begin.';
    case 'importing':
      return 'Preparing your video…';
    case 'transcribing':
      return 'Listening for every word…';
    case 'ready':
      return 'Ready for captions.';
    case 'failed':
      return 'This video needs attention.';
    default:
      return 'Your story, ready to shape.';
  }
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
