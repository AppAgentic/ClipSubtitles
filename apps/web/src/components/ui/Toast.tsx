'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface ToastItem {
  id: number;
  kind: 'info' | 'ok' | 'error';
  text: string;
}

interface ToastApi {
  push(kind: ToastItem['kind'], text: string): void;
}

const ToastContext = createContext<ToastApi>({ push: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[360px] max-w-[90vw] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`rise pointer-events-auto rounded-xl border px-3.5 py-2.5 text-[13px] shadow-2xl backdrop-blur ${
              t.kind === 'error'
                ? 'border-danger/40 bg-[#2a1212]/95 text-[#ffd9d9]'
                : t.kind === 'ok'
                  ? 'border-phosphor/30 bg-[#12200f]/95 text-[#dfffd0]'
                  : 'border-line-strong bg-panel-2/95 text-ink'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
