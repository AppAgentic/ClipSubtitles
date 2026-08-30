# Architecture

ClipSubtitles is one product with two surfaces over one backend. Agents (MCP)
and people (web editor) call the same typed services; every asynchronous step
is a durable task; every paid step is an immutable quote.

```
┌──────────────┐   Streamable HTTP    ┌────────────────────────────────────────┐
│ MCP clients  │ ───────────────────▶ │ packages/server (Hono)                  │
│ ChatGPT,     │  /api/mcp (8 tools)  │  auth boundary → services → storage      │
│ Claude, …    │                      │  REST v1 + OpenAPI 3.1 (same services)   │
└──────────────┘                      │  durable worker (separate process)       │
┌──────────────┐  same-origin /v1     │   import · generate · preview · export   │
│ apps/web     │ ───────────────────▶ │   retention sweep · lease reclaim        │
│ Next.js 3100 │  (rewrites → API)    └───────┬───────────────┬─────────────────┘
└──────────────┘                              │               │
                                   packages/storage   packages/render + transcription
                                   repository layer,  canvas rasterizer + ffmpeg,
                                   file/GCS/R2 blobs  provider adapters, VAD, benchmark
                                              ▲
                                   packages/core (pure, isomorphic): normalize, segment,
                                   layout, patch, QA, pricing, hashing — used by the
                                   worker, the renderer, AND the browser overlay
```

## Packages

| Package | Role | Depends on |
|---------|------|------------|
| `contracts` | zod schemas for every public object, stable error codes + HTTP mapping, limits, MCP tool descriptors (name, annotations, scope, cost, input/output schemas) | zod |
| `core` | Pure domain. `normalizeWords` (provider-neutral words, monotonic timing, duration fit), `segmentWords` (DP over pause/punctuation/clause signals with manual split/merge constraints; never rewrites words), `breakLines`, `layoutCaption` (frame-relative geometry incl. fit-to-width), `applyPatchOps` (constrained edits, transactional), `evaluateCaptions` (fidelity + reading speed QA), `quoteRender` (deterministic pricing), `computeContentHash` | contracts |
| `transcription` | `TranscriptionProvider` interface, deterministic mock profiles, config-gated live adapters (Gemini 3.5 Transcribe and ElevenLabs Scribe), ffmpeg extraction/probe, energy VAD, `transcribeWithFallback`, benchmark corpus/synth/scorer/runner/report | core |
| `storage` | Migrations, workspace-scoped repositories (projects, revisions, assets, uploads, tasks, quotes, credits, exports, idempotency, audit, identity), leased task queue, exactly-once ledger, `ObjectStore` | core |
| `render` | `Renderer` interface. `FfmpegCompositeRenderer`: motion `none` plans/rasterizes sparse PNG states into ffconcat; named motion presets evaluate exact-frame cubic/spring curves and stream one reusable padded Skia caption band through bounded FFmpeg stdin. Both produce MP4 / ProRes 4444 overlay / SRT / VTT / previews. | core |
| `server` | Config, context, auth (session cookie + bearer, scopes, grants/revocation, CSRF, rate limits, signed URLs), services, REST routes, MCP server + route, worker + handlers, CLIs | all |
| `web` | Editor + recovery library; runs `core` in the browser for sub-second style/timing feedback | contracts, core |

## Deployment boundary

The economical production target is three independently scaling linux/amd64
Cloud Run images: public API, private push worker, and web. Cloud Tasks invokes
the worker one job per instance; a transactional outbox repairs enqueue races.
R2 is the preferred media store because provider-native signed downloads avoid
GCS public-egress charges. Supported browser media also uses an exact-size R2
staging PUT; authenticated completion snapshots the reusable signed key before a
durable worker hashes, probes, and internally copies it to the final source key.
GCS and unknown MIME types retain the bounded API-streaming fallback. Cloud-backed files
are materialized into unique atomic scratch paths only while FFmpeg needs them,
then released in `finally` cleanup.

Persistence is asynchronous end to end through `DataStore`. Local/test runs use
the serialized `SqliteStore`; production uses pooled `PostgresStore` transactions
pinned with `AsyncLocalStorage`, guarded updates, row locks, and `SKIP LOCKED`
task claims. The PostgreSQL 17 migration/concurrency suite covers migration
startup, rollback/pinning, billing, idempotency, revision numbering, leases,
outbox redelivery, direct-upload completion, and optimistic edits. Terraform still defaults
`deploy_services=false` until the dedicated project, secrets, and plan are approved.

