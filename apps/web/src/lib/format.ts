export function timecode(ms: number, withMs = true): string {
  const clamped = Math.max(0, Math.round(ms));
  const m = Math.floor(clamped / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const frac = Math.floor((clamped % 1000) / 10);
  return withMs ? `${m}:${String(s).padStart(2, '0')}.${String(frac).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - Date.parse(iso);
  const abs = Math.abs(diff);
  const future = diff < 0;
  let text: string;
  if (abs < 60_000) text = `${Math.max(1, Math.round(abs / 1000))}s`;
  else if (abs < 3_600_000) text = `${Math.round(abs / 60_000)}m`;
  else if (abs < 86_400_000) text = `${Math.round(abs / 3_600_000)}h`;
  else text = `${Math.round(abs / 86_400_000)}d`;
  return future ? `in ${text}` : `${text} ago`;
}

export function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

export function titleCase(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
