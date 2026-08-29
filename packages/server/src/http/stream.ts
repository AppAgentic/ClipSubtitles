import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

export interface StreamFileOptions {
  path: string;
  mimeType: string;
  fileName?: string;
  download?: boolean;
  rangeHeader?: string | undefined;
  cacheSeconds?: number;
}

/** Stream a local file with HTTP Range support (needed for video seeking in the editor). */
export async function streamFile(opts: StreamFileOptions): Promise<Response> {
  const info = await stat(opts.path);
  const size = info.size;
  const headers = new Headers({
    'Content-Type': opts.mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': `private, max-age=${opts.cacheSeconds ?? 300}`,
    'X-Content-Type-Options': 'nosniff',
  });
  if (opts.fileName) {
    const safe = opts.fileName.replace(/[^\w.\- ]+/g, '_');
    headers.set('Content-Disposition', `${opts.download ? 'attachment' : 'inline'}; filename="${safe}"`);
  }
  const range = opts.rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(opts.rangeHeader.trim()) : null;
  if (range && size > 0) {
    let start = range[1] ? Number(range[1]) : NaN;
    let end = range[2] ? Number(range[2]) : NaN;
    if (Number.isNaN(start)) {
      // suffix range: last N bytes
      start = Math.max(0, size - (Number.isNaN(end) ? size : end));
      end = size - 1;
    } else if (Number.isNaN(end) || end >= size) {
      end = size - 1;
    }
    if (start > end || start >= size) {
      headers.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    const body = Readable.toWeb(createReadStream(opts.path, { start, end })) as unknown as ReadableStream;
    return new Response(body, { status: 206, headers });
  }
  headers.set('Content-Length', String(size));
  const body = Readable.toWeb(createReadStream(opts.path)) as unknown as ReadableStream;
  return new Response(body, { status: 200, headers });
}
