# ClipSubtitles

Agent-native video captioning studio for `clipsubtitles.com`. An agent (ChatGPT,
Claude, any MCP client) or a person turns a short video into accurate, editable,
styled captions and rendered exports:

`import video → generate captions → review/edit → preview → approve cost → render/export`

The machine surface (8 MCP tools + a typed REST/OpenAPI v1) and the precision
web editor share one backend, one contract package, and one caption layout
engine — what the editor shows is what the renderer draws.

## Quick start (local, no external accounts)

Requirements: Node ≥ 24, pnpm ≥ 10, `ffmpeg`/`ffprobe` on `PATH`.

```bash
pnpm install
pnpm fixtures:build      # synthetic demo clips + benchmark corpus (deterministic, redistributable)
pnpm dev                 # API :3101, task worker, web :3100 (mock identity, mock transcription)
```

Open <http://localhost:3100>, pick a local identity, and either upload a clip or
click a demo clip. Generate captions, edit words/timing/style, preview, approve
the quote, download MP4 / transparent overlay / SRT / VTT.

Agents connect to `http://localhost:3100/api/mcp` (Streamable HTTP). Mint a
bearer token with `pnpm dev:token`, or let an MCP client walk through the
local OAuth 2.1 authorization server (PKCE + dynamic registration) that mock
mode exposes at `/.well-known/oauth-authorization-server`.

## Commands

| Command | What it does |
|---------|--------------|
| `pnpm dev` / `dev:api` / `dev:worker` / `dev:web` | Run everything or one process |
| `pnpm dev:token [--subject "mock\|joe"] [--scopes captions:read]` | Mint a local bearer token (mock mode only) |
| `pnpm check` | lint + typecheck + tests + build |
| `pnpm test` / `pnpm test:watch` | Vitest across all packages (unit, integration, contract, security, idempotency, MCP conformance) |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | ESLint, `tsc` per package, esbuild server bundle + `next build` |
| `pnpm mcp:conformance` | Real Streamable HTTP client against an in-process server: discovery, tools, negative/scope/cost/retry/cancel fixtures |
| `pnpm smoke:e2e` | REST flow end to end incl. a real render, exact-once billing check |
| `pnpm smoke:render` | Renders the demo fixture twice and verifies byte-identical outputs |
| `pnpm benchmark [--providers …] [--repeats N]` | Transcription benchmark harness (mock providers by default) |
| `pnpm benchmark:motion` | Compare sparse PNG, full-frame Skia, cropped-band Skia, and warm Remotion on one deterministic motion fixture; write reports/canaries under `.data/motion-benchmark/` |
| `pnpm fixtures:build` | Regenerate `fixtures/generated/` |
| `pnpm openapi:emit` | Write `docs/api/openapi.json` from the live routes |

## Repository layout

```
packages/contracts     zod schemas, error codes, limits, MCP tool descriptors (shared by API, MCP, web)
packages/core          pure caption domain: normalization, segmentation, layout, patches, QA, pricing, hashing
packages/transcription provider adapters (mock + config-gated live shells), ffmpeg audio/VAD, benchmark harness
packages/storage       node:sqlite migrations, workspace-scoped repositories, task queue, credit ledger, object store
packages/render        Skia caption rasterizer + ffmpeg compositor; sparse still states or bounded cropped-band motion pipe
packages/server        Hono REST v1 + OpenAPI 3.1, MCP endpoint, auth boundary, services, durable worker, CLIs
apps/web               Next.js editor + recovery library (port 3100)
fixtures/              synthetic corpus definitions; generated media lives in fixtures/generated (gitignored)
docs/                  architecture, decisions, benchmark notes, directory-readiness artifacts, OpenAPI
```

## Configuration

Copy `.env.example` to `.env` for **non-secret defaults only** (ports, limits,
mode switches). Provider and identity secrets (`GEMINI_API_KEY`,
`ELEVENLABS_API_KEY`, `WORKOS_*`, `AUTH_LOCAL_SECRET` in
production) must come from the vault (`mc-vault`) or a securely injected
process environment — never paste them into `.env`, commit them, or print them.
Everything runs with the defaults; every integration is config-gated:

- `AUTH_MODE=mock|workos` — WorkOS/AuthKit is the only production identity and OAuth authority.
- `TRANSCRIPTION_PROVIDERS=mock` — local deterministic mode; production uses `gemini,elevenlabs` as the ordered live chain.
- `RENDERER=ffmpeg|remotion` — deterministic canvas+ffmpeg compositor by default.
- `TRUSTED_PROXIES=` — comma-separated proxy IPs/CIDRs whose `X-Forwarded-For`/`X-Real-IP` are honoured for client-IP rate limiting. Empty (default) never trusts forwarding headers.
- Limits/retention: upload size, source duration, private-URL policy, retention days, signed-URL/quote TTLs, rate limits, initial credit grant.

With R2, supported browser files automatically use the hardened direct-upload
path (exact-size staging PUT → authenticated snapshot → durable hash/FFprobe
worker → provider-side final copy). Other stores and unknown MIME types retain
the bounded API-streaming fallback. See `docs/direct-upload-operations.md`.

## Guarantees the code enforces

- Ownership is derived from the verified credential; tool/REST inputs never carry a user or workspace id.
- Spoken words are never rewritten by the system; edits are explicit per-word operations recorded as revisions. Provider fallback only happens before any transcript exists.
- Every edit bumps the project version; previews/renders/quotes reference an exact version + content hash.
- Paid renders: immutable quote → exact-cost approval → idempotent reserve → exactly-once settle/release. Duplicate render requests return the same task.
- Bounded payloads, strict schemas, redacted public errors with `errorRef`, audit events without transcript text, short-lived signed URLs, retention sweeps, cooperative task cancellation with lease reclaim.
- Transcript/caption/title/file-name text is treated as untrusted data everywhere (including MCP tool output).

See `docs/architecture.md`, `docs/decisions/`, and `PARKED_ACTIONS.md` for the
remaining external gates.
