import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Storage, type StorageOptions } from '@google-cloud/storage';

export interface StoredObject {
  bytes: number;
  sha256: string;
}

export interface ObjectStat {
  bytes: number;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface DirectUploadAuthorization {
  url: string;
  headers: Record<string, string>;
}

/**
 * Object storage boundary. Locally a directory; in production the same
 * interface fronts a bucket. Keys are workspace-scoped by convention
 * (`ws_.../...`) and validated to prevent traversal.
 */
export interface ObjectStore {
  put(key: string, data: Buffer | string): Promise<StoredObject>;
  putFile(
    key: string,
    sourcePath: string,
    opts?: { move?: boolean; contentType?: string },
  ): Promise<StoredObject>;
  putStream(
    key: string,
    stream: Readable,
    opts: { maxBytes: number; contentType?: string },
  ): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  stat(key: string): Promise<ObjectStat | null>;
  /** Provider-side copy. Cloud stores must not stream bytes through the caller. */
  copy(sourceKey: string, destinationKey: string): Promise<void>;
  delete(key: string): Promise<boolean>;
  /** Every key under `prefix/` (recursive, sorted). Lets cleanup find blobs no database row references. */
  list(prefix: string): Promise<string[]>;
  /** Delete every object under `prefix/`; returns how many were removed. */
  deletePrefix(prefix: string): Promise<number>;
  /** Materialize an object to a local path for tools such as FFmpeg. */
  materialize(key: string): Promise<string>;
  /** Release an ephemeral path returned by `materialize`. Local-file stores need no cleanup. */
  releaseMaterialized?(materializedPath: string): Promise<void>;
  readStream(key: string, range?: { start: number; end: number }): Promise<Readable>;
  /** Optional provider-native direct download after application authorization. */
  signedDownloadUrl?(
    key: string,
    opts: { expiresSeconds: number; fileName?: string; download?: boolean; contentType?: string },
  ): Promise<string>;
  /** Optional single-object browser PUT authorization (implemented by R2/S3). */
  directUploadAuthorization?(
    key: string,
    opts: {
      expiresSeconds: number;
      contentLength: number;
      contentType: string;
      metadata?: Record<string, string>;
    },
  ): Promise<DirectUploadAuthorization>;
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
  if (
    key.length > 512 ||
    !KEY_RE.test(key) ||
    key.split('/').some((p) => p === '..' || p === '.')
  ) {
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

  async materialize(key: string): Promise<string> {
    return this.localPath(key);
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

  async putFile(
    key: string,
    sourcePath: string,
    opts: { move?: boolean; contentType?: string } = {},
  ): Promise<StoredObject> {
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

  async putStream(
    key: string,
    stream: Readable,
    opts: { maxBytes: number; contentType?: string },
  ): Promise<StoredObject> {
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

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const destination = await this.ensureDir(destinationKey);
    await copyFile(this.localPath(sourceKey), destination);
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

  async readStream(key: string, range?: { start: number; end: number }): Promise<Readable> {
    return createReadStream(this.localPath(key), range);
  }
}

export interface GcsObjectStoreOptions {
  bucket: string;
  /** Writable ephemeral directory used only while FFmpeg needs a local file. */
  cacheDir: string;
  prefix?: string;
  storageOptions?: StorageOptions;
}

/**
 * Production object store backed by a private GCS bucket. Objects remain
 * private; application URLs are still authorised by the API. Media is
 * downloaded lazily into Cloud Run's ephemeral filesystem for FFmpeg.
 */
export class GcsObjectStore implements ObjectStore {
  private readonly storage: Storage;
  private readonly bucket;
  private readonly prefix: string;

  constructor(private readonly options: GcsObjectStoreOptions) {
    if (!options.bucket.trim()) throw new Error('GCS bucket is required');
    this.storage = new Storage(options.storageOptions);
    this.bucket = this.storage.bucket(options.bucket);
    this.prefix = options.prefix?.replace(/^\/+|\/+$/g, '') ?? '';
  }

  private objectName(key: string): string {
    const clean = validateObjectKey(key);
    return this.prefix ? `${this.prefix}/${clean}` : clean;
  }

  private cachePath(key: string): string {
    return path.join(this.options.cacheDir, validateObjectKey(key));
  }

  private materializedPath(key: string): string {
    const clean = validateObjectKey(key);
    return path.join(
      this.options.cacheDir,
      'materialized',
      `${randomUUID()}-${path.basename(clean)}`,
    );
  }

  async put(key: string, data: Buffer | string): Promise<StoredObject> {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    await this.bucket
      .file(this.objectName(key))
      .save(buf, { resumable: false, validation: 'crc32c' });
    await rm(this.cachePath(key), { force: true }).catch(() => undefined);
    return { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  }

  async putFile(
    key: string,
    sourcePath: string,
    opts: { move?: boolean; contentType?: string } = {},
  ): Promise<StoredObject> {
    const result = await hashFile(sourcePath);
    await this.bucket.upload(sourcePath, {
      destination: this.objectName(key),
      resumable: false,
      validation: 'crc32c',
      ...(opts.contentType ? { metadata: { contentType: opts.contentType } } : {}),
    });
    await rm(this.cachePath(key), { force: true }).catch(() => undefined);
    if (opts.move) await rm(sourcePath, { force: true });
    return result;
  }

  async putStream(
    key: string,
    stream: Readable,
    opts: { maxBytes: number; contentType?: string },
  ): Promise<StoredObject> {
    const file = this.bucket.file(this.objectName(key));
    const output = file.createWriteStream({
      resumable: false,
      validation: 'crc32c',
      ...(opts.contentType ? { metadata: { contentType: opts.contentType } } : {}),
    });
    const hash = createHash('sha256');
    let bytes = 0;
    try {
      await pipeline(
        stream,
        async function* (source) {
          for await (const chunk of source) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
            bytes += buf.length;
            if (bytes > opts.maxBytes) throw new ObjectTooLargeError(opts.maxBytes);
            hash.update(buf);
            yield buf;
          }
        },
        output,
      );
    } catch (err) {
      await file.delete({ ignoreNotFound: true }).catch(() => undefined);
      throw err;
    }
    await rm(this.cachePath(key), { force: true }).catch(() => undefined);
    return { bytes, sha256: hash.digest('hex') };
  }

  async get(key: string): Promise<Buffer> {
    const [data] = await this.bucket.file(this.objectName(key)).download();
    return data;
  }

  async exists(key: string): Promise<boolean> {
    const [exists] = await this.bucket.file(this.objectName(key)).exists();
    return exists;
  }

  async stat(key: string): Promise<{ bytes: number } | null> {
    try {
      const [metadata] = await this.bucket.file(this.objectName(key)).getMetadata();
      return {
        bytes: Number(metadata.size ?? 0),
        ...(metadata.contentType ? { contentType: String(metadata.contentType) } : {}),
        ...(metadata.metadata && typeof metadata.metadata === 'object'
          ? {
              metadata: Object.fromEntries(
                Object.entries(metadata.metadata).map(([name, value]) => [name, String(value)]),
              ),
            }
          : {}),
      };
    } catch (err) {
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    await this.bucket
      .file(this.objectName(sourceKey))
      .copy(this.bucket.file(this.objectName(destinationKey)));
    await rm(this.cachePath(destinationKey), { force: true }).catch(() => undefined);
  }

  async delete(key: string): Promise<boolean> {
    const existed = await this.exists(key);
    await this.bucket.file(this.objectName(key)).delete({ ignoreNotFound: true });
    await rm(this.cachePath(key), { force: true }).catch(() => undefined);
    return existed;
  }

  async list(prefix: string): Promise<string[]> {
    const clean = validateObjectKey(prefix);
    const objectPrefix = `${this.objectName(clean)}/`;
    const [files] = await this.bucket.getFiles({ prefix: objectPrefix });
    const strip = this.prefix ? `${this.prefix}/` : '';
    return files.map((file) => file.name.slice(strip.length)).sort();
  }

  async deletePrefix(prefix: string): Promise<number> {
    const keys = await this.list(prefix);
    if (keys.length > 0)
      await Promise.all(
        keys.map((key) => this.bucket.file(this.objectName(key)).delete({ ignoreNotFound: true })),
      );
    await rm(this.cachePath(prefix), { recursive: true, force: true }).catch(() => undefined);
    return keys.length;
  }

  async materialize(key: string): Promise<string> {
    const target = this.materializedPath(key);
    const partial = `${target}.part`;
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await this.bucket.file(this.objectName(key)).download({ destination: partial });
      await rename(partial, target);
      return target;
    } catch (err) {
      await rm(partial, { force: true }).catch(() => undefined);
      await rm(target, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  async releaseMaterialized(materializedPath: string): Promise<void> {
    await releaseCloudMaterialization(this.options.cacheDir, materializedPath);
  }

  async readStream(key: string, range?: { start: number; end: number }): Promise<Readable> {
    return this.bucket.file(this.objectName(key)).createReadStream(range);
  }
}

export interface S3ObjectStoreOptions {
  bucket: string;
  cacheDir: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  prefix?: string;
  clientConfig?: Partial<S3ClientConfig>;
}

/** S3-compatible store used for Cloudflare R2. */
export class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client;
  private readonly prefix: string;

  constructor(private readonly options: S3ObjectStoreOptions) {
    if (!options.bucket || !options.endpoint || !options.accessKeyId || !options.secretAccessKey)
      throw new Error('Complete S3 object-store configuration is required');
    this.prefix = options.prefix?.replace(/^\/+|\/+$/g, '') ?? '';
    this.client = new S3Client({
      region: options.region ?? 'auto',
      endpoint: options.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      // Otherwise current AWS SDK v3 presigning can hoist an empty-body CRC32
      // into a URL that is later used with the real browser body.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      ...options.clientConfig,
    });
  }

  private objectName(key: string): string {
    const clean = validateObjectKey(key);
    return this.prefix ? `${this.prefix}/${clean}` : clean;
  }

  private cachePath(key: string): string {
    return path.join(this.options.cacheDir, validateObjectKey(key));
  }

  private materializedPath(key: string): string {
    const clean = validateObjectKey(key);
    return path.join(
      this.options.cacheDir,
      'materialized',
      `${randomUUID()}-${path.basename(clean)}`,
    );
  }

  async put(key: string, data: Buffer | string): Promise<StoredObject> {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.options.bucket, Key: this.objectName(key), Body: buf }),
    );
    await rm(this.cachePath(key), { force: true }).catch(() => undefined);
    return { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  }

  async putFile(
    key: string,
    sourcePath: string,
    opts: { move?: boolean; contentType?: string } = {},
  ): Promise<StoredObject> {
    const result = await hashFile(sourcePath);
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.options.bucket,
        Key: this.objectName(key),
        Body: createReadStream(sourcePath),
        ...(opts.contentType ? { ContentType: opts.contentType } : {}),
      },
    });
    await upload.done();
    await rm(this.cachePath(key), { force: true }).catch(() => undefined);
    if (opts.move) await rm(sourcePath, { force: true });
    return result;
  }

  async putStream(
    key: string,
    stream: Readable,
    opts: { maxBytes: number; contentType?: string },
  ): Promise<StoredObject> {
    const body = new PassThrough();
    const hash = createHash('sha256');
    let bytes = 0;
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.options.bucket,
        Key: this.objectName(key),
        Body: body,
        ...(opts.contentType ? { ContentType: opts.contentType } : {}),
      },
      leavePartsOnError: false,
    });
    const copying = pipeline(
      stream,
      async function* (source) {
        for await (const chunk of source) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
          bytes += buf.length;
          if (bytes > opts.maxBytes) throw new ObjectTooLargeError(opts.maxBytes);
          hash.update(buf);
          yield buf;
        }
      },
      body,
    );
    try {
      await Promise.all([copying, upload.done()]);
    } catch (err) {
      body.destroy();
      await this.delete(key).catch(() => false);
      throw err;
    }
    await rm(this.cachePath(key), { force: true }).catch(() => undefined);
    return { bytes, sha256: hash.digest('hex') };
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: this.objectName(key) }),
    );
    if (!response.Body) throw new Error('S3 object response had no body');
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async exists(key: string): Promise<boolean> {
    return (await this.stat(key)) !== null;
  }

  async stat(key: string): Promise<{ bytes: number } | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: this.objectName(key) }),
      );
      return {
        bytes: Number(response.ContentLength ?? 0),
        ...(response.ContentType ? { contentType: response.ContentType } : {}),
        ...(response.Metadata ? { metadata: response.Metadata } : {}),
      };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 || (err as { name?: string }).name === 'NotFound') return null;
      throw err;
    }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const source = `${this.options.bucket}/${this.objectName(sourceKey)}`;
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.options.bucket,
        Key: this.objectName(destinationKey),
        CopySource: encodeURIComponent(source).replace(/%2F/g, '/'),
        MetadataDirective: 'COPY',
      }),
    );
    await rm(this.cachePath(destinationKey), { force: true }).catch(() => undefined);
  }

  async directUploadAuthorization(
    key: string,
    opts: {
      expiresSeconds: number;
      contentLength: number;
      contentType: string;
      metadata?: Record<string, string>;
    },
  ): Promise<DirectUploadAuthorization> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: this.objectName(key),
        ContentLength: opts.contentLength,
        ContentType: opts.contentType,
        ...(opts.metadata ? { Metadata: opts.metadata } : {}),
      }),
      { expiresIn: opts.expiresSeconds },
    );
    return { url, headers: { 'content-type': opts.contentType } };
  }

  async delete(key: string): Promise<boolean> {
    const existed = await this.exists(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: this.objectName(key) }),
    );
    await rm(this.cachePath(key), { force: true }).catch(() => undefined);
    return existed;
  }

  async list(prefix: string): Promise<string[]> {
    const objectPrefix = `${this.objectName(validateObjectKey(prefix))}/`;
    const out: string[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.options.bucket,
          Prefix: objectPrefix,
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        }),
      );
      const strip = this.prefix ? `${this.prefix}/` : '';
      for (const object of page.Contents ?? [])
        if (object.Key) out.push(object.Key.slice(strip.length));
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return out.sort();
  }

  async deletePrefix(prefix: string): Promise<number> {
    const keys = await this.list(prefix);
    for (let offset = 0; offset < keys.length; offset += 1000) {
      const batch = keys.slice(offset, offset + 1000);
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.options.bucket,
          Delete: { Objects: batch.map((key) => ({ Key: this.objectName(key) })), Quiet: true },
        }),
      );
      if (result.Errors?.length) {
        throw new Error(`S3 delete-prefix failed for ${result.Errors.length} object(s)`);
      }
    }
    await rm(this.cachePath(prefix), { recursive: true, force: true }).catch(() => undefined);
    return keys.length;
  }

  async materialize(key: string): Promise<string> {
    const target = this.materializedPath(key);
    const partial = `${target}.part`;
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await pipeline(await this.readStream(key), createWriteStream(partial));
      await rename(partial, target);
      return target;
    } catch (err) {
      await rm(partial, { force: true }).catch(() => undefined);
      await rm(target, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  async releaseMaterialized(materializedPath: string): Promise<void> {
    await releaseCloudMaterialization(this.options.cacheDir, materializedPath);
  }

  async readStream(key: string, range?: { start: number; end: number }): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: this.objectName(key),
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      }),
    );
    if (!response.Body) throw new Error('S3 object response had no body');
    return response.Body as Readable;
  }

  async signedDownloadUrl(
    key: string,
    opts: { expiresSeconds: number; fileName?: string; download?: boolean; contentType?: string },
  ): Promise<string> {
    const disposition = opts.fileName
      ? `${opts.download ? 'attachment' : 'inline'}; filename="${opts.fileName.replace(/[^\w.\- ]+/g, '_')}"`
      : undefined;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: this.objectName(key),
        ...(disposition ? { ResponseContentDisposition: disposition } : {}),
        ...(opts.contentType ? { ResponseContentType: opts.contentType } : {}),
      }),
      { expiresIn: opts.expiresSeconds },
    );
  }
}

async function releaseCloudMaterialization(
  cacheDir: string,
  materializedPath: string,
): Promise<void> {
  const root = path.resolve(cacheDir, 'materialized');
  const target = path.resolve(materializedPath);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error(
      'Refusing to release a path outside the object-store materialization directory',
    );
  }
  await rm(target, { force: true });
}
