'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BILLING_CATALOG, type BillingSku } from '@clipsubtitles/contracts';
import { api, isUnauthenticated } from '@/lib/api';

const FEATURES: Record<string, string[]> = {
  free: ['A complete first captioned clip', 'Caption styles and motion', 'Video and subtitle exports'],
  creator: ['For a steady creator workflow', 'Monthly credits that can roll over', 'Buy extra credits when needed'],
  pro: ['For higher-volume publishing', 'API and agent access', 'More simultaneous renders'],
  studio: ['For teams and client delivery', 'Team controls', 'Highest included render capacity'],
};

export function PricingSection({ compact = false }: { compact?: boolean }) {
  return (
    <section id="pricing" className={`tg-pricing lo-wrap${compact ? ' is-compact' : ''}`} aria-labelledby="tg-pricing-title">
      <div className="tg-pricing-head">
        <div>
          <p className="lo-eyebrow tg-eyebrow">Simple pricing</p>
          <h2 id="tg-pricing-title">Start free. Pay when captions become part of your workflow.</h2>
        </div>
        <p>No card for your first clip. Paid plans include monthly credits; add more only when you need them.</p>
      </div>
      <div className="tg-price-grid">
        {BILLING_CATALOG.plans.map((plan) => (
          <article key={plan.id} className={plan.id === 'pro' ? 'is-featured' : ''}>
            {plan.id === 'pro' ? <span className="tg-price-badge">Most popular</span> : null}
            <p className="tg-price-name">{plan.name}</p>
            <p className="tg-price-value">
              <strong>${plan.monthlyPriceCents / 100}</strong>
              <span>{plan.id === 'free' ? 'to start' : '/ month'}</span>
            </p>
            <p className="tg-price-summary">
              {plan.id === 'free'
                ? 'Try the full workflow on your own video.'
                : `Includes ${plan.monthlyCredits.toLocaleString()} credits for repeat captioning.`}
            </p>
            <ul>
              {FEATURES[plan.id]?.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            {plan.id === 'free' || !('sku' in plan) ? (
              <Link href="/sign-in?returnTo=/app/new" className="lo-btn tg-price-action">Try for $0</Link>
            ) : (
              <CheckoutButton sku={plan.sku} label={`Choose ${plan.name}`} />
            )}
          </article>
        ))}
      </div>
      <p className="tg-pricing-note">Credits are used for finished video renders. Previewing, editing, and subtitle files do not use credits.</p>
    </section>
  );
}

function CheckoutButton({ sku, label }: { sku: BillingSku; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const checkout = await api.createCheckout({ sku, source: 'web', returnTo: '/app/settings?checkout=complete' });
      window.location.assign(checkout.url);
    } catch (err) {
      if (isUnauthenticated(err)) {
        window.location.assign(`/sign-in?returnTo=${encodeURIComponent(`/pricing?plan=${sku}`)}`);
        return;
      }
      setError('Checkout is not available yet. Your free workspace is still ready to use.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="lo-btn tg-price-action" onClick={() => void start()} disabled={busy}>
        {busy ? 'Opening…' : label}
      </button>
      {error ? <p className="tg-price-error" role="status">{error}</p> : null}
    </>
  );
}
