# ClipSubtitles

Read and follow `AGENTS.md`; it is the canonical project instruction file.
`README.md` has the quick start, `docs/architecture.md` the system map,
`docs/decisions/` the ADRs, and `PARKED_ACTIONS.md` the external gates.

## Project knowledge (for future sessions)

### Structure

- pnpm workspace: `packages/{contracts,core,transcription,storage,render,server}` and `apps/web`. Packages export TS sources; the server bundles with esbuild (`packages/server/build.mjs`), the web app with Next 16 (Turbopack).
- Runtime data lives under `.data/` (SQLite `clipsubtitles.sqlite`, `objects/`, `work/`). Delete `.data/` to reset local state.
- Generated fixtures live in `fixtures/generated/` (gitignored). `pnpm fixtures:build` recreates them deterministically (13 WAV cases + 2 demo MP4s with `.truth.json` sidecars).

### Gotchas

- `node:sqlite` is experimental in Node 24: scripts pass `--no-warnings=ExperimentalWarning`; tests print the warning once, harmlessly.
- This machine's ffmpeg has no `libass`/`drawtext`: captions are rasterized with `@napi-rs/canvas` and composited with ffmpeg `overlay` (see ADR-0002). Any renderer change must keep `pnpm smoke:render` byte-identical.
- Motion is content-hashed in `StyleConfig.motion`. `none` keeps the sparse PNG/ffconcat lane; named motion presets use a one-frame-at-a-time straight-RGBA caption band with FFmpeg stdin backpressure. Keep full-frame mode benchmark-only and preserve full-vs-band byte identity in `packages/render/src/render.test.ts`.
- Raw-frame input and FFmpeg encode progress happen concurrently. Merge them through the monotonic emitter in `FfmpegCompositeRenderer.runMotion`; forwarding both callbacks directly makes task progress jump backwards.
- Style sizes are fractions of the **shorter** frame side (ADR-0006). Presets were calibrated so their longest line fits the 90 % safe width at 1080p; `layoutCaption` shrinks text as a last resort.
- `packages/core` must stay isomorphic (no `node:` imports): the browser overlay runs it. Hashing uses the pure SHA-256 in `core/src/sha256.ts`.
- Vite 8 (used by Vitest) transforms with **oxc**; TSX tests in `apps/web` need `oxc: { jsx: { runtime: 'automatic' } }` because Next's tsconfig uses `jsx: preserve`.
- `Field` in `apps/web/src/components/ui/primitives.tsx` is intentionally NOT a `<label>`: it provides a label id via context so radiogroups/sliders keep option-only accessible names. Keep it that way (a11y tests assert it).
- The auth callback and the mock sign-in flow must stay on the **web** origin (proxied to the API) so the session cookie is set for the site users browse.
- MCP tool errors are returned as JSON text content with `isError: true` and never as `structuredContent` (clients validate structured content against the success schema).
- OpenAPI component names come from zod 4 `.meta({ id })` on contract schemas; keep tagging new top-level schemas or the document balloons.
- Playwright browsers are installed outside the repo via `PLAYWRIGHT_BROWSERS_PATH` (this job used the Claude job temp dir); e2e expects `pnpm dev` to be running.
- Export rows are written ONLY through `packages/server/src/services/outputs.ts` (`publishOutputs`): blobs under `<ws>/exports/<taskId>/` first, then all rows in one transaction; any failure discards rows + every blob under the prefix. Terminal task states (failed/cancelled/lease-reclaimed) call `discardOutputsForTaskId`. Don't add a second `createExport` call site.
- `credit_ledger.idempotency_key` is unique per **workspace** (migration 2 rebuilt the table). `grantCredits` looks up `(workspace_id, idempotency_key)`; never query by key alone.
- Client IPs for rate limiting come from the socket unless the peer is in `TRUSTED_PROXIES` (`auth/client-ip.ts`); in-process test requests (no socket) share one `unknown` bucket. Forwarding headers are never trusted by default.
- Vitest must be run per package (`pnpm --filter @clipsubtitles/web test`); running the root `vitest` binary with a path filter skips the package config (aliases, jsx runtime).

### Common operations

- Reset and re-seed local data: `rm -rf .data && pnpm dev` (mock users get `INITIAL_CREDIT_GRANT` credits on first sign-in).
- Get a bearer token for curl/MCP: `TOKEN=$(pnpm -s dev:token)`; `curl -H "Authorization: Bearer $TOKEN" localhost:3101/v1/me`.
- Create a demo project via API (mock mode): `POST /dev/fixtures/clean-en-product-demo/projects` with a bearer token.
- Inspect an audit trail for a public error: look up `error_ref` in the `audit_events` table (`.data/clipsubtitles.sqlite`).
