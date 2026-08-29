'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export interface ToastItem {
  id: number;
  kind: 'info' | 'ok' | 'error';
  text: string;
  /** Sticky toasts stay until dismissed or replaced (e.g. "rendering…" progress). */
  sticky?: boolean;
}

export interface ToastApi {
  /** Show a toast; returns its id so callers can dismiss or replace it later. */
  push(kind: ToastItem['kind'], text: string, opts?: { sticky?: boolean }): number;
  dismiss(id: number): void;
  /** Dismiss `id` (if present) and show a new toast in its place. */
  replace(id: number | null | undefined, kind: ToastItem['kind'], text: string): number;
}

const ToastContext = createContext<ToastApi>({ push: () => 0, dismiss: () => undefined, replace: () => 0 });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (kind: ToastItem['kind'], text: string, opts: { sticky?: boolean } = {}) => {
      counter.current += 1;
      const id = counter.current;
      setItems((prev) => [...prev.slice(-3), { id, kind, text, ...(opts.sticky ? { sticky: true } : {}) }]);
      if (!opts.sticky) setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500);
      return id;
    },
    [dismiss],
  );
  const replace = useCallback(
    (id: number | null | undefined, kind: ToastItem['kind'], text: string) => {
      if (id !== null && id !== undefined) dismiss(id);
      return push(kind, text);
    },
    [dismiss, push],
  );
  const value = useMemo(() => ({ push, dismiss, replace }), [push, dismiss, replace]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[360px] max-w-[90vw] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            data-toast-kind={t.kind}
            className={`rise pointer-events-auto flex items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-[13px] shadow-2xl backdrop-blur ${
              t.kind === 'error'
                ? 'border-danger/40 bg-[#2a1212]/95 text-[#ffd9d9]'
                : t.kind === 'ok'
                  ? 'border-phosphor/30 bg-[#12200f]/95 text-[#dfffd0]'
                  : 'border-line-strong bg-panel-2/95 text-ink'
            }`}
          >
            <span>{t.text}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="shrink-0 text-current opacity-60 hover:opacity-100">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
