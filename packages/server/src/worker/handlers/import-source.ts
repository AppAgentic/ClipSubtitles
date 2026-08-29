import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import type { TaskResult } from '@clipsubtitles/contracts';
import { ObjectTooLargeError, getAssetById, updateAsset, updateProjectMeta, type TaskRecord } from '@clipsubtitles/storage';
import type { AppContext } from '../../context';
import { isPrivateAddress, validateSourceUrl } from '../../services/source-policy';
import { finalizeSourceAsset, sourceStorageKey } from '../../services/uploads';
import { TaskFailure } from '../errors';
import { ImportSourceInputSchema } from '../inputs';
import type { HandlerTools } from '../worker';

const MAX_REDIRECTS = 3;
const USER_AGENT = 'ClipSubtitles/0.1 (+https://clipsubtitles.com)';
const CONNECT_TIMEOUT_MS = 20_000;

export class PrivateAddressError extends Error {
  constructor(readonly hostname: string) {
    super(`Host ${hostname} resolves to a private address`);
    this.name = 'PrivateAddressError';
  }
}

/**
 * DNS lookup used by the socket itself, so the address that is validated is
 * the address that is connected to (no resolve-then-reconnect window for DNS
 * rebinding). Every resolved address must be public unless private hosts are
 * explicitly allowed for local development.
 */
export function createGuardedLookup(allowPrivate: boolean, resolver: (hostname: string) => Promise<LookupAddress[]> = (h) => lookup(h, { all: true })): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname).then(
      (addresses) => {
        const first = addresses[0];
        if (!first) {
          callback(new Error(`No addresses for ${hostname}`), '', 4);
          return;
        }
        if (!allowPrivate && addresses.some((a) => isPrivateAddress(a.address))) {
          callback(new PrivateAddressError(hostname), '', 4);
          return;
        }
        if (typeof options === 'object' && options && 'all' in options && options.all) {
          (callback as unknown as (err: Error | null, addresses: LookupAddress[]) => void)(null, addresses);
        } else {
          callback(null, first.address, first.family);
        }
      },
      (err: Error) => callback(err, '', 4),
    );
  };
}

interface FetchedResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Readable;
}

function requestOnce(url: URL, lookupFn: LookupFunction, signal: AbortSignal): Promise<FetchedResponse> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      { method: 'GET', headers: { 'user-agent': USER_AGENT, accept: 'video/*,audio/*;q=0.9,*/*;q=0.5' }, lookup: lookupFn, timeout: CONNECT_TIMEOUT_MS, signal },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res }),
    );
    req.on('timeout', () => req.destroy(new Error('connect timeout')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch a remote source with redirect re-validation, DNS-pinned private-range
 * blocking, content-type checks, and a streaming byte cap.
 */
export async function fetchRemoteSource(
  ctx: AppContext,
  rawUrl: string,
  storageKey: string,
  signal: AbortSignal,
  lookupFn: LookupFunction = createGuardedLookup(ctx.config.limits.allowPrivateSourceUrls),
): Promise<{ bytes: number; sha256: string; mimeType?: string }> {
  let url = validateSourceUrl(rawUrl, { allowPrivate: ctx.config.limits.allowPrivateSourceUrls });
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let res: FetchedResponse;
    try {
      res = await requestOnce(url, lookupFn, signal);
    } catch (err) {
      if (signal.aborted) throw err;
      if (err instanceof PrivateAddressError) throw new TaskFailure('SOURCE_URL_REJECTED', 'The source host resolves to a private address.');
      throw new TaskFailure('SOURCE_URL_REJECTED', 'The source could not be fetched.', { retryable: true, internal: err });
    }
    if (res.status >= 300 && res.status < 400) {
      res.body.resume();
      const location = res.headers.location;
      if (!location) throw new TaskFailure('SOURCE_URL_REJECTED', 'Redirect without location.');
      url = validateSourceUrl(new URL(location, url).toString(), { allowPrivate: ctx.config.limits.allowPrivateSourceUrls });
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      res.body.resume();
      throw new TaskFailure('SOURCE_URL_REJECTED', `The source responded with status ${res.status}.`, { retryable: res.status >= 500 });
    }
    const length = Number(res.headers['content-length'] ?? '0');
    if (length > ctx.config.limits.maxRemoteSourceBytes) {
      res.body.resume();
      throw new TaskFailure('PAYLOAD_TOO_LARGE', 'The remote source exceeds the size limit.');
    }
    const mime = res.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
    if (mime && !mime.startsWith('video/') && !mime.startsWith('audio/') && mime !== 'application/octet-stream' && mime !== 'binary/octet-stream') {
      res.body.resume();
      throw new TaskFailure('UNSUPPORTED_MEDIA', `The remote source is ${mime}, not media.`);
    }
    try {
      const stored = await ctx.store.putStream(storageKey, res.body, { maxBytes: ctx.config.limits.maxRemoteSourceBytes });
      return mime ? { ...stored, mimeType: mime } : stored;
    } catch (err) {
      if (err instanceof ObjectTooLargeError) throw new TaskFailure('PAYLOAD_TOO_LARGE', 'The remote source exceeds the size limit.');
      throw err;
    }
  }
  throw new TaskFailure('SOURCE_URL_REJECTED', 'Too many redirects.');
}

export async function importSourceHandler(ctx: AppContext, task: TaskRecord, tools: HandlerTools): Promise<TaskResult> {
  const input = ImportSourceInputSchema.parse(task.input);
  const asset = getAssetById(ctx.db, input.assetId);
  if (!asset || asset.workspaceId !== task.workspaceId) throw new TaskFailure('NOT_FOUND', 'Source asset not found.');
  tools.progress(5, 'fetching');
  const key = sourceStorageKey(asset.workspaceId, asset.id, asset.fileName ?? 'source.mp4');
  try {
    const stored = await fetchRemoteSource(ctx, input.url, key, tools.signal);
    tools.progress(70, 'probing');
    updateAsset(ctx.db, asset.id, { status: 'importing', storageKey: key }, ctx.clock.iso());
    const ready = await finalizeSourceAsset(ctx, asset, { storageKey: key, bytes: stored.bytes, sha256: stored.sha256, ...(stored.mimeType ? { mimeType: stored.mimeType } : {}) });
    tools.progress(95, 'ready');
    return { kind: 'import_source', projectId: input.projectId, assetId: asset.id, durationMs: ready.durationMs ?? 0 };
  } catch (err) {
    if (!tools.signal.aborted) {
      updateAsset(ctx.db, asset.id, { status: 'failed' }, ctx.clock.iso());
      updateProjectMeta(ctx.db, input.projectId, { status: 'failed' }, ctx.clock.iso());
    }
    // Whatever was fetched is discarded: a retry re-fetches, and a failed/cancelled import owns no blob.
    await ctx.store.delete(key).catch(() => false);
    throw err;
  }
}
