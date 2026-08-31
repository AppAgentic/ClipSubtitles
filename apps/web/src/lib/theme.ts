/**
 * Manual light/dark override on top of the `prefers-color-scheme` default.
 * `system` (the default) means "no override": globals.css's
 * `@media (prefers-color-scheme: dark)` block does the work and nothing is
 * persisted. Choosing `light`/`dark` sets `data-theme` on <html> and persists
 * it, so it survives reloads without depending on the OS setting.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'clipsubtitles:theme';

/** Mirrors this module's logic; inlined (not imported) into the head so it runs before first paint. */
export const THEME_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(v==='light'||v==='dark')document.documentElement.setAttribute('data-theme',v)}catch(e){}})();`;

export function readStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function applyTheme(pref: ThemePreference): void {
  if (typeof document === 'undefined') return;
  if (pref === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', pref);
}

export function storeTheme(pref: ThemePreference): void {
  if (typeof window === 'undefined') return;
  if (pref === 'system') window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, pref);
}
