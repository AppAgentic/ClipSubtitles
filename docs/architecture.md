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
                                   node:sqlite,       canvas rasterizer + ffmpeg,
                                   file object store  provider adapters, VAD, benchmark
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
| `transcription` | `TranscriptionProvider` interface, deterministic mock profiles, config-gated live adapters (Gemini, ElevenLabs Scribe, GPT Transcribe + alignment, Whisper baseline), ffmpeg extraction/probe, energy VAD, `transcribeWithFallback`, benchmark corpus/synth/scorer/runner/report | core |
| `storage` | Migrations, workspace-scoped repositories (projects, revisions, assets, uploads, tasks, quotes, credits, exports, idempotency, audit, identity), leased task queue, exactly-once ledger, `ObjectStore` | core |
| `render` | `Renderer` interface. `FfmpegCompositeRenderer`: plan visual states → rasterize each once (Skia canvas, same `layoutCaption`) → ffconcat timeline → ffmpeg `overlay` with bit-exact flags → MP4 / ProRes 4444 overlay / SRT / VTT / low-res preview | core |
| `server` | Config, context, auth (session cookie + bearer, scopes, grants/revocation, CSRF, rate limits, signed URLs), services, REST routes, MCP server + route, worker + handlers, CLIs | all |
| `web` | Editor + recovery library; runs `core` in the browser for sub-second style/timing feedback | contracts, core |

## Request path

1. **Authentication** (`auth/middleware.ts`): bearer JWT (HS256 local / RS256 WorkOS JWKS, algorithm pinned) or session cookie. Subject → `ensureUserWorkspace` (one subject = one personal workspace). Bearer tokens must carry recognised scopes (fail closed) and map to an `oauth_grant` per client — the user's revocation handle. Cookie requests on unsafe methods must be same-origin (Sec-Fetch-Site/Origin).
2. **Validation**: OpenAPIHono validates params/body against the contract schemas; unknown keys are rejected; failures become `VALIDATION_FAILED` with bounded issue lists.
3. **Idempotency** (`http/idempotent.ts`): `Idempotency-Key` header or body field, scoped by workspace + operation, fingerprinted; replay/mismatch/in-progress semantics.
4. **Services**: all reads are workspace-scoped; cross-workspace ids resolve to `NOT_FOUND`.
5. **Errors** (`errors.ts`): everything maps to a public code; internals go to the redacted log/audit with an `errorRef` returned to the client.

## Tasks

`tasks` rows are claimed with a lease (`claimNextTask`), heart-beaten with progress and a cooperative `cancel_requested` flag, and completed/failed/cancelled exactly once. Retryable failures re-queue with backoff until `max_attempts`; expired leases are reclaimed on worker maintenance (re-queued, failed, or cancelled with reservation release). Handlers: `import_source` (DNS-pinned bounded fetch), `generate_captions` (extract → VAD → provider chain → normalize → segment → commit as a new revision against the *current* version), `render_preview`, `render_export` (snapshot of exact words/pages/style captured at quote time), `retention_sweep`.

## Billing invariants

- `render-quotes` freezes settings, project version, content hash, expected outputs, credit cost, and price version, with a TTL. Any project edit invalidates open quotes.
- `renders` requires `{quoteId, approvedCreditCost, idempotencyKey}`; the cost must match exactly. In one transaction: enqueue task → reserve credits (unique per quote/task) → consume quote.
- The worker settles credits in the same transaction that records completion (only if it still owns the lease); failure/cancellation/lease-loss release the reservation; every ledger row is idempotent by key.

## Rendering determinism

Sizes are fractions of the shorter frame side; the browser overlay, the rasterizer, and the (optional) Remotion composition all call `layoutCaption` with a real text measurer for Inter. ffmpeg runs with `-fflags +bitexact -flags +bitexact -map_metadata -1`; `pnpm smoke:render` verifies byte-identical MP4/MOV/SRT/VTT across two runs.

## Security notes

- Media, transcripts, titles, and file names are data: they never reach logs (redaction of content keys), never appear in audit metadata, and every MCP/REST project payload carries `contentNotice`.
- Uploads are single bounded PUTs to signed targets; the token is claimed atomically before bytes are written. Remote imports resolve DNS inside the socket connect (no rebinding window), reject private ranges, cap size, and re-validate redirects.
- Signed content URLs are HMAC-bound to `{kind, id, workspace, expiry}` and short-lived; persistent identity stays server-side.
- Retention sweeps purge expired sources/exports and mark records `purged`; deleting a project purges immediately and cancels its tasks.
