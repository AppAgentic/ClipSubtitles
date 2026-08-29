export interface RateLimitDecision {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  resetMs: number;
}

/**
 * In-memory token bucket keyed by principal/IP. Sufficient for a single API
 * instance; swap the store for a shared one when scaling out.
 */
export class TokenBucketLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();
  private lastSweep = 0;

  constructor(
    readonly capacity: number,
    readonly refillPerMs: number,
  ) {}

  take(key: string, now: number, cost = 1): RateLimitDecision {
    this.sweep(now);
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, updatedAt: now };
      this.buckets.set(key, b);
    }
    const elapsed = Math.max(0, now - b.updatedAt);
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerMs);
    b.updatedAt = now;
    if (b.tokens >= cost) {
      b.tokens -= cost;
      return { ok: true, limit: this.capacity, remaining: Math.floor(b.tokens), retryAfterMs: 0, resetMs: Math.ceil((this.capacity - b.tokens) / this.refillPerMs) };
    }
    const retryAfterMs = Math.ceil((cost - b.tokens) / this.refillPerMs);
    return { ok: false, limit: this.capacity, remaining: 0, retryAfterMs, resetMs: retryAfterMs };
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, b] of this.buckets) if (now - b.updatedAt > 10 * 60_000) this.buckets.delete(k);
  }
}

export interface RateLimiters {
  /** General API requests per principal. */
  api: TokenBucketLimiter;
  /** Unauthenticated requests per IP (auth endpoints, signed URLs). */
  anonymous: TokenBucketLimiter;
  /** Free preview renders per workspace. */
  previews: TokenBucketLimiter;
  /** Uploads per workspace. */
  uploads: TokenBucketLimiter;
}

export function createRateLimiters(opts: { perMinute: number; previewsPerHour: number }): RateLimiters {
  return {
    api: new TokenBucketLimiter(opts.perMinute, opts.perMinute / 60_000),
    anonymous: new TokenBucketLimiter(Math.max(30, Math.floor(opts.perMinute / 2)), Math.max(30, opts.perMinute / 2) / 60_000),
    previews: new TokenBucketLimiter(opts.previewsPerHour, opts.previewsPerHour / 3_600_000),
    uploads: new TokenBucketLimiter(30, 30 / 3_600_000),
  };
}
