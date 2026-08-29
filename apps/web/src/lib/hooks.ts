'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Export, Me, Task } from '@clipsubtitles/contracts';
import { api, isUnauthenticated } from './api';

const ACTIVE = new Set(['queued', 'running']);

/** Fired whenever credit reservations/settlements may have changed; `useMe` re-reads the balance. */
export const CREDITS_CHANGED_EVENT = 'cs:credits-changed';

export function notifyCreditsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CREDITS_CHANGED_EVENT));
}

export function useMe(): { me: Me | null; loading: boolean; error: unknown; unauthenticated: boolean; reload: () => void } {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api
      .me()
      .then((m) => {
        setMe(m);
        setError(null);
        setUnauthenticated(false);
      })
      .catch((err) => {
        setError(err);
        setUnauthenticated(isUnauthenticated(err));
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);
  useEffect(() => {
    const onChange = () => load(true);
    window.addEventListener(CREDITS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CREDITS_CHANGED_EVENT, onChange);
  }, [load]);
  return { me, loading, error, unauthenticated, reload: () => load() };
}

/** Poll a task while it is active; resolves exports when finished. */
export function useTask(taskId: string | null, intervalMs = 1500): { task: Task | null; exports: Export[]; error: unknown; refresh: () => void } {
  const [task, setTask] = useState<Task | null>(null);
  const [exports, setExports] = useState<Export[]>([]);
  const [error, setError] = useState<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (!taskId) return;
    api
      .getTask(taskId)
      .then((res) => {
        setTask(res.task);
        setExports(res.exports ?? []);
        setError(null);
      })
      .catch(setError);
  }, [taskId]);
  useEffect(() => {
    if (!taskId) {
      setTask(null);
      setExports([]);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await api.getTask(taskId);
        if (cancelled) return;
        setTask(res.task);
        setExports(res.exports ?? []);
        setError(null);
        if (ACTIVE.has(res.task.status)) timer.current = setTimeout(tick, intervalMs);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [taskId, intervalMs]);
  return { task, exports, error, refresh };
}

export function useInterval(fn: () => void, ms: number | null): void {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function isActiveTask(task: Task | null | undefined): boolean {
  return Boolean(task && ACTIVE.has(task.status));
}
