import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from 'node:sqlite';
import { MIGRATIONS } from './migrations';

export type Db = DatabaseSync;
export type Row = Record<string, SQLOutputValue>;
export type Param = SQLInputValue;

export interface OpenDatabaseOptions {
  /** File path or ':memory:'. Directories are created as needed. */
  path: string;
  /** Apply pending migrations (default true). */
  migrate?: boolean;
}

export function openDatabase(opts: OpenDatabaseOptions): Db {
  if (opts.path !== ':memory:') mkdirSync(path.dirname(opts.path), { recursive: true });
  const db = new DatabaseSync(opts.path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (opts.path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }
  if (opts.migrate !== false) migrate(db);
  return db;
}

export function migrate(db: Db): number {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);',
  );
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map((r) => r.version),
  );
  let count = 0;
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        new Date().toISOString(),
      );
      db.exec('COMMIT;');
      count += 1;
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
  return count;
}

/**
 * Run `fn` inside an IMMEDIATE transaction. Nested calls reuse the outer
 * transaction (SQLite has no nested transactions; savepoints are unnecessary
 * for our single-writer model).
 */
export function transaction<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // ignore rollback failure; original error wins
    }
    throw err;
  }
}

export function one<T extends Row>(db: Db, sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function many<T extends Row>(db: Db, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(db: Db, sql: string, ...params: Param[]): { changes: number } {
  const res = db.prepare(sql).run(...params);
  return { changes: Number(res.changes) };
}

type Cell = SQLOutputValue | undefined;

export function parseJson<T>(value: Cell, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function bool(value: Cell): boolean {
  return value === 1 || value === 1n;
}

export function text(value: Cell): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function num(value: Cell): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return undefined;
}
