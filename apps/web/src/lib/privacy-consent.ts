'use client';

export const CONSENT_KEY = 'clipsubtitles_privacy_v1';
export const CONSENT_EVENT = 'clipsubtitles:privacy';
const MAX_AGE = 180 * 24 * 60 * 60 * 1000;
export type PrivacyConsent = { analytics: boolean; marketing: boolean; savedAt: number };

export function readPrivacyConsent(): PrivacyConsent | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return undefined;
    const c = JSON.parse(raw) as PrivacyConsent;
    return typeof c.analytics === 'boolean' &&
      typeof c.marketing === 'boolean' &&
      Number.isFinite(c.savedAt) &&
      c.savedAt <= Date.now() &&
      Date.now() - c.savedAt < MAX_AGE
      ? c
      : undefined;
  } catch {
    return undefined;
  }
}

export function clearAttributionStorage(): void {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[name];
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key?.startsWith('clipsubtitles_attribution')) storage.removeItem(key);
      }
    } catch {
      /* A blocked storage API must not enable optional processing. */
    }
  }
}

export function savePrivacyConsent(choices: Pick<PrivacyConsent, 'analytics' | 'marketing'>): void {
  const previous = readPrivacyConsent();
  const consent = { ...choices, savedAt: Date.now() };
  // Do not reuse marketing identifiers after withdrawing either category.
  if (!choices.analytics || !choices.marketing || !previous) clearAttributionStorage();
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  } catch {
    /* blocked storage keeps optional processing disabled */
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}
