/**
 * Break a sequence of word texts into at most `maxLines` lines of at most
 * `maxCharsPerLine` characters, minimizing raggedness (TeX-style DP). When the
 * constraint cannot be met, the last line absorbs the overflow so no word is
 * ever dropped; QA reports the overflow.
 */
export interface LineRange {
  start: number;
  end: number; // inclusive, relative to the input array
}

export function breakLines(texts: readonly string[], maxCharsPerLine: number, maxLines: number): LineRange[] {
  const n = texts.length;
  if (n === 0) return [];
  if (n === 1 || maxLines <= 1) return [{ start: 0, end: n - 1 }];

  const lengths = texts.map((t) => t.length);
  const lineLen = (i: number, j: number): number => {
    let sum = 0;
    for (let k = i; k <= j; k += 1) sum += (lengths[k] ?? 0) + (k > i ? 1 : 0);
    return sum;
  };

  // dp[k][i]: min cost to place words[0..i) into exactly k lines.
  const INF = Number.POSITIVE_INFINITY;
  const dp: number[][] = Array.from({ length: maxLines + 1 }, () => new Array<number>(n + 1).fill(INF));
  const from: number[][] = Array.from({ length: maxLines + 1 }, () => new Array<number>(n + 1).fill(-1));
  dp[0]![0] = 0;

  for (let k = 1; k <= maxLines; k += 1) {
    for (let i = 1; i <= n; i += 1) {
      for (let j = k - 1; j < i; j += 1) {
        const prev = dp[k - 1]![j]!;
        if (prev === INF) continue;
        const len = lineLen(j, i - 1);
        const over = Math.max(0, len - maxCharsPerLine);
        const slack = Math.max(0, maxCharsPerLine - len);
        // Overflow is heavily penalised but not impossible (we must place every word).
        const cost = prev + slack * slack + over * over * 40;
        if (cost < dp[k]![i]!) {
          dp[k]![i] = cost;
          from[k]![i] = j;
        }
      }
    }
  }

  let bestK = 1;
  let bestCost = INF;
  for (let k = 1; k <= maxLines; k += 1) {
    // Prefer fewer lines when costs tie; mild bias against extra lines.
    const cost = dp[k]![n]! + (k - 1) * 4;
    if (cost < bestCost) {
      bestCost = cost;
      bestK = k;
    }
  }

  const ranges: LineRange[] = [];
  let i = n;
  for (let k = bestK; k >= 1; k -= 1) {
    const j = from[k]![i]!;
    ranges.unshift({ start: j, end: i - 1 });
    i = j;
  }
  return ranges;
}
