import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileObjectStore, S3ObjectStore } from './object-store';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('object-store hardened direct uploads', () => {
  it('presigns the exact content length without the SDK empty-body checksum', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'clipsubtitles-presign-'));
    dirs.push(dir);
    const store = new S3ObjectStore({
      bucket: 'media',
      endpoint: 'https://example.r2.cloudflarestorage.com',
      accessKeyId: 'test-access',
      secretAccessKey: 'x'.repeat(40),
      cacheDir: dir,
    });
    const authorization = await store.directUploadAuthorization(
      'ws_test/staging/upload_test/incoming.mp4',
      {
        expiresSeconds: 300,
        contentLength: 12_345,
        contentType: 'video/mp4',
        metadata: { 'upload-id': 'upload_test', 'expected-bytes': '12345' },
      },
    );
    const url = new URL(authorization.url);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;host');
    expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
    expect(url.searchParams.get('x-amz-meta-upload-id')).toBe('upload_test');
    expect(authorization.headers).toEqual({ 'content-type': 'video/mp4' });
  });

  it('copies locally without aliasing the source bytes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'clipsubtitles-copy-'));
    dirs.push(dir);
    const store = new FileObjectStore(dir);
    await store.put('ws/source.bin', Buffer.from('first'));
    await store.copy('ws/source.bin', 'ws/snapshot.bin');
    await writeFile(store.localPath('ws/source.bin'), 'changed');
    expect(await store.get('ws/snapshot.bin')).toEqual(Buffer.from('first'));
  });
});
