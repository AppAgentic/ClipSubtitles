'use client';

import { useEffect, useState } from 'react';
import { BILLING_PLANS, BILLING_TOP_UPS, type BillingOverview, type BillingSku, type LedgerEntry, type Me } from '@clipsubtitles/contracts';
import { AppShell } from '@/components/shell/AppShell';
import { Button, Field, KV, Panel, Slider, TextInput } from '@/components/ui/primitives';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';

export default function AppSettingsPage() {
  return <AppShell render={(me) => <Settings me={me} />} />;
}

function Settings({ me }: { me: Me }) {
  const toast = useToast();
  const [name, setName] = useState(me.workspace.name);
  const [sourceDays, setSourceDays] = useState(me.workspace.retention.sourceDays);
  const [exportDays, setExportDays] = useState(me.workspace.retention.exportDays);
  const [saving, setSaving] = useState(false);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [checkoutSku, setCheckoutSku] = useState<BillingSku | null>(null);

  const load = () => {
    api
      .ledger()
      .then((r) => setLedger(r.entries))
      .catch(() => undefined);
    api.billing().then(setBilling).catch(() => undefined);
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

  const checkout = async (sku: BillingSku) => {
    setCheckoutSku(sku);
    try {
      const session = await api.createCheckout({ sku, source: 'web', returnTo: '/app/settings?checkout=complete' });
      window.location.assign(session.url);
    } catch (err) {
      toast.push('error', errorMessage(err));
      setCheckoutSku(null);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-5">
        <Panel title="Account" className="rise p-4">
          <KV k="User" v={me.user.displayName ?? '—'} />
          <KV k="Email" v={me.user.emailMasked ?? '—'} mono />
        </Panel>
        <Panel title="Appearance" className="rise rise-1 p-4">
          <ThemeToggle />
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
          title="Plan and credits"
          className="rise"
          aside={<a href="/pricing" className="text-[11px] text-signal hover:underline">Compare plans</a>}
        >
          <div id="billing" className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-[11px] uppercase tracking-[.12em] text-ink-mute">Current plan</p><p className="mt-1 text-xl font-semibold">{BILLING_PLANS.find((plan) => plan.id === (billing?.planId ?? 'free'))?.name ?? 'Free'}</p></div>
              <div className="text-right"><p className="text-[11px] uppercase tracking-[.12em] text-ink-mute">Available</p><p className="mono mt-1 text-xl">{billing?.credits.available ?? me.credits.available} credits</p></div>
            </div>
            {billing?.pools?.length ? <ul className="grid gap-2 sm:grid-cols-2">{billing.pools.map((pool, index) => <li key={`${pool.kind}-${index}`} className="rounded-xl border border-line bg-panel-2 px-3 py-2 text-[12px]"><span className="capitalize text-ink-dim">{pool.kind}</span><strong className="mono float-right">{pool.available}</strong>{pool.expiresAt ? <p className="mt-1 text-[10px] text-ink-mute">Rolls off {new Date(pool.expiresAt).toLocaleDateString()}</p> : null}</li>)}</ul> : null}
            {billing?.planId === 'free' || !billing ? (
              <div className="flex flex-wrap gap-2">{BILLING_PLANS.filter((plan) => plan.id !== 'free' && 'sku' in plan).map((plan) => <Button key={plan.id} variant={plan.id === 'pro' ? 'primary' : 'ghost'} onClick={() => void checkout(plan.sku)} loading={checkoutSku === plan.sku}>{plan.name} · ${plan.monthlyPriceCents / 100}/mo</Button>)}</div>
            ) : (
              <div><p className="mb-2 text-[12px] text-ink-dim">Need more render capacity this month?</p><div className="flex flex-wrap gap-2">{BILLING_TOP_UPS.map((topUp) => <Button key={topUp.sku} variant="ghost" onClick={() => void checkout(topUp.sku)} loading={checkoutSku === topUp.sku}>+{topUp.credits} · ${topUp.priceCents / 100}</Button>)}</div></div>
            )}
          </div>
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
