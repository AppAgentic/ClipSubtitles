'use client';

import Link from 'next/link';
import { useCallback, useEffect, useReducer, useState } from 'react';
import type { CaptionProject, Export, OutputKind, OutputSettings } from '@clipsubtitles/contracts';
import { PRICE_TABLE } from '@clipsubtitles/contracts';
import { Button, Chip, KV, Panel, Progress, Segmented, statusTone } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api, errorMessage } from '@/lib/api';
import { isActiveTask, notifyCreditsChanged, useTask } from '@/lib/hooks';
import { bytes, relativeTime, shortHash, timecode } from '@/lib/format';
import { canApprove, canQuote, formLocked, initialRenderFlowState, isTaskTerminal, renderFlowReducer } from '@/lib/render-flow-state';
import { ExportList } from '@/app/page';

const OUTPUT_LABELS: Record<OutputKind, { label: string; hint: string }> = {
  mp4: { label: 'MP4 with captions burned in', hint: 'H.264 + AAC, ready to post' },
  overlay: { label: 'Transparent overlay (ProRes 4444 .mov)', hint: 'Captions only, for your editor' },
  srt: { label: 'SRT subtitle file', hint: 'Free' },
  vtt: { label: 'WebVTT subtitle file', hint: 'Free' },
};

export function RenderFlow({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [project, setProject] = useState<CaptionProject | null>(null);
  const [state, dispatch] = useReducer(renderFlowReducer, undefined, initialRenderFlowState);
  const [quoting, setQuoting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [history, setHistory] = useState<Export[]>([]);
  const { task, exports } = useTask(state.taskId);

  const reload = useCallback(() => {
    api.getProject(projectId).then(setProject).catch((err) => toast.push('error', errorMessage(err)));
    api.listExports({ projectId }).then((r) => setHistory(r.exports)).catch(() => undefined);
  }, [projectId, toast]);
  useEffect(() => reload(), [reload]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Track task status in the flow state; on any terminal state credits settled/released → refresh the header balance.
  useEffect(() => {
    if (!task) return;
    dispatch({ type: 'task_status', status: task.status });
    if (!isActiveTask(task)) {
      notifyCreditsChanged();
      reload();
    }
  }, [task, reload]);

  const getQuote = async () => {
    setQuoting(true);
    try {
      dispatch({ type: 'quoted', quote: await api.createQuote(projectId, state.settings) });
    } catch (err) {
      dispatch({ type: 'quote_failed' });
      toast.push('error', errorMessage(err));
    } finally {
      setQuoting(false);
    }
  };

  const approve = async () => {
    const quote = state.quote;
    if (!quote) return;
    setStarting(true);
    try {
      // The approval echoes the immutable quote (id + exact credits); the idempotency key is bound to the quote.
      const res = await api.startRender(projectId, { quoteId: quote.id, approvedCreditCost: quote.creditCost, idempotencyKey: `web-render-${quote.id}` });
      dispatch({ type: 'render_started', taskId: res.task.id });
      notifyCreditsChanged();
      toast.push('ok', `${res.reservedCredits} credits reserved. Rendering…`);
    } catch (err) {
      if (err instanceof ApiClientError && (err.code === 'QUOTE_EXPIRED' || err.code === 'QUOTE_INVALIDATED' || err.code === 'QUOTE_MISMATCH')) {
        dispatch({ type: 'quote_failed' });
        toast.push('error', `${err.message} Request a new quote.`);
        reload();
      } else {
        toast.push('error', errorMessage(err));
      }
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!task) return;
    try {
      await api.cancelTask(task.id);
      notifyCreditsChanged();
    } catch (err) {
      toast.push('error', errorMessage(err));
    }
  };

  if (!project) return <div className="text-[13px] text-ink-mute">Loading…</div>;
  const durationMs = project.source?.durationMs ?? 0;
  const projectReady = project.status === 'captioned' && project.pageCount > 0;
  const locked = formLocked(state);
  const quote = state.quote;
  const secondsLeft = quote ? Math.max(0, Math.floor((Date.parse(quote.expiresAt) - now) / 1000)) : 0;
  const quoteStale = Boolean(quote && (quote.projectVersion !== project.version || quote.contentHash !== project.contentHash));
  const approveEnabled = canApprove(state, now, project) && !starting;
  const terminal = isTaskTerminal(state);

  return (
    <div className="mx-auto grid max-w-[1100px] gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-5">
        <div className="rise">
          <Link href={`/projects/${project.id}`} className="mono text-[11px] text-ink-mute hover:text-ink">
            ← back to editor
          </Link>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em]">Export {project.title}</h1>
          <p className="text-[13px] text-ink-mute">Renders are deterministic for an exact project version. You approve an immutable quote before any credits are reserved.</p>
        </div>

        <Panel title="Output settings" className="rise rise-1 p-4" aside={locked ? <span className="mono text-[11px] text-ink-mute">frozen for this render</span> : null}>
          <fieldset disabled={locked} className="grid gap-2">
            {(Object.keys(OUTPUT_LABELS) as OutputKind[]).map((kind) => {
              const on = state.settings.outputs.includes(kind);
              const rate = PRICE_TABLE.perMinute[kind][state.settings.resolution];
              return (
                <label key={kind} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${on ? 'border-signal/50 bg-signal/5' : 'border-line-strong hover:border-ink-mute'} ${locked ? 'cursor-not-allowed opacity-60' : ''}`}>
                  <span className="flex items-center gap-3">
                    <input type="checkbox" checked={on} onChange={() => dispatch({ type: 'toggle_output', kind })} className="accent-[#ff7a1a]" />
                    <span>
                      <span className="block text-[13px] text-ink">{OUTPUT_LABELS[kind].label}</span>
                      <span className="block text-[11px] text-ink-mute">{OUTPUT_LABELS[kind].hint}</span>
                    </span>
                  </span>
                  <span className="mono text-[11px] text-ink-dim">{rate ? `${rate} cr/min` : 'free'}</span>
                </label>
              );
            })}
          </fieldset>
          <div className={`mt-4 grid gap-4 md:grid-cols-3 ${locked ? 'pointer-events-none opacity-60' : ''}`} aria-disabled={locked}>
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-mute">Resolution</div>
              <Segmented value={state.settings.resolution} onChange={(v) => dispatch({ type: 'settings', patch: { resolution: v as OutputSettings['resolution'] } })} size="sm" options={[{ value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }, { value: 'source', label: 'Source' }]} />
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-mute">Frame rate</div>
              <Segmented value={String(state.settings.fps)} onChange={(v) => dispatch({ type: 'settings', patch: { fps: v === 'source' ? 'source' : (Number(v) as 24 | 25 | 30 | 60) } })} size="sm" options={[{ value: 'source', label: 'Src' }, { value: '24', label: '24' }, { value: '30', label: '30' }, { value: '60', label: '60' }]} />
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-mute">Quality</div>
              <Segmented value={state.settings.quality} onChange={(v) => dispatch({ type: 'settings', patch: { quality: v as OutputSettings['quality'] } })} size="sm" options={[{ value: 'standard', label: 'Standard' }, { value: 'high', label: `High ×${PRICE_TABLE.highQualityMultiplier}` }]} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {terminal ? (
              <Button variant="primary" onClick={() => dispatch({ type: 'reset' })}>
                Render again
              </Button>
            ) : (
              <Button variant="primary" onClick={() => void getQuote()} loading={quoting} disabled={!canQuote(state, projectReady) || quoting}>
                Get quote
              </Button>
            )}
            {!projectReady ? <span className="text-[12px] text-warn">Generate captions before exporting.</span> : null}
            {state.quoteDroppedReason === 'settings_changed' ? <span className="text-[12px] text-warn">Settings changed — request a new quote.</span> : null}
          </div>
        </Panel>

        {history.length > 0 ? (
          <Panel title="Previous exports for this project" className="rise rise-3">
            <ExportList exports={history} />
          </Panel>
        ) : null}
      </div>

      <div className="flex flex-col gap-5">
        <Panel title="Project" className="rise rise-1 p-4">
          <KV k="Status" v={<Chip tone={statusTone(project.status)}>{project.status}</Chip>} />
          <KV k="Version" v={`v${project.version}`} mono />
          <KV k="Content hash" v={`${shortHash(project.contentHash)}…`} mono />
          <KV k="Duration" v={timecode(durationMs)} mono />
          <KV k="Caption pages" v={project.pageCount} mono />
          <KV k="Style" v={`${project.style.preset} · ${project.style.position}`} />
        </Panel>

        {quote ? (
          <section aria-label="Immutable render quote" className={`rise rounded-[14px] border p-4 ${quoteStale ? 'border-warn/50' : 'border-signal/50 shadow-[0_0_0_1px_rgb(255_122_26/0.2),0_20px_60px_-20px_rgb(255_122_26/0.5)]'}`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-signal">Immutable quote</h2>
              <span className={`mono text-[11px] ${secondsLeft < 60 ? 'text-warn' : 'text-ink-mute'}`}>{locked ? quote.status : secondsLeft > 0 ? `expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}` : 'expired'}</span>
            </div>
            <KV k="Quote" v={quote.id} mono />
            <KV k="For version" v={`v${quote.projectVersion} · ${shortHash(quote.contentHash)}…`} mono />
            <KV k="Quoted settings" v={`${quote.settings.outputs.map((o) => o.toUpperCase()).join(' + ')} · ${quote.settings.resolution} · ${quote.settings.fps} fps · ${quote.settings.quality}`} />
            <KV k="Billable" v={`${quote.billableMinutes.toFixed(2)} min`} mono />
            <div className="mt-2 border-b border-line/70 pb-2">
              {quote.expectedOutputs.map((o) => (
                <div key={o.kind} className="flex items-center justify-between py-1 text-[12px]">
                  <span className="text-ink-dim">
                    {o.kind.toUpperCase()} {o.width && o.height ? <span className="mono text-ink-mute">{o.width}×{o.height}</span> : null}
                  </span>
                  <span className="mono text-ink">{o.priced ? `${o.credits} cr` : 'free'}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-[12px] text-ink-mute">Total (price {quote.priceVersion})</span>
              <span className="text-[28px] font-semibold tracking-[-0.03em] text-ink">
                {quote.creditCost} <span className="text-[13px] font-normal text-ink-mute">credits</span>
              </span>
            </div>
            {quoteStale ? <p className="mt-2 text-[12px] text-warn">The project changed since this quote. Request a new one.</p> : null}
            {!locked ? (
              <>
                <Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => void approve()} loading={starting} disabled={!approveEnabled}>
                  Approve {quote.creditCost} credits &amp; render
                </Button>
                <p className="mt-2 text-[11px] text-ink-mute">Credits are reserved now and charged once when the render succeeds; failures and cancellations release them.</p>
              </>
            ) : null}
          </section>
        ) : null}

        {task ? (
          <Panel title="Render task" className="rise p-4" aside={<Chip tone={statusTone(task.status)} dot={isActiveTask(task)}>{task.status}</Chip>}>
            <div className="mono mb-2 text-[11px] text-ink-mute">{task.id}</div>
            {isActiveTask(task) ? (
              <>
                <Progress value={task.progress} />
                <div className="mono mt-1 flex justify-between text-[11px] text-ink-mute">
                  <span>{task.stage ?? task.status}</span>
                  <span>{task.progress}%</span>
                </div>
                <Button size="sm" variant="danger" className="mt-3" onClick={() => void cancel()}>
                  Cancel render
                </Button>
              </>
            ) : task.status === 'succeeded' ? (
              <>
                <ul className="divide-y divide-line/70">
                  {exports.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-ink">{e.fileName}</span>
                        <span className="mono block text-[11px] text-ink-mute">
                          {bytes(e.bytes)} · sha256 {shortHash(e.sha256)}… · expires {relativeTime(e.expiresAt)}
                        </span>
                      </span>
                      {e.downloadUrl ? (
                        <a href={`${e.downloadUrl}&download=1`} className="shrink-0 rounded-md border border-signal/50 px-2 py-1 text-[12px] text-signal hover:bg-signal/10">
                          Download
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between text-[11px] text-ink-mute">
                  <span>Credits charged once; balance updated.</span>
                  <Button size="sm" onClick={() => dispatch({ type: 'reset' })}>
                    Render again
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-[12px] text-danger">
                {task.error ? `${task.error.code}: ${task.error.message}` : `Render ${task.status}.`} {task.error?.errorRef ? <span className="mono text-ink-mute">{task.error.errorRef}</span> : null}
                <div className="mt-1 text-ink-mute">No credits were charged.</div>
                <Button size="sm" className="mt-3" onClick={() => dispatch({ type: 'reset' })}>
                  Try again
                </Button>
              </div>
            )}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
