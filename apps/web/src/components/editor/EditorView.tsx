'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CaptionPage,
  CaptionPosition,
  CaptionProject,
  GenerateCaptionsRequest,
  PatchOp,
  StyleConfig,
  StylePatch,
  StylePresetId,
  TranscriptWord,
} from '@clipsubtitles/contracts';
import { applyStylePatch } from '@clipsubtitles/core';
import { Dialog } from '@/components/ui/Dialog';
import { Button, Chip, LinkButton, Progress, statusTone } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api, errorMessage, loadAllWords } from '@/lib/api';
import { isActiveTask, useTask } from '@/lib/hooks';
import { titleCase } from '@/lib/format';
import { PatchQueue } from '@/lib/patch-queue';
import { trackPaidFunnelEventOnce } from '@/lib/attribution';
import { GenerateDialog } from './GenerateDialog';
import { PageList } from './PageList';
import { StyleInspector } from './StyleInspector';
import { VideoStage, type StageHandle } from './VideoStage';
import { WordEditor } from './WordEditor';

type SaveState = 'idle' | 'saving' | 'conflict' | 'error';

const WORD_OPS = new Set<PatchOp['op']>([
  'replace_word_text',
  'delete_word',
  'insert_word',
  'set_word_timing',
]);

export function EditorView({ projectId }: { projectId: string }) {
  const toast = useToast();
  const search = useSearchParams();
  const [project, setProject] = useState<CaptionProject | null>(null);
  const [words, setWords] = useState<TranscriptWord[]>([]);
  const [style, setStyle] = useState<StyleConfig | null>(null);
  const [save, setSave] = useState<SaveState>('idle');
  const [timeMs, setTimeMs] = useState(0);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [tab, setTab] = useState<'style' | 'words'>('style');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateTaskId, setGenerateTaskId] = useState<string | null>(null);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const stage = useRef<StageHandle | null>(null);
  const queue = useRef<PatchQueue | null>(null);

  const reloadWords = useCallback(
    async (p: CaptionProject) => {
      if (p.transcript?.wordCount) setWords(await loadAllWords(projectId, p.transcript.wordCount));
      else setWords([]);
    },
    [projectId],
  );

  const load = useCallback(async () => {
    const p = await api.getProject(projectId);
    setProject(p);
    setStyle(p.style);
    queue.current?.resetVersion(p.version);
    await reloadWords(p);
    const gen = p.activeTasks.find((t) => t.kind === 'generate_captions');
    if (gen) setGenerateTaskId(gen.id);
    setSave('idle');
    return p;
  }, [projectId, reloadWords]);

  // One serialized PATCH queue per project; disposed (flushing pending style with keepalive) on unmount.
  useEffect(() => {
    const q = new PatchQueue(0, {
      send: (expectedVersion, ops, opts) => api.patchProject(projectId, expectedVersion, ops, opts),
      onResult: (res, ops) => {
        setProject((prev) =>
          prev
            ? { ...res.project, transcript: res.project.transcript ?? prev.transcript }
            : res.project,
        );
        if (!q.hasPendingStyle) setStyle(res.project.style);
        if (res.newRevision || ops.some((o) => WORD_OPS.has(o.op))) void reloadWords(res.project);
      },
      onError: (err) => {
        if (err instanceof ApiClientError && err.code === 'VERSION_CONFLICT') {
          q.cancelPendingStyle();
          setSave('conflict');
        } else {
          setSave('error');
          toast.push('error', errorMessage(err));
        }
      },
      // Only a clean "saving" run settles to idle; conflict/error states persist until the user acts.
      onIdle: () => setSave((s) => (s === 'saving' ? 'idle' : s)),
    });
    queue.current = q;
    return () => {
      q.dispose();
      queue.current = null;
    };
  }, [projectId, reloadWords, toast]);

  useEffect(() => {
    load()
      .then(async (p) => {
        if (search.get('generate') !== '1' || p.transcript || p.status !== 'ready') return;
        if (search.get('onboarding') !== '1') {
          setGenerateOpen(true);
          return;
        }
        setGenerateBusy(true);
        try {
          const res = await api.generateCaptions(projectId, {
            preset: 'clean',
            position: 'bottom',
            idempotencyKey: `web-onboarding-${p.id}-${p.version}`,
          });
          setGenerateTaskId(res.task.id);
          setProject((current) =>
            current
              ? { ...res.project, transcript: res.project.transcript ?? current.transcript }
              : res.project,
          );
          queue.current?.resetVersion(res.project.version, false);
        } catch (err) {
          toast.push('error', errorMessage(err));
          setGenerateOpen(true);
        } finally {
          setGenerateBusy(false);
        }
      })
      .catch((err) => toast.push('error', errorMessage(err)));
  }, [load, projectId, search, toast]);

  // Generation task: poll, then reload.
  const { task: genTask } = useTask(generateTaskId);
  useEffect(() => {
    if (!genTask) return;
    if (genTask.status === 'succeeded') {
      setGenerateTaskId(null);
      load()
        .then(() => toast.push('ok', 'Captions generated.'))
        .catch(() => undefined);
    } else if (genTask.status === 'failed' || genTask.status === 'cancelled') {
      setGenerateTaskId(null);
      toast.push(
        'error',
        genTask.error
          ? `${genTask.error.code}: ${genTask.error.message}`
          : `Generation ${genTask.status}.`,
      );
      load().catch(() => undefined);
    }
  }, [genTask, load, toast]);

  // Preview task: poll, then show.
  const { task: previewTask, exports: previewExports } = useTask(previewTaskId);
  useEffect(() => {
    if (!previewTask) return;
    if (previewTask.status === 'succeeded') {
      setPreviewUrl(previewExports[0]?.downloadUrl ?? null);
      setPreviewTaskId(null);
      trackPaidFunnelEventOnce('preview_seen', { project_id: projectId });
    } else if (previewTask.status === 'failed' || previewTask.status === 'cancelled') {
      setPreviewTaskId(null);
      toast.push(
        'error',
        previewTask.error
          ? `${previewTask.error.code}: ${previewTask.error.message}`
          : 'Preview failed.',
      );
    }
  }, [previewTask, previewExports, toast]);

  const sendOps = useCallback(
    (ops: PatchOp[]) => {
      if (!queue.current) return;
      if (ops.some((op) => WORD_OPS.has(op.op))) {
        trackPaidFunnelEventOnce('first_edit_made', { project_id: projectId });
      }
      setSave('saving');
      void queue.current.enqueue(ops);
    },
    [projectId],
  );

  /** Style edits: instant local feedback; persistence is coalesced and serialized by the queue. */
  const onStyle = useCallback(
    (patch: StylePatch) => {
      trackPaidFunnelEventOnce('style_previewed', { project_id: projectId });
      setStyle((prev) => {
        if (!prev) return prev;
        try {
          return applyStylePatch(prev, patch);
        } catch {
          return prev;
        }
      });
      setSave('saving');
      queue.current?.style(patch);
    },
    [projectId],
  );

  const onPreset = useCallback(
    (preset: StylePresetId) => {
      trackPaidFunnelEventOnce('style_previewed', { project_id: projectId, preset });
      sendOps([{ op: 'set_preset', preset }]);
    },
    [projectId, sendOps],
  );
  const onPosition = useCallback(
    (position: CaptionPosition) => {
      trackPaidFunnelEventOnce('style_previewed', { project_id: projectId, position });
      setStyle((prev) => (prev ? { ...prev, position } : prev));
      sendOps([{ op: 'set_position', position }]);
    },
    [projectId, sendOps],
  );

  const generate = async (req: GenerateCaptionsRequest) => {
    if (generateBusy) return;
    setGenerateBusy(true);
    try {
      await queue.current?.flushStyle();
      const res = await api.generateCaptions(projectId, req);
      setGenerateOpen(false);
      setGenerateTaskId(res.task.id);
      setProject((prev) =>
        prev
          ? { ...res.project, transcript: res.project.transcript ?? prev.transcript }
          : res.project,
      );
      queue.current?.resetVersion(res.project.version, false);
    } catch (err) {
      toast.push('error', errorMessage(err));
    } finally {
      setGenerateBusy(false);
    }
  };

  const preview = async () => {
    try {
      await queue.current?.flushStyle();
      const res = await api.createPreview(projectId, {
        startMs: Math.max(0, timeMs - 500),
        durationMs: 8000,
        resolution: '480p',
      });
      setPreviewTaskId(res.task.id);
    } catch (err) {
      toast.push('error', errorMessage(err));
    }
  };

  const commitTitle = () => {
    if (titleDraft !== null && project && titleDraft.trim() && titleDraft.trim() !== project.title)
      sendOps([{ op: 'set_title', title: titleDraft.trim() }]);
    setTitleDraft(null);
  };

  const pages = project?.pages ?? [];
  const activePage = useMemo(
    () => pages.find((p) => timeMs >= p.startMs && timeMs < p.endMs) ?? null,
    [pages, timeMs],
  );
  const selectedPage: CaptionPage | null = useMemo(
    () =>
      pages.find((p) => p.id === selectedPageId) ??
      activePage ??
      pages.find((p) => p.id === project?.qa?.issues[0]?.pageId) ??
      pages[0] ??
      null,
    [pages, selectedPageId, activePage, project?.qa?.issues],
  );
  const busy = save === 'saving';

  useEffect(() => {
    if (project?.transcript?.wordCount) {
      trackPaidFunnelEventOnce('transcript_ready', { project_id: projectId });
    }
  }, [project?.transcript?.wordCount, projectId]);

  if (!project || !style)
    return <div className="p-6 text-[13px] text-ink-mute">Loading project…</div>;

  const qa = project.qa;
  const qaErrors = qa?.issues.filter((i) => i.severity === 'error').length ?? 0;
  const qaWarnings = qa?.issues.filter((i) => i.severity === 'warning').length ?? 0;
  const hasTranscript = Boolean(project.transcript && words.length > 0);
  const generating = isActiveTask(genTask) || project.status === 'transcribing';

  return (
    <div className="flex min-h-[560px] flex-col gap-3 lg:h-[calc(100vh-48px-32px)]">
      {search.get('onboarding') === '1' ? (
        <ol
          className="rise grid grid-cols-3 border-b border-line pb-3 text-[10px] text-ink-mute lg:hidden"
          aria-label="Captioning steps"
        >
          <li>
            <span className="mono mr-1">01</span>Upload
          </li>
          <li className="text-center font-semibold text-signal">
            <span className="mono mr-1">02</span>Review &amp; style
          </li>
          <li className="text-right">
            <span className="mono mr-1">03</span>Export
          </li>
        </ol>
      ) : null}
      <header className="rise flex flex-wrap items-center gap-3">
        <Link href="/app" className="mono text-[11px] text-ink-mute hover:text-ink">
          ← library
        </Link>
        {titleDraft === null ? (
          <button
            type="button"
            onClick={() => setTitleDraft(project.title)}
            className="max-w-[40vw] truncate text-[20px] font-semibold tracking-[-0.025em] hover:text-signal-soft"
            title="Rename"
          >
            {project.title}
          </button>
        ) : (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') setTitleDraft(null);
            }}
            aria-label="Project title"
            className="h-8 rounded-md border border-signal bg-bg-elev px-2 text-[16px] font-semibold"
            maxLength={200}
          />
        )}
        <Chip tone={statusTone(project.status)} dot={generating}>
          {titleCase(project.status)}
        </Chip>
        {qa ? (
          <Chip
            tone={qaErrors ? 'danger' : qaWarnings ? 'warn' : 'ok'}
            className="normal-case tracking-normal"
          >
            {qaErrors
              ? `${qaErrors} issues to fix`
              : qaWarnings
                ? `${qaWarnings} items to review`
                : 'Ready to preview'}
          </Chip>
        ) : null}
        <span className="flex-1" />
        <SaveIndicator
          state={save}
          onReload={() => load().catch((err) => toast.push('error', errorMessage(err)))}
        />
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setGenerateOpen(true)}
            disabled={
              generating || project.status === 'awaiting_source' || project.status === 'importing'
            }
          >
            {hasTranscript ? 'Regenerate' : 'Generate captions'}
          </Button>
          <Button
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => void preview()}
            disabled={!hasTranscript || isActiveTask(previewTask)}
            loading={isActiveTask(previewTask)}
          >
            Preview 8s
          </Button>
          <LinkButton
            href={`/studio/${project.id}/render`}
            variant="primary"
            size="sm"
            className="flex-1 sm:flex-none"
          >
            Continue to export
          </LinkButton>
        </div>
      </header>

      {generating && genTask ? (
        <div
          className="rise flex items-center gap-3 rounded-lg border border-signal/30 bg-signal/5 px-3 py-2 text-[12px]"
          role="status"
        >
          <span className="record-dot h-2 w-2 rounded-full bg-signal" />
          <span className="text-ink">Generating captions</span>
          <span className="mono text-ink-mute">{genTask.stage ?? genTask.status}</span>
          <Progress value={genTask.progress} className="flex-1" />
          <button
            type="button"
            className="text-ink-mute hover:text-danger"
            onClick={() => api.cancelTask(genTask.id).catch(() => undefined)}
          >
            cancel
          </button>
        </div>
      ) : project.status === 'awaiting_source' ? (
        <div className="rise flex items-center gap-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[12px] text-ink-dim">
          This project has no source yet.
          <LinkButton href={`/studio/${project.id}/upload`} size="sm">
            Upload the clip
          </LinkButton>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        <section className="rise rise-2 order-1 min-h-[300px] sm:min-h-[420px] lg:order-2 lg:min-h-0">
          {project.source ? (
            <VideoStage
              source={project.source}
              words={words}
              pages={pages}
              style={style}
              timeMs={timeMs}
              onTime={setTimeMs}
              handleRef={stage}
            />
          ) : (
            <div className="squircle grid h-full place-items-center border border-dashed border-line-strong text-[12px] text-ink-mute">
              No source media.
            </div>
          )}
        </section>

        <section
          className="squircle rise rise-1 order-2 flex max-h-[420px] min-h-0 flex-col overflow-hidden border border-line bg-panel/80 lg:order-1 lg:max-h-none"
          aria-label="Caption pages"
        >
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
              Caption scenes
            </h2>
            <span className="mono text-[11px] text-ink-mute">{pages.length}</span>
          </header>
          <PageList
            pages={pages}
            qa={qa}
            activePageId={activePage?.id ?? null}
            selectedPageId={selectedPage?.id ?? null}
            onSelect={(p) => {
              setSelectedPageId(p.id);
              stage.current?.seek(p.startMs + 1);
              setTab('words');
            }}
            onMergeNext={(p) => sendOps([{ op: 'merge_page_with_next', pageId: p.id }])}
            busy={busy}
          />
        </section>

        <section
          className="squircle rise rise-3 order-3 flex max-h-[560px] min-h-0 flex-col overflow-hidden border border-line bg-panel/80 lg:max-h-none"
          aria-label="Inspector"
        >
          <header
            className="m-2 flex items-center rounded-full border border-line bg-bg-elev p-1"
            role="tablist"
          >
            {(['style', 'words'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-full px-4 py-2 text-[11px] font-semibold transition-colors ${tab === t ? 'bg-bg-elev text-ink shadow-[var(--shadow-card)]' : 'text-ink-mute hover:text-ink-dim'}`}
              >
                {t === 'words' ? 'Correct words' : 'Style'}
              </button>
            ))}
          </header>
          {tab === 'style' ? (
            <StyleInspector
              style={style}
              onStyle={onStyle}
              onPreset={onPreset}
              onPosition={onPosition}
              busy={busy}
            />
          ) : (
            <WordEditor
              page={selectedPage}
              words={words}
              onOps={sendOps}
              onSeek={(ms) => stage.current?.seek(ms)}
              busy={busy}
            />
          )}
        </section>
      </div>

      <GenerateDialog
        open={generateOpen}
        hasTranscript={hasTranscript}
        onClose={() => setGenerateOpen(false)}
        onSubmit={generate}
        busy={generateBusy}
      />

      <Dialog
        open={Boolean(previewUrl)}
        onClose={() => setPreviewUrl(null)}
        title="Video preview"
        description="A quick preview of your current captions, style and motion before export."
        width={720}
      >
        {previewUrl ? (
          <div className="mt-3 flex flex-col items-center gap-3">
            <video
              src={previewUrl}
              controls
              autoPlay
              className="max-h-[60vh] rounded-xl shadow-2xl"
            />
            <div className="flex items-center gap-3 text-[12px] text-ink-mute">
              <a href={`${previewUrl}&download=1`} className="text-signal hover:text-signal-soft">
                Download preview
              </a>
              <Button size="sm" onClick={() => setPreviewUrl(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      {previewTaskId && previewTask ? (
        <div
          className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line-strong bg-panel-2/95 px-4 py-2 text-[12px] shadow-xl"
          role="status"
        >
          <span className="record-dot h-2 w-2 rounded-full bg-signal" />
          Rendering preview ·{' '}
          <span className="mono">
            {previewTask.stage ?? previewTask.status} {previewTask.progress}%
          </span>
        </div>
      ) : null}
    </div>
  );
}

function SaveIndicator({ state, onReload }: { state: SaveState; onReload: () => void }) {
  if (state === 'conflict') {
    return (
      <span
        className="flex items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn"
        role="alert"
      >
        Newer changes are available
        <button type="button" onClick={onReload} className="underline hover:text-ink">
          reload them
        </button>
      </span>
    );
  }
  if (state === 'error') return <span className="text-[11px] text-danger">Save failed</span>;
  if (state === 'saving') return <span className="mono text-[11px] text-ink-mute">saving…</span>;
  return <span className="mono text-[11px] text-ink-mute">saved</span>;
}
