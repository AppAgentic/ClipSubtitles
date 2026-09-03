'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  BILLING_PLANS,
  BILLING_TOP_UPS,
  type BillingOverview,
  type BillingSku,
  type LedgerEntry,
  type Me,
} from '@clipsubtitles/contracts';
import { AppShell } from '@/components/shell/AppShell';
import { Button, Field, TextInput } from '@/components/ui/primitives';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { SupportButton } from '@/components/support/GleapSupport';

export default function AppSettingsPage() {
  return <AppShell render={(me) => <Settings me={me} />} />;
}

export function Settings({ me }: { me: Me }) {
  const toast = useToast();
  const [name, setName] = useState(me.workspace.name);
  const [saving, setSaving] = useState(false);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [checkoutSku, setCheckoutSku] = useState<BillingSku | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('annual');
  const [managingBilling, setManagingBilling] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [checkoutSource, setCheckoutSource] = useState('');
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [savedWorkspaceName, setSavedWorkspaceName] = useState(me.workspace.name);

  const load = () => {
    api
      .ledger()
      .then((r) => setLedger(r.entries))
      .catch(() => undefined);
    api
      .billing()
      .then(setBilling)
      .catch(() => undefined);
  };
  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'complete') {
      setCheckoutComplete(true);
      const source = params.get('source');
      if (params.get('resume') && source && source !== 'web') setCheckoutSource(agentName(source));
      window.history.replaceState({}, '', '/app/settings#billing');
    }
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateWorkspace({ name });
      setSavedWorkspaceName(name);
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
      const session = await api.createCheckout({
        sku,
        source: 'web',
        returnTo: '/app/settings?checkout=complete',
      });
      window.location.assign(session.url);
    } catch (err) {
      toast.push('error', errorMessage(err));
      setCheckoutSku(null);
    }
  };

  const manageBilling = async () => {
    setManagingBilling(true);
    try {
      const session = await api.billingManagement();
      window.location.assign(session.url);
    } catch (err) {
      toast.push('error', errorMessage(err));
      setManagingBilling(false);
    }
  };

  const currentPlan =
    BILLING_PLANS.find((plan) => plan.id === (billing?.planId ?? 'free'))?.name ?? 'Free';
  const visibleLedger = showAllActivity ? ledger.slice(0, 12) : ledger.slice(0, 5);
  const workspaceChanged = name !== savedWorkspaceName;

  return (
    <div className="settings-page mx-auto max-w-[1180px]">
      <header className="rise mb-7 sm:mb-9">
        <h1 className="text-[32px] font-semibold tracking-[-0.04em] sm:text-[40px]">Settings</h1>
        <p className="mt-2 max-w-[54ch] text-[14px] leading-6 text-ink-dim sm:text-[15px]">
          Manage your workspace, storage, appearance and billing in one place.
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)] lg:gap-6">
        <section className="rise rise-1 overflow-hidden rounded-[24px] border border-line bg-panel shadow-[var(--shadow-card)]">
          <SettingsSection title="Account" description="Your signed-in ClipSubtitles identity.">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[15px] bg-signal/10 text-[15px] font-semibold text-signal">
                {initials(me.user.displayName ?? me.user.emailMasked ?? 'CS')}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink">
                  {me.user.displayName ?? '—'}
                </p>
                <p className="mono mt-1 truncate text-[12px] text-ink-dim">
                  {me.user.emailMasked ?? '—'}
                </p>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Appearance"
            description="Use your device theme or choose a permanent look."
          >
            <ThemeToggle embedded />
          </SettingsSection>

          <SettingsSection
            title="Workspace"
            description="Choose the name shown across your projects and exports."
            last
          >
            <div className="flex flex-col gap-5">
              <Field label="Workspace name" presentation="settings">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </Field>
              <div className="flex items-center justify-between gap-4 border-t border-line pt-5">
                <p className="hidden text-[12px] text-ink-mute sm:block">
                  {workspaceChanged ? 'You have unsaved changes.' : 'Everything is up to date.'}
                </p>
                <Button
                  className="w-full sm:ml-auto sm:w-auto"
                  variant="primary"
                  onClick={() => void save()}
                  loading={saving}
                  disabled={!workspaceChanged}
                >
                  Save changes
                </Button>
              </div>
            </div>
          </SettingsSection>
        </section>

        <section
          id="billing"
          className="rise rise-1 scroll-mt-24 overflow-hidden rounded-[24px] border border-line bg-panel shadow-[var(--shadow-card)] lg:sticky lg:top-[90px]"
        >
          <div className="border-b border-line p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-ink-dim">Plan and credits</p>
                <p className="mt-2 text-[26px] font-semibold tracking-[-0.035em]">{currentPlan}</p>
              </div>
              <a
                href="/pricing"
                className="mt-0.5 text-[12px] font-medium text-signal hover:underline"
              >
                Compare plans
              </a>
            </div>
            <div className="mt-5 flex items-end justify-between rounded-[18px] bg-panel-2 px-4 py-3.5">
              <div>
                <p className="text-[12px] text-ink-dim">Available balance</p>
                <p className="mono mt-1 text-[24px] font-medium tracking-[-0.03em]">
                  {billing?.credits.available ?? me.credits.available}
                </p>
              </div>
              <span className="pb-1 text-[12px] text-ink-mute">credits</span>
            </div>
          </div>

          <div className="flex flex-col gap-5 p-5 sm:p-6">
            {checkoutComplete ? (
              <div
                role="status"
                className="rounded-[16px] border border-phosphor/25 bg-phosphor/10 px-4 py-3 text-[12px] leading-5 text-ink"
              >
                Checkout complete. Your plan and credits will update here as soon as payment is
                confirmed.
                {checkoutSource
                  ? ` Return to ${checkoutSource} and ask it to continue the caption export.`
                  : ''}
              </div>
            ) : null}
            {billing?.pools?.length ? (
              <div>
                <p className="mb-2 text-[11px] font-medium text-ink-mute">Credit pools</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {billing.pools.map((pool, index) => (
                    <li
                      key={`${pool.kind}-${index}`}
                      className="rounded-[14px] bg-panel-2 px-3.5 py-3 text-[12px]"
                    >
                      <span className="text-ink-dim">{creditPoolLabel(pool.kind)}</span>
                      <strong className="mono float-right">{pool.available}</strong>
                      {pool.expiresAt ? (
                        <p className="mt-1 text-[10px] text-ink-mute">
                          Rolls off {new Date(pool.expiresAt).toLocaleDateString()}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {billing?.planId === 'free' || !billing ? (
              <div className="flex flex-col gap-4">
                <div
                  className="inline-flex w-full rounded-full bg-panel-2 p-1"
                  role="group"
                  aria-label="Billing period"
                >
                  <button
                    type="button"
                    className={`flex-1 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${billingPeriod === 'monthly' ? 'bg-panel text-ink shadow-sm' : 'text-ink-dim hover:text-ink'}`}
                    aria-pressed={billingPeriod === 'monthly'}
                    onClick={() => setBillingPeriod('monthly')}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${billingPeriod === 'annual' ? 'bg-panel text-ink shadow-sm' : 'text-ink-dim hover:text-ink'}`}
                    aria-pressed={billingPeriod === 'annual'}
                    onClick={() => setBillingPeriod('annual')}
                  >
                    Annual · save up to 20%
                  </button>
                </div>
                <div className="grid gap-2">
                  {BILLING_PLANS.filter((plan) => plan.id !== 'free' && 'sku' in plan).map(
                    (plan) => {
                      const annual = billingPeriod === 'annual';
                      const sku = annual ? plan.annualSku : plan.sku;
                      const price = annual
                        ? Math.round(plan.annualPriceCents / 12)
                        : plan.monthlyPriceCents;
                      return (
                        <button
                          type="button"
                          key={plan.id}
                          aria-label={`${plan.name} · $${price / 100}/mo${annual ? ' billed annually' : ''}`}
                          onClick={() => void checkout(sku)}
                          disabled={checkoutSku !== null}
                          className={`group flex min-h-14 w-full items-center justify-between rounded-[16px] border px-4 py-3 text-left transition-[border,background,transform] active:translate-y-px disabled:opacity-50 ${
                            plan.id === 'pro'
                              ? 'border-signal/35 bg-signal/8 hover:border-signal/60'
                              : 'border-line-strong hover:border-ink-mute hover:bg-panel-2'
                          }`}
                        >
                          <span>
                            <span className="block text-[14px] font-semibold text-ink">
                              {plan.name}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-ink-mute">
                              {plan.id === 'pro' ? (
                                <span className="font-medium text-signal">Recommended · </span>
                              ) : null}
                              {annual ? 'Billed annually' : 'Billed monthly'}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="mono text-[14px] font-medium text-ink">
                              ${price / 100}/mo
                            </span>
                            <span className="text-signal" aria-hidden="true">
                              →
                            </span>
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="rounded-[18px] bg-panel-2 p-4">
                  <p className="text-[13px] leading-5 text-ink-dim">
                    Upgrade, downgrade, change payment method, view invoices, or cancel through the
                    secure billing portal.
                  </p>
                  {billing.currentPeriodEnd ? (
                    <p className="mt-1 text-[11px] text-ink-mute">
                      {billing.cancelAtPeriodEnd ? 'Access ends' : 'Next renewal'}{' '}
                      {new Date(billing.currentPeriodEnd).toLocaleDateString()}.
                    </p>
                  ) : null}
                  <Button
                    className="mt-3"
                    variant="primary"
                    onClick={() => void manageBilling()}
                    loading={managingBilling}
                  >
                    Manage subscription
                  </Button>
                </div>
                <div>
                  <p className="mb-2 text-[12px] text-ink-dim">
                    Need more render capacity this month?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {BILLING_TOP_UPS.map((topUp) => (
                      <Button
                        key={topUp.sku}
                        variant="ghost"
                        onClick={() => void checkout(topUp.sku)}
                        loading={checkoutSku === topUp.sku}
                      >
                        +{topUp.credits} · ${topUp.priceCents / 100}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rise rise-2 overflow-hidden rounded-[24px] border border-line bg-panel shadow-[var(--shadow-card)] lg:col-start-1">
          <SettingsSection
            title="Data and support"
            description="Understand storage behavior or get help from the team."
            last
          >
            <div className="grid gap-5 sm:grid-cols-2 sm:gap-0">
              <div className="sm:border-r sm:border-line sm:pr-6">
                <h3 className="text-[13px] font-semibold text-ink">Storage policy</h3>
                <p className="mt-2 text-[12px] leading-5 text-ink-dim">
                  Original files are kept for {me.workspace.retention.sourceDays} days and finished
                  files for {me.workspace.retention.exportDays} days. Deleting a project removes
                  both immediately.
                </p>
              </div>
              <div className="border-t border-line pt-5 sm:border-t-0 sm:pt-0 sm:pl-6">
                <h3 className="text-[13px] font-semibold text-ink">Need help?</h3>
                <p className="mt-2 text-[12px] leading-5 text-ink-dim">
                  Ask a question, report a problem, or share feedback.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <SupportButton className="inline-flex h-9 items-center rounded-full bg-signal px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90">
                    Contact support
                  </SupportButton>
                  <a
                    href="mailto:support@clipsubtitles.com"
                    className="text-[11px] text-ink-mute hover:text-ink"
                  >
                    Email support
                  </a>
                </div>
              </div>
            </div>
          </SettingsSection>
        </section>

        <section className="rise rise-2 overflow-hidden rounded-[24px] border border-line bg-panel shadow-[var(--shadow-card)] lg:col-start-2">
          <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-[16px] font-semibold tracking-[-0.015em]">Credit activity</h2>
              <p className="mt-0.5 text-[11px] text-ink-mute">Your latest workspace transactions</p>
            </div>
            <span className="mono text-[11px] text-ink-dim">{me.credits.available} available</span>
          </header>
          {ledger.length === 0 ? (
            <div className="px-5 py-5 text-[12px] text-ink-mute sm:px-6">No activity yet.</div>
          ) : (
            <>
              <ul className="divide-y divide-line/70">
                {visibleLedger.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between px-5 py-3 text-[12px] sm:px-6"
                  >
                    <span className="text-ink-dim">{creditActivityLabel(e.kind)}</span>
                    <span className={`mono ${e.amount < 0 ? 'text-signal' : 'text-phosphor'}`}>
                      {e.amount > 0 ? '+' : ''}
                      {e.amount}
                    </span>
                  </li>
                ))}
              </ul>
              {ledger.length > 5 ? (
                <button
                  type="button"
                  className="w-full border-t border-line px-5 py-3 text-left text-[12px] font-medium text-signal hover:bg-panel-2 sm:px-6"
                  onClick={() => setShowAllActivity((value) => !value)}
                >
                  {showAllActivity
                    ? 'Show recent activity'
                    : `Show ${Math.min(ledger.length, 12)} entries`}
                </button>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
  last = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`grid gap-5 p-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:p-6 ${last ? '' : 'border-b border-line'}`}
    >
      <div>
        <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-ink">{title}</h2>
        <p className="mt-1.5 max-w-[26ch] text-[11px] leading-[1.55] text-ink-mute">
          {description}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part.match(/^[\p{L}\p{N}]/u)?.[0] ?? '')
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function creditPoolLabel(kind: string): string {
  if (kind === 'admin') return 'Workspace credits';
  if (kind === 'subscription') return 'Plan credits';
  if (kind === 'topup') return 'Top-up credits';
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} credits`;
}

function agentName(source: string): string {
  if (source === 'chatgpt') return 'ChatGPT';
  if (source === 'claude') return 'Claude';
  if (source === 'codex') return 'ChatGPT';
  return 'your agent';
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
