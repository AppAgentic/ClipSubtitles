# ClipSubtitles Initial Agent-Native Plan

## Product Contract

ClipSubtitles converts a source video into accurate, editable, styled captions
and exports through an agent-first workflow. The first paid outcome is:

`import video -> generate captions -> review/edit -> preview -> approve cost -> render/export`

The web editor and MCP clients consume the same backend contracts. The initial
release does not include a general timeline editor, AI avatars, stock B-roll,
social scheduling, visual safe placement, face tracking, OCR, or automatic
caption repositioning.

## Human Surfaces

1. WorkOS-hosted sign-in and automatic personal-workspace creation.
2. A compact library for projects, tasks, exports, credits, billing, and
   recovery.
3. A project editor with video preview, transcript, word timing, caption pages,
   explicit top/centre/lower-third/bottom positioning, and style controls.
4. An immutable render confirmation showing output settings and estimated
   credit cost.

## Agent Package

Ship one product package:

- Remote MCP server at `/api/mcp` over Streamable HTTP.
- A ClipSubtitles workflow skill that sequences tools, protects transcript
  fidelity, estimates cost, and recovers failed jobs.
- Optional MCP Apps UI for inline status/approval cards and the fullscreen
  precision editor.
- A typed REST/OpenAPI surface used by both MCP tools and the web application.

### Public MCP tools

Keep the public capability registry intentionally small:

1. `create_caption_project`
2. `generate_captions`
3. `get_caption_project`
4. `update_caption_project`
5. `render_caption_preview`
6. `render_caption_export`
7. `get_caption_task`
8. `cancel_caption_task`

Each tool needs typed input/output schemas, correct read/write/cost annotations,
bounded payloads, stable error codes, and redacted public failures. Internal
functions are not exposed automatically.

## REST/OpenAPI v1

- `POST /v1/projects` — create a project and return an upload target or accept
  a bounded remote source URL.
- `POST /v1/projects/{projectId}/captions` — start transcription,
  normalization, segmentation, and initial styling.
- `GET /v1/projects/{projectId}` — retrieve the current project version,
  transcript summary, caption pages, style, tasks, and exports.
- `PATCH /v1/projects/{projectId}` — apply constrained transcript, timing,
  segmentation, or style patches using optimistic version checks.
- `POST /v1/projects/{projectId}/previews` — create a fast low-resolution
  preview task.
- `POST /v1/projects/{projectId}/render-quotes` — return immutable settings,
  project version/hash, expected outputs, and credit estimate.
- `POST /v1/projects/{projectId}/renders` — consume an unexpired approved quote
  and idempotency key, reserve credits, and start a final render task.
- `GET /v1/tasks/{taskId}` — retrieve durable task progress and bounded errors.
- `POST /v1/tasks/{taskId}/cancel` — request cancellation.
- `GET /v1/exports/{exportId}` — retrieve metadata and a short-lived download
  URL for MP4, transparent overlay, SRT, or VTT output.

Webhook callbacks are deferred until the agent-first vertical slice is proven.
When added, they must be signed, replay-protected, retryable, and scoped to a
workspace.

## Auth and Ownership

- WorkOS/AuthKit is the only product identity and OAuth authority.
- Private beta uses a predefined OAuth client for ChatGPT/Codex/Claude testing.
- Public directory readiness later adds CIMD/DCR and full discovery metadata
  without migrating identities or project ownership.
- Use at most `captions:read` and `captions:write` scopes in v1.
- One verified WorkOS subject automatically maps to one personal workspace.
- Never accept `userId` or `workspaceId` as authority from a public caller.
- Workers use internal workload identity, not delegated user tokens.
- Users can revoke connections and delete projects/media from the web surface.

## Data Model

`Workspace -> CaptionProject -> SourceAsset -> TranscriptRevision -> TranscriptWord[] -> CaptionPage[] -> StyleConfig -> RenderTask -> Export`

Supporting records: `OAuthGrant`, `RenderQuote`, `UsageLedger`, and `AuditEvent`.
Every edit increments the project version; previews and renders reference an
exact version and content hash.

Each normalized transcript word stores text, start/end time, confidence when
available, speaker when available, and language. Provider-specific fields stay
behind adapters.

## Media Pipeline

`video -> audio extraction/VAD -> transcription adapter -> normalized words -> semantic/prosody segmentation -> template styling -> Remotion preview/export -> deterministic QA`

Benchmark before selecting the production default:

1. Gemini 3.5 Transcribe in verbatim mode with word timestamps and vocabulary.
2. ElevenLabs Scribe v2.
3. GPT Transcribe plus NeMo/WhisperX alignment.
4. Existing Whisper path as baseline.

The evaluation set must cover clean speech, music, accents, code-switching,
poor microphones, and multiple languages. Score word/entity accuracy,
timestamp drift, caption-break quality, latency, failure rate, and cost.

## Rendering and Billing

- Return a durable task ID immediately for every asynchronous operation.
- Use idempotency keys for generation, preview, and render requests.
- Reserve credits only after the user approves an immutable render quote.
- Settle actual usage exactly once; release reservations on failure or
  cancellation.
- A change to project version, style, output settings, or price invalidates the
  prior approval.
- Export URLs are short-lived; persistent asset identity remains server-side.

## Acceptance Gates

- Better transcript/entity accuracy than the existing Whisper baseline or
  equivalent quality with materially simpler timing support.
- No cumulative timestamp drift on the benchmark set.
- Reading-speed, line-length, transcript-fidelity, and A/V-sync QA passes.
- Sub-second local feedback for text/style changes in the editor.
- Deterministic repeat renders for an exact project version and configuration.
- Provider fallback does not mutate the transcript silently.
- Duplicate render requests cannot double-charge or create duplicate exports.
- Revoked, wrong-workspace, malformed, oversized, and prompt-injected inputs
  fail safely.
- MCP tools pass positive, negative, cancellation, retry, redaction, and cost
  approval fixtures before public listing work begins.

## Delivery Phases

### Phase 0 — Contracts and benchmark

Define schemas, provider adapters, tool contracts, security annotations, and the
representative evaluation corpus. Select the primary provider by evidence.

### Phase 1 — Agent-first vertical slice

Deliver create, generate, inspect, preview, approve, and export through MCP,
backed by the existing Remotion/FFmpeg renderer and durable tasks.

### Phase 2 — Precision UI

Add the inline project/approval card, fullscreen word/timing editor, explicit
caption positioning, presets, and project/export recovery library.

### Phase 3 — Production hardening

Complete WorkOS OAuth, revocation, idempotent billing, rate limits, audit and
redaction, retention controls, provider fallback, and acceptance fixtures.

### Phase 4 — ChatGPT plugin readiness

Add CIMD/DCR, discovery metadata, capability manifest, `llms.txt`, reviewer
fixture, starter prompts, listing assets, and submission packet. Directory
submission remains a separate explicit approval gate.

### Phase 5 — Evidence-led expansion

Consider translation, batch captioning, brand kits, reusable templates,
webhooks/API customers, teams, and extra export formats after the first workflow
is reliable and paid usage validates demand.

