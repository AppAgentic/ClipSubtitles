export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const SENSITIVE_KEY = /(token|secret|authorization|cookie|password|api[-_]?key|signature|jwt|bearer)/i;
/** Media-derived content never goes to logs or audit metadata. */
const CONTENT_KEY = /^(words|pages|text|transcript|title|fileName|file_name|sourceUrl|source_url|vocabulary|lines|script)$/;
const MAX_STRING = 200;

/**
 * Deep redaction for logs and audit metadata: strips credentials, replaces
 * media-derived text with length markers, and truncates long strings.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') {
    if (/^(Bearer|Basic)\s+\S+/i.test(value)) return '[redacted]';
    if (/^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(value)) return '[redacted-jwt]';
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[+${value.length - MAX_STRING}]` : value;
  }
  if (Array.isArray(value)) return value.length > 50 ? `[array:${value.length}]` : value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) out[k] = '[redacted]';
      else if (CONTENT_KEY.test(k)) out[k] = typeof v === 'string' ? `[content:${v.length}]` : Array.isArray(v) ? `[content:${v.length}]` : '[content]';
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(level: LogLevel, bindings: Record<string, unknown> = {}, sink: (line: string) => void = (l) => process.stdout.write(`${l}\n`)): Logger {
  const threshold = LEVELS[level];
  // Bindings are redacted once at creation so parent/child context can never carry credentials.
  const safeBindings = redact(bindings) as Record<string, unknown>;
  const emit = (lvl: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (LEVELS[lvl] < threshold) return;
    const record = { ts: new Date().toISOString(), level: lvl, msg, ...safeBindings, ...(meta ? (redact(meta) as Record<string, unknown>) : {}) };
    sink(JSON.stringify(record));
  };
  return {
    debug: (m, meta) => emit('debug', m, meta),
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
    child: (b) => createLogger(level, { ...safeBindings, ...b }, sink),
  };
}
