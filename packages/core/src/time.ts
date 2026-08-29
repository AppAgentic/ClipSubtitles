export function nowIso(now: () => number = Date.now): string {
  return new Date(now()).toISOString();
}

export function isoPlusSeconds(seconds: number, now: () => number = Date.now): string {
  return new Date(now() + seconds * 1000).toISOString();
}

function pad(n: number, width: number): string {
  return n.toString().padStart(width, '0');
}

/** `HH:MM:SS,mmm` */
export function msToSrtTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const milli = clamped % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(milli, 3)}`;
}

/** `HH:MM:SS.mmm` */
export function msToVttTimestamp(ms: number): string {
  return msToSrtTimestamp(ms).replace(',', '.');
}

/** `m:ss.t` for editor display. */
export function msToDisplay(ms: number): string {
  const clamped = Math.max(0, ms);
  const m = Math.floor(clamped / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const tenths = Math.floor((clamped % 1000) / 100);
  return `${m}:${pad(s, 2)}.${tenths}`;
}

export function clampMs(ms: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(ms)));
}
