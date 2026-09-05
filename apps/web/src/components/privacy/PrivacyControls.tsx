'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  clearAttributionStorage,
  CONSENT_EVENT,
  readPrivacyConsent,
  savePrivacyConsent,
} from '@/lib/privacy-consent';

export function PrivacyControls() {
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  useEffect(() => {
    const sync = () => {
      const c = readPrivacyConsent();
      setAnalytics(c?.analytics ?? false);
      setMarketing(c?.marketing ?? false);
      if (!c) {
        clearAttributionStorage();
        setOpen(true);
      }
    };
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(CONSENT_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CONSENT_EVENT, sync);
    };
  }, []);
  function save(a: boolean, m: boolean) {
    savePrivacyConsent({ analytics: a, marketing: m });
    setOpen(false);
  }
  return (
    <>
      <button
        type="button"
        className="fixed bottom-3 left-3 z-40 rounded-full border border-line-strong bg-panel px-3 py-2 text-xs text-ink-dim"
        onClick={() => setOpen(true)}
      >
        Privacy choices
      </button>
      {open && (
        <section
          aria-label="Privacy choices"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-line-strong bg-panel p-5 text-ink shadow-xl sm:inset-x-auto sm:left-5 sm:mx-0"
        >
          <h2 className="text-lg font-semibold">Your privacy choices</h2>
          <p className="mt-2 text-sm leading-6 text-ink-dim">
            Essential storage keeps sign-in and your preferences working. Optional measurement stays
            off unless you choose it. You can change this anytime.
          </p>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
            />
            <span>
              <strong>Browser usage analytics</strong>
              <br />
              Help us understand which features people use.
            </span>
          </label>
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
            />
            <span>
              <strong>Advertising measurement</strong>
              <br />
              Connect visits and purchases to campaigns through AppRefer.
            </span>
          </label>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-line-strong px-4 py-2 text-sm"
              onClick={() => save(false, false)}
            >
              Essential only
            </button>
            <button
              type="button"
              className="rounded-full border border-line-strong px-4 py-2 text-sm"
              onClick={() => save(analytics, marketing)}
            >
              Save choices
            </button>
            <button
              type="button"
              className="rounded-full border border-line-strong px-4 py-2 text-sm"
              onClick={() => save(true, true)}
            >
              Allow optional
            </button>
          </div>
          <Link href="/privacy" className="mt-3 inline-block text-xs text-signal">
            Read our privacy policy
          </Link>
        </section>
      )}
    </>
  );
}
