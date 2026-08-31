'use client';

import { useEffect, useState } from 'react';
import { Field, Segmented } from '@/components/ui/primitives';
import { applyTheme, readStoredTheme, storeTheme, type ThemePreference } from '@/lib/theme';

/**
 * Appearance control: System / Light / Dark. Defaults to "System" on first
 * paint (matching the server-rendered markup) and corrects to the stored
 * preference after mount — no hydration mismatch, just a same-frame update.
 */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    setPref(readStoredTheme());
  }, []);

  const update = (next: ThemePreference) => {
    setPref(next);
    storeTheme(next);
    applyTheme(next);
  };

  return (
    <Field label="Appearance" hint="Follows your system setting unless you choose one below.">
      <Segmented
        value={pref}
        onChange={update}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </Field>
  );
}
