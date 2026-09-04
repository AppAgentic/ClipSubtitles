'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { api, type AdminJob, type AdminOverview, type AdminUser } from '@/lib/api';
import { Spinner } from '@/components/ui/primitives';

export default function AdminPage() {
  return <AppShell wide render={(me) => (me.isAdmin ? <Operations /> : <Denied />)} />;
}

function Operations() {
  const [data, setData] = useState<{
    overview: AdminOverview;
    users: AdminUser[];
    jobs: AdminJob[];
  }>();
  const [error, setError] = useState<string>();
  const load = () =>
    Promise.all([api.adminOverview(), api.adminUsers(), api.adminJobs()])
      .then(([overview, users, jobs]) => setData({ overview, users: users.users, jobs: jobs.jobs }))
      .catch((reason: Error) => setError(reason.message));
  useEffect(() => {
    void load();
  }, []);
  const retry = async (job: AdminJob) => {
    if (
      !window.confirm(
        `Retry failed ${label(job.kind)} job? This reuses its existing input and cannot retry paid exports.`,
      )
    )
      return;
    await api.adminRetryJob(job.id);
    await load();
  };
  if (error) return <State title="Operations data unavailable" detail={error} />;
  if (!data)
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner />
      </div>
    );
  const { overview } = data;
  const activation = overview.totals.users
    ? Math.round((overview.totals.activatedUsers / overview.totals.users) * 100)
    : 0;
  return (
    <div className="mx-auto max-w-[1560px] space-y-8">
      <header className="flex flex-col gap-4 border-b border-line pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mono text-[10px] uppercase tracking-[.22em] text-signal">
            Private operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-ink sm:text-4xl">
            Product pulse
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-dim">
            A privacy-safe readout of acquisition, activation, processing health and estimated unit
            cost.
          </p>
        </div>
        <p className="mono text-[10px] text-ink-mute">
          Updated {new Date(overview.generatedAt).toLocaleString()}
        </p>
      </header>

      <section
        aria-label="Key metrics"
        className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 xl:grid-cols-4"
      >
        <Metric
          label="Registrations"
          value={overview.totals.users}
          note={`${overview.totals.projects} projects`}
        />
        <Metric
          label="Activated"
          value={overview.totals.activatedUsers}
          note={`${activation}% of registrations`}
          accent
        />
        <Metric
          label="Previewed"
          value={overview.totals.previews}
          note={`${overview.totals.exports} final exports`}
        />
        <Metric label="Purchases" value={overview.totals.purchases} note="Processed payments" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <Panel title="Conversion path" eyebrow="All-source funnel">
          {overview.funnel.length ? (
            <div className="space-y-4">
              {overview.funnel.slice(0, 9).map((row) => {
                const max = Math.max(...overview.funnel.map((item) => item.count), 1);
                return (
                  <div
                    key={row.event}
                    className="grid grid-cols-[150px_1fr_42px] items-center gap-3"
                  >
                    <span className="text-xs text-ink-dim">{label(row.event)}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-panel-2">
                      <div
                        className="h-full rounded-full bg-signal"
                        style={{ width: `${Math.max(3, (row.count / max) * 100)}%` }}
                      />
                    </div>
                    <span className="mono text-right text-xs text-ink">{row.count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty text="New all-source events will appear here as visitors move through the product." />
          )}
        </Panel>
        <Panel title="Processing health" eyebrow="Live workload">
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(overview.jobs)
              .filter(([key]) => key !== 'oldestQueuedAt')
              .map(([key, value]) => (
                <div key={key} className="rounded-xl border border-line bg-panel-2 p-4">
                  <p className="mono text-[10px] uppercase tracking-wider text-ink-mute">{key}</p>
                  <p
                    className={`mt-2 text-2xl font-semibold ${key === 'failed' && value ? 'text-danger' : 'text-ink'}`}
                  >
                    {value}
                  </p>
                </div>
              ))}
          </div>
          <div className="mt-5 border-t border-line pt-5 text-xs text-ink-dim">
            <div className="flex justify-between">
              <span>Transcription processed</span>
              <span className="text-ink">{overview.costs.transcriptionMinutes} min</span>
            </div>
            <div className="mt-3 flex justify-between">
              <span>Estimated transcription</span>
              <span className="text-ink">
                ${overview.costs.estimatedTranscriptionUsd.toFixed(2)}
              </span>
            </div>
            <div className="mt-3 flex justify-between">
              <span>Live stored media</span>
              <span className="text-ink">{bytes(overview.costs.storedBytes)}</span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Acquisition" eyebrow="Identity-linked sessions">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {overview.sources.length ? (
            overview.sources.map((source) => (
              <div key={source.source} className="rounded-xl border border-line bg-panel-2 p-4">
                <p className="text-sm capitalize text-ink">{source.source.replaceAll('-', ' ')}</p>
                <p className="mt-3 text-2xl font-semibold text-ink">{source.sessions}</p>
                <p className="mt-1 text-xs text-ink-mute">{source.registrations} registrations</p>
              </div>
            ))
          ) : (
            <Empty text="Direct, organic, referral, Meta and agent traffic will be classified here." />
          )}
        </div>
      </Panel>

      <div className="grid gap-6 2xl:grid-cols-2">
        <Panel title="Recent users" eyebrow="Masked by default">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="text-ink-mute">
                <tr>
                  <Th>User</Th>
                  <Th>Source</Th>
                  <Th>Projects</Th>
                  <Th>Transcribed</Th>
                  <Th>Exports</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id} className="border-t border-line">
                    <Td>{user.emailMasked ?? user.id.slice(0, 12)}</Td>
                    <Td>{user.source ?? 'unknown'}</Td>
                    <Td>{user.projects}</Td>
                    <Td>{user.transcriptions}</Td>
                    <Td>{user.exports}</Td>
                    <Td>{shortDate(user.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Recent jobs" eyebrow="Safe error codes only">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="text-ink-mute">
                <tr>
                  <Th>Job</Th>
                  <Th>Kind</Th>
                  <Th>Status</Th>
                  <Th>Attempts</Th>
                  <Th>User</Th>
                  <Th>Created</Th>
                  <Th>
                    <span className="sr-only">Action</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => (
                  <tr key={job.id} className="border-t border-line">
                    <Td>
                      <span className="mono text-[10px]">{job.id.slice(0, 13)}</span>
                    </Td>
                    <Td>{label(job.kind)}</Td>
                    <Td>
                      <Status value={job.status} error={job.errorCode} />
                    </Td>
                    <Td>{job.attempts}</Td>
                    <Td>{job.userEmailMasked ?? '—'}</Td>
                    <Td>{shortDate(job.createdAt)}</Td>
                    <Td>
                      {job.status === 'failed' &&
                      [
                        'import_source',
                        'finalize_upload',
                        'generate_captions',
                        'render_preview',
                      ].includes(job.kind) ? (
                        <button
                          onClick={() => void retry(job)}
                          className="rounded-full border border-line-strong px-2.5 py-1 text-[10px] text-ink transition hover:border-signal hover:text-signal"
                        >
                          Retry
                        </button>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Metric({
  label: text,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: number;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-panel px-5 py-6">
      <p className="mono text-[10px] uppercase tracking-[.16em] text-ink-mute">{text}</p>
      <p
        className={`mt-3 text-4xl font-semibold tracking-[-.05em] ${accent ? 'text-signal' : 'text-ink'}`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-ink-dim">{note}</p>
    </div>
  );
}
function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-[-.02em] text-ink">{title}</h2>
        <span className="mono text-[9px] uppercase tracking-widest text-ink-mute">{eyebrow}</span>
      </div>
      {children}
    </section>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="pb-3 pr-4 font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-3 pr-4 text-ink-dim">{children}</td>;
}
function Status({ value, error }: { value: string; error?: string | undefined }) {
  const danger = value === 'failed';
  return (
    <span
      title={error}
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${danger ? 'bg-danger/10 text-danger' : value === 'succeeded' ? 'bg-signal/10 text-signal' : 'bg-panel-2 text-ink-dim'}`}
    >
      {error ?? value}
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-xs text-ink-mute">{text}</p>;
}
function State({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto mt-20 max-w-md rounded-2xl border border-line bg-panel p-7">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink-dim">{detail}</p>
    </div>
  );
}
function Denied() {
  return (
    <State
      title="Administrator access required"
      detail="This private operations area is restricted to configured ClipSubtitles administrators."
    />
  );
}
const label = (value: string) =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const shortDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const bytes = (value: number) =>
  value < 1024 ** 2
    ? `${Math.round(value / 1024)} KB`
    : value < 1024 ** 3
      ? `${(value / 1024 ** 2).toFixed(1)} MB`
      : `${(value / 1024 ** 3).toFixed(1)} GB`;
