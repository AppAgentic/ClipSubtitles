/**
 * Token alignment utilities shared by the benchmark scorer and the
 * "GPT Transcribe + alignment" adapter.
 */
export type AlignOp = 'match' | 'sub' | 'ins' | 'del';

export interface AlignStep {
  op: AlignOp;
  /** Index into the reference sequence (undefined for insertions). */
  ref?: number;
  /** Index into the hypothesis sequence (undefined for deletions). */
  hyp?: number;
}

export function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .normalize('NFKC')
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
    .replace(/’/g, "'");
}

/** Levenshtein alignment with backtrace (O(n·m); fine for ≤ 20k tokens in benchmarks). */
export function alignTokens(ref: readonly string[], hyp: readonly string[]): AlignStep[] {
  const n = ref.length;
  const m = hyp.length;
  const cols = m + 1;
  const dist = new Uint32Array((n + 1) * cols);
  const back = new Uint8Array((n + 1) * cols); // 0 diag-match, 1 diag-sub, 2 up (del), 3 left (ins)
  for (let i = 1; i <= n; i += 1) {
    dist[i * cols] = i;
    back[i * cols] = 2;
  }
  for (let j = 1; j <= m; j += 1) {
    dist[j] = j;
    back[j] = 3;
  }
  for (let i = 1; i <= n; i += 1) {
    const r = normalizeToken(ref[i - 1] ?? '');
    for (let j = 1; j <= m; j += 1) {
      const h = normalizeToken(hyp[j - 1] ?? '');
      const same = r === h;
      const diag = (dist[(i - 1) * cols + (j - 1)] ?? 0) + (same ? 0 : 1);
      const up = (dist[(i - 1) * cols + j] ?? 0) + 1;
      const left = (dist[i * cols + (j - 1)] ?? 0) + 1;
      let best = diag;
      let dir: number = same ? 0 : 1;
      if (up < best) {
        best = up;
        dir = 2;
      }
      if (left < best) {
        best = left;
        dir = 3;
      }
      dist[i * cols + j] = best;
      back[i * cols + j] = dir;
    }
  }
  const steps: AlignStep[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const dir = back[i * cols + j];
    if (i > 0 && j > 0 && (dir === 0 || dir === 1)) {
      steps.push({ op: dir === 0 ? 'match' : 'sub', ref: i - 1, hyp: j - 1 });
      i -= 1;
      j -= 1;
    } else if (i > 0 && (dir === 2 || j === 0)) {
      steps.push({ op: 'del', ref: i - 1 });
      i -= 1;
    } else {
      steps.push({ op: 'ins', hyp: j - 1 });
      j -= 1;
    }
  }
  return steps.reverse();
}

export interface TimedToken {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Give timings to `text` tokens using a timed reference (e.g. whisper words).
 * Matched tokens inherit timings; unmatched runs are interpolated between the
 * nearest anchors so every output token has monotonic, non-overlapping timing.
 * The text is never changed — only timing is attached.
 */
export function alignTextToTimedWords(text: string, timed: readonly TimedToken[], durationMs: number): TimedToken[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const steps = alignTokens(
    timed.map((t) => t.text),
    tokens,
  );
  const anchors = new Array<TimedToken | null>(tokens.length).fill(null);
  for (const step of steps) {
    if ((step.op === 'match' || step.op === 'sub') && step.hyp !== undefined && step.ref !== undefined) {
      const src = timed[step.ref];
      const token = tokens[step.hyp];
      if (src && token) anchors[step.hyp] = { text: token, startMs: src.startMs, endMs: src.endMs };
    }
  }
  const out: TimedToken[] = [];
  let idx = 0;
  while (idx < tokens.length) {
    const anchor = anchors[idx];
    if (anchor) {
      out.push(anchor);
      idx += 1;
      continue;
    }
    // Run of unanchored tokens [idx, runEnd)
    let runEnd = idx;
    while (runEnd < tokens.length && !anchors[runEnd]) runEnd += 1;
    const prevEnd = out[out.length - 1]?.endMs ?? 0;
    const nextStart = anchors[runEnd]?.startMs ?? durationMs;
    const span = Math.max((runEnd - idx) * 60, nextStart - prevEnd);
    const per = span / (runEnd - idx);
    for (let k = idx; k < runEnd; k += 1) {
      const s = Math.round(prevEnd + (k - idx) * per);
      const e = Math.round(prevEnd + (k - idx + 1) * per);
      out.push({ text: tokens[k] ?? '', startMs: s, endMs: Math.max(e, s + 20) });
    }
    idx = runEnd;
  }
  // Enforce monotonic timings after interpolation.
  let cursor = 0;
  for (const t of out) {
    if (t.startMs < cursor) t.startMs = cursor;
    if (t.endMs <= t.startMs) t.endMs = t.startMs + 20;
    cursor = t.endMs;
  }
  return out;
}
