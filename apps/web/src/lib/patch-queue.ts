import type { CaptionProject, PatchOp, StylePatch } from '@clipsubtitles/contracts';

export interface PatchResult {
  project: CaptionProject;
  applied: number;
  newRevision: boolean;
}

export type PatchSender = (expectedVersion: number, ops: PatchOp[], opts: { keepalive: boolean }) => Promise<PatchResult>;

export interface PatchQueueOptions {
  send: PatchSender;
  /** Called with every successful result, in order. `busy` is already false when this was the last request. */
  onResult: (result: PatchResult, ops: PatchOp[]) => void;
  /** Called with the first error of a request; the queue keeps serving later requests. */
  onError: (err: unknown, ops: PatchOp[]) => void;
  /** Called whenever the queue drains (no request in flight and no pending style). */
  onIdle?: () => void;
  /** Debounce window for style patches (ms). */
  styleDebounceMs?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

/** Deep-merge two style patches (later wins; nested groups merge). */
export function mergeStylePatch(base: StylePatch | null, patch: StylePatch): StylePatch {
  if (!base) return { ...patch };
  const out: StylePatch = { ...base, ...patch };
  for (const key of ['stroke', 'shadow', 'background', 'highlight'] as const) {
    if (base[key] || patch[key]) {
      out[key] = { ...(base[key] ?? {}), ...(patch[key] ?? {}) } as never;
    }
  }
  return out;
}

/**
 * Serializes project PATCH requests so every request is built against the
 * version returned by the previous one. Style patches coalesce in a debounce
 * window and are flushed ahead of any non-style op (as ops in the same
 * request) so ordering and version expectations can never race.
 */
export class PatchQueue {
  private version: number;
  private chain: Promise<void> = Promise.resolve();
  private pendingStyle: StylePatch | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private inFlight = 0;
  private readonly opts: Required<Pick<PatchQueueOptions, 'styleDebounceMs' | 'setTimeoutImpl' | 'clearTimeoutImpl'>> & PatchQueueOptions;

  constructor(initialVersion: number, opts: PatchQueueOptions) {
    this.version = initialVersion;
    this.opts = { styleDebounceMs: 350, setTimeoutImpl: setTimeout, clearTimeoutImpl: clearTimeout, ...opts };
  }

  /** The version the next request will assert. Updated from every successful response or external reload. */
  get currentVersion(): number {
    return this.version;
  }

  /** Adopt a version observed outside the queue (initial load, conflict reload). Drops pending style edits on conflict. */
  resetVersion(version: number, dropPending = true): void {
    this.version = version;
    if (dropPending) this.cancelPendingStyle();
  }

  get hasPendingStyle(): boolean {
    return this.pendingStyle !== null;
  }

  get busy(): boolean {
    return this.inFlight > 0;
  }

  /** Coalesce a style patch; it is sent after the debounce window or before the next non-style op. */
  style(patch: StylePatch): void {
    if (this.disposed) return;
    this.pendingStyle = mergeStylePatch(this.pendingStyle, patch);
    if (this.timer) this.opts.clearTimeoutImpl(this.timer);
    this.timer = this.opts.setTimeoutImpl(() => {
      this.timer = null;
      this.flushStyle();
    }, this.opts.styleDebounceMs);
  }

  /** Enqueue explicit ops. Pending style is flushed first, inside the same request. */
  enqueue(ops: PatchOp[]): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const style = this.takePendingStyle();
    const all: PatchOp[] = style ? [{ op: 'set_style', style }, ...ops] : ops;
    return this.push(all, false);
  }

  /** Send pending style immediately (debounce elapsed or explicit flush). */
  flushStyle(keepalive = false): Promise<void> {
    const style = this.takePendingStyle();
    if (!style) return Promise.resolve();
    return this.push([{ op: 'set_style', style }], keepalive);
  }

  /** Wait for everything queued so far. */
  idle(): Promise<void> {
    return this.chain;
  }

  cancelPendingStyle(): void {
    if (this.timer) this.opts.clearTimeoutImpl(this.timer);
    this.timer = null;
    this.pendingStyle = null;
  }

  /** On unmount: stop timers and push any pending style with keepalive so it is not lost. */
  dispose(): void {
    if (this.disposed) return;
    if (this.timer) this.opts.clearTimeoutImpl(this.timer);
    this.timer = null;
    const style = this.takePendingStyle();
    this.disposed = true;
    if (style) {
      // Fire-and-forget with keepalive; ordering still respects the chain.
      void this.push([{ op: 'set_style', style }], true, true);
    }
  }

  private takePendingStyle(): StylePatch | null {
    if (this.timer) this.opts.clearTimeoutImpl(this.timer);
    this.timer = null;
    const style = this.pendingStyle;
    this.pendingStyle = null;
    return style;
  }

  private push(ops: PatchOp[], keepalive: boolean, ignoreDisposed = false): Promise<void> {
    if (this.disposed && !ignoreDisposed) return Promise.resolve();
    this.inFlight += 1;
    const run = async () => {
      let result: PatchResult | null = null;
      let error: unknown = null;
      try {
        result = await this.opts.send(this.version, ops, { keepalive });
        this.version = result.project.version;
      } catch (err) {
        error = err;
      }
      // Settle the busy count BEFORE callbacks so observers see the true state (busy=false on the last request).
      this.inFlight -= 1;
      if (result) this.opts.onResult(result, ops);
      else this.opts.onError(error, ops);
      if (this.inFlight === 0 && this.pendingStyle === null) this.opts.onIdle?.();
    };
    this.chain = this.chain.then(run, run);
    return this.chain;
  }
}
