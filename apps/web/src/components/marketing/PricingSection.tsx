'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BILLING_CATALOG, type BillingSku, type CheckoutSource } from '@clipsubtitles/contracts';
import { api, isUnauthenticated } from '@/lib/api';

const FEATURES: Record<string, string[]> = {
  free: ['A complete first captioned clip', 'Agent and API access', 'Caption styles and exports'],
  creator: ['Agent and API access', 'Credits with a rollover grace period', 'Buy extra credits when needed'],
  pro: ['Agent and API access', 'Higher monthly capacity', 'More simultaneous renders'],
  studio: ['Agent and API access', 'Team controls', 'Highest included render capacity'],
};

export function PricingSection({ compact = false }: { compact?: boolean }) {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('annual');
  const [checkoutContext, setCheckoutContext] = useState<{ source: CheckoutSource; resume?: string }>({ source: 'web' });
  const [resumeSku, setResumeSku] = useState<BillingSku>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = checkoutSource(params.get('source'));
    const resume = params.get('resume')?.slice(0, 500);
    const requestedSku = billingSku(params.get('plan'));
    setCheckoutContext({ source, ...(resume ? { resume } : {}) });
    setResumeSku(requestedSku);
    if (requestedSku) setBillingPeriod(requestedSku.endsWith('_annual') ? 'annual' : 'monthly');
  }, []);

  return (
    <section id="pricing" className={`tg-pricing lo-wrap${compact ? ' is-compact' : ''}`} aria-labelledby="tg-pricing-title">
      <div className="tg-pricing-head">
        <div>
          <p className="lo-eyebrow tg-eyebrow">Simple pricing</p>
          <h2 id="tg-pricing-title">Start free. Pay when captions become part of your workflow.</h2>
        </div>
        <p>No card for your first clip. Choose monthly flexibility or save up to 20% annually; add credits only when you need them.</p>
      </div>
      <div className="tg-price-body">
        <div className="tg-billing-toggle" role="group" aria-label="Billing period">
          <button type="button" aria-pressed={billingPeriod === 'monthly'} onClick={() => setBillingPeriod('monthly')}>
            Monthly
          </button>
          <button type="button" aria-pressed={billingPeriod === 'annual'} onClick={() => setBillingPeriod('annual')}>
            Annual <span>Save up to 20%</span>
          </button>
        </div>
        <div className="tg-price-grid">
          {BILLING_CATALOG.plans.map((plan) => {
            const annual = billingPeriod === 'annual' && 'annualSku' in plan;
            const priceCents = annual ? Math.round(plan.annualPriceCents / 12) : plan.monthlyPriceCents;
            const credits = annual ? plan.annualCredits : plan.monthlyCredits;
            return (
              <article key={plan.id} className={plan.id === 'pro' ? 'is-featured' : ''}>
                {plan.id === 'pro' ? <span className="tg-price-badge">Most popular</span> : null}
                <p className="tg-price-name">{plan.name}</p>
                <p className="tg-price-value">
                  <strong>${formatPrice(priceCents)}</strong>
                  <span>{plan.id === 'free' ? 'to start' : '/ month'}</span>
                </p>
                <p className="tg-price-summary">
                  {plan.id === 'free'
                    ? 'Try the full workflow on your own video.'
                    : annual
                      ? `Billed $${formatPrice(plan.annualPriceCents)} annually · Includes ${credits.toLocaleString()} credits for the year.`
                      : `Includes ${credits.toLocaleString()} credits each month.`}
                </p>
                <ul>
                  {FEATURES[plan.id]?.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
                {plan.id === 'free' || !('sku' in plan) ? (
                  <Link href="/sign-in?returnTo=/app/new" className="lo-btn tg-price-action">Try for $0</Link>
                ) : (
                  <CheckoutButton
                    sku={annual ? plan.annualSku : plan.sku}
                    label={`Choose ${plan.name}`}
                    context={checkoutContext}
                    autoStart={resumeSku === (annual ? plan.annualSku : plan.sku)}
                  />
                )}
              </article>
            );
          })}
        </div>
      </div>
      <p className="tg-pricing-note">Credits are used for finished video renders. Previewing, editing, and subtitle files do not use credits.</p>
    </section>
  );
}

function formatPrice(cents: number): string {
  const value = cents / 100;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

function CheckoutButton({
  sku,
  label,
  context,
  autoStart = false,
}: {
  sku: BillingSku;
  label: string;
  context: { source: CheckoutSource; resume?: string };
  autoStart?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const autoStarted = useRef(false);
  const start = useCallback(async (resumingAfterSignIn = false) => {
    setBusy(true);
    setError('');
    try {
      const completion = new URLSearchParams({ checkout: 'complete', source: context.source });
      if (context.resume) completion.set('resume', context.resume);
      const checkout = await api.createCheckout({
        sku,
        source: context.source,
        returnTo: `/app/settings?${completion.toString()}`,
        ...(context.resume ? { resume: context.resume } : {}),
      });
      window.location.assign(checkout.url);
    } catch (err) {
      if (isUnauthenticated(err)) {
        if (resumingAfterSignIn) {
          setError('Your sign-in did not complete. Sign in again, then choose this plan.');
          return;
        }
        const returnParams = new URLSearchParams(window.location.search);
        returnParams.set('plan', sku);
        window.location.assign(`/sign-in?returnTo=${encodeURIComponent(`/pricing?${returnParams.toString()}`)}`);
        return;
      }
      setError('Checkout is not available yet. Your free workspace is still ready to use.');
    } finally {
      setBusy(false);
    }
  }, [context.resume, context.source, sku]);

  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    void start(true);
  }, [autoStart, start]);

  return (
    <>
      <button type="button" className="lo-btn tg-price-action" onClick={() => void start(false)} disabled={busy}>
        {busy ? 'Opening…' : label}
      </button>
      {error ? <p className="tg-price-error" role="status">{error}</p> : null}
    </>
  );
}

function checkoutSource(value: string | null): CheckoutSource {
  return value === 'chatgpt' || value === 'claude' || value === 'codex' || value === 'agent' ? value : 'web';
}

function billingSku(value: string | null): BillingSku | undefined {
  if (!value) return undefined;
  for (const plan of BILLING_CATALOG.plans) {
    if (!('sku' in plan)) continue;
    if (value === plan.sku || ('annualSku' in plan && value === plan.annualSku)) return value as BillingSku;
  }
  return undefined;
}