## Request path

1. **Authentication** (`auth/middleware.ts`): bearer JWT (HS256 local / RS256 WorkOS JWKS, algorithm pinned) or session cookie. Subject → `ensureUserWorkspace` (one subject = one personal workspace). Bearer tokens must carry recognised scopes (fail closed) and map to an `oauth_grant` per client — the user's revocation handle. Cookie requests on unsafe methods must be same-origin (Sec-Fetch-Site/Origin).
2. **Validation**: OpenAPIHono validates params/body against the contract schemas; unknown keys are rejected; failures become `VALIDATION_FAILED` with bounded issue lists.
3. **Idempotency** (`http/idempotent.ts`): `Idempotency-Key` header or body field, scoped by workspace + operation, fingerprinted; replay/mismatch/in-progress semantics.
4. **Services**: all reads are workspace-scoped; cross-workspace ids resolve to `NOT_FOUND`.
5. **Errors** (`errors.ts`): everything maps to a public code; internals go to the redacted log/audit with an `errorRef` returned to the client.

## Tasks

`tasks` rows are claimed with a lease (`claimNextTask`), heart-beaten with progress and a cooperative `cancel_requested` flag, and completed/failed/cancelled exactly once. Retryable failures re-queue with backoff until `max_attempts`; expired leases are reclaimed on worker maintenance (re-queued, failed, or cancelled with reservation release). Handlers: `import_source` (DNS-pinned bounded fetch), `finalize_upload` (immutable snapshot → SHA-256 → FFprobe → final provider copy), `generate_captions` (extract → VAD → provider chain → normalize → segment → commit as a new revision against the *current* version), `render_preview`, `render_export` (snapshot of exact words/pages/style captured at quote time), `retention_sweep`.

## Billing invariants

- `render-quotes` freezes settings, project version, content hash, expected outputs, credit cost, and price version, with a TTL. Any project edit invalidates open quotes.
- `renders` requires `{quoteId, approvedCreditCost, idempotencyKey}`; the cost must match exactly. In one transaction: enqueue task → reserve credits (unique per quote/task) → consume quote.
- The worker settles credits in the same transaction that records completion (only if it still owns the lease); failure/cancellation/lease-loss release the reservation; every ledger row is idempotent by key.

## Rendering determinism

Sizes are fractions of the shorter frame side; the browser overlay, Skia rasterizer, and optional Remotion composition call the same `layoutCaption` and `captionMotionState` functions. Motion is named and bounded (`none`, `soft-rise`, `spring-pop`, `karaoke-slide`) with exact frame-grid evaluation. Animated renders draw only the unioned caption region plus 12% movement/shadow/blur padding, feed straight RGBA one frame at a time, and await FFmpeg backpressure; the source video is decoded once. ffmpeg runs with `-fflags +bitexact -flags +bitexact -map_metadata -1`; `pnpm smoke:render` verifies repeat byte identity and renderer tests verify full-frame/cropped-band output identity.

## Security notes

- Media, transcripts, titles, and file names are data: they never reach logs (redaction of content keys), never appear in audit metadata, and every MCP/REST project payload carries `contentNotice`.
- Uploads are single bounded PUTs to signed targets; the token is claimed atomically before bytes are written. Remote imports resolve DNS inside the socket connect (no rebinding window), reject private ranges, cap size, and re-validate redirects.
- Signed content URLs are HMAC-bound to `{kind, id, workspace, expiry}` and short-lived; persistent identity stays server-side.
- Retention sweeps purge expired sources/exports and mark records `purged`; deleting a project purges immediately and cancels its tasks. Push-mode deployments wake the scale-to-zero worker with an authenticated daily Cloud Scheduler job. Provider deletion failures retain their database pointers for retry rather than creating invisible orphan objects. See `docs/data-retention-policy.md`.
- Output publishing is atomic enough to never orphan or half-publish: render blobs are written under `<workspace>/exports/<taskId>/` first, then every export row is inserted in one transaction; a failure discards rows and every blob under the prefix (row-less blobs included). Terminal task states — permanent failure, cancellation, lease reclaim — discard outputs the same way. Source uploads/imports delete their blob whenever the asset cannot be finalized.
- Anonymous rate-limit keys use the socket address; `X-Forwarded-For`/`X-Real-IP` are honoured only when the peer is in `TRUSTED_PROXIES` (walked right-to-left past trusted hops). Ledger idempotency keys are unique per workspace.
