import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface StoredObject {
  bytes: number;
  sha256: string;
}

/**
 * Object storage boundary. Locally a directory; in production the same
 * interface fronts a bucket. Keys are workspace-scoped by convention
 * (`ws_.../...`) and validated to prevent traversal.
 */
export interface ObjectStore {
  put(key: string, data: Buffer | string): Promise<StoredObject>;
  putFile(key: string, sourcePath: string, opts?: { move?: boolean }): Promise<StoredObject>;
  putStream(key: string, stream: Readable, opts: { maxBytes: number }): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  stat(key: string): Promise<{ bytes: number } | null>;
  delete(key: string): Promise<boolean>;
  /** Every key under `prefix/` (recursive, sorted). Lets cleanup find blobs no database row references. */
  list(prefix: string): Promise<string[]>;
  /** Delete every object under `prefix/`; returns how many were removed. */
  deletePrefix(prefix: string): Promise<number>;
  /** Local filesystem path for tools (ffmpeg) that need a file. */
  localPath(key: string): string;
  readStream(key: string): Readable;
}

export class ObjectKeyError extends Error {
  constructor(key: string) {
    super(`Invalid object key: ${key}`);
    this.name = 'ObjectKeyError';
  }
}

export class ObjectTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Object exceeds ${maxBytes} bytes`);
    this.name = 'ObjectTooLargeError';
  }
}

const KEY_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*(\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/;

export function validateObjectKey(key: string): string {
  if (key.length > 512 || !KEY_RE.test(key) || key.split('/').some((p) => p === '..' || p === '.')) {
    throw new ObjectKeyError(key);
  }
  return key;
}

async function hashFile(p: string): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(p)) {
    const buf = chunk as Buffer;
    bytes += buf.length;
    hash.update(buf);
  }
  return { bytes, sha256: hash.digest('hex') };
}

export class FileObjectStore implements ObjectStore {
  constructor(private readonly root: string) {}

  localPath(key: string): string {
    validateObjectKey(key);
    return path.join(this.root, key);
  }

  private async ensureDir(key: string): Promise<string> {
    const p = this.localPath(key);
    await mkdir(path.dirname(p), { recursive: true });
    return p;
  }

  async put(key: string, data: Buffer | string): Promise<StoredObject> {
    const p = await this.ensureDir(key);
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    await writeFile(p, buf);
    return { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  }

  async putFile(key: string, sourcePath: string, opts: { move?: boolean } = {}): Promise<StoredObject> {
    const p = await this.ensureDir(key);
    if (opts.move) {
      try {
        await rename(sourcePath, p);
      } catch {
        await copyFile(sourcePath, p);
        await rm(sourcePath, { force: true });
      }
    } else {
      await copyFile(sourcePath, p);
    }
    return hashFile(p);
  }

  async putStream(key: string, stream: Readable, opts: { maxBytes: number }): Promise<StoredObject> {
    const p = await this.ensureDir(key);
    const tmp = `${p}.part`;
    const hash = createHash('sha256');
    let bytes = 0;
    try {
      await pipeline(
        stream,
        async function* (source) {
          for await (const chunk of source) {
            const buf = chunk as Buffer;
            bytes += buf.length;
            if (bytes > opts.maxBytes) throw new ObjectTooLargeError(opts.maxBytes);
            hash.update(buf);
            yield buf;
          }
        },
        createWriteStream(tmp),
      );
      await rename(tmp, p);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
    return { bytes, sha256: hash.digest('hex') };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.localPath(key));
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.localPath(key));
  }

  async stat(key: string): Promise<{ bytes: number } | null> {
    try {
      const s = await stat(this.localPath(key));
      return { bytes: s.size };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    const p = this.localPath(key);
    if (!existsSync(p)) return false;
    await rm(p, { force: true });
    return true;
  }

  async list(prefix: string): Promise<string[]> {
    const root = this.localPath(prefix);
    const out: string[] = [];
    const walk = async (dir: string, rel: string): Promise<void> => {
      let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const next = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), next);
        else if (entry.isFile()) out.push(`${prefix}/${next}`);
      }
    };
    await walk(root, '');
    return out.sort();
  }

  async deletePrefix(prefix: string): Promise<number> {
    const keys = await this.list(prefix);
    await rm(this.localPath(prefix), { recursive: true, force: true });
    return keys.length;
  }

  readStream(key: string): Readable {
    return createReadStream(this.localPath(key));
  }
}
