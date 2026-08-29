'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { ToastApi, ToastItem } from '@/components/ui/Toast';

export interface PendingToast {
  /** Show (or re-show) the sticky in-progress toast owned by this screen. */
  start(text: string): void;
  /** Replace the in-progress toast with its outcome. Returns false when nothing was pending. */
  settle(kind: ToastItem['kind'], text: string): boolean;
}

/**
 * Owns one sticky "in progress" toast for the lifetime of a component.
 * The outcome replaces it (so "rendering…" and "finished" never coexist), and
 * unmounting — navigating away mid-render — dismisses it, because the effect
 * that would have replaced it is gone with the component.
 */
export function usePendingToast(toast: ToastApi): PendingToast {
  const current = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (current.current !== null) {
        toast.dismiss(current.current);
        current.current = null;
      }
    },
    [toast],
  );
  return useMemo<PendingToast>(
    () => ({
      start(text) {
        if (current.current !== null) toast.dismiss(current.current);
        current.current = toast.push('info', text, { sticky: true });
      },
      settle(kind, text) {
        if (current.current === null) return false;
        const id = current.current;
        current.current = null;
        toast.replace(id, kind, text);
        return true;
      },
    }),
    [toast],
  );
}
