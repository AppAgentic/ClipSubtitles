# Staging acceptance — 2026-08-30

## Verdict

Private staging passes the complete customer workflow and the tested security,
durability, cancellation, idempotency, retention, and horizontal-scale checks.
The Cloud Run-only ElevenLabs 401 was resolved by upgrading the workspace to
Starter and rerunning the identical diagnostic successfully. Public production
remains a **no-go** until the production-only infrastructure, identity, billing,
DNS, monitoring, quota, and broader media/provider acceptance gates in
`PARKED_ACTIONS.md` are completed. Production was not mutated by this run.

## Environment and provenance

- GCP project: `clipsubtitles-staging` (AppAgentic company context)
- Region: `europe-west2`
- Public reviewer surfaces: staging web and API only
- Private surface: worker, invoked only by Cloud Tasks and the maintenance
  scheduler identities
- Database: Cloud SQL PostgreSQL
- Media: private Cloudflare R2 bucket with exact-origin CORS
- R2 lifecycle: abandoned `staging/` uploads expire after one day; application
  records expose seven-day export and 30-day source retention
- WorkOS: staging AuthKit callback and signed webhook endpoint
- Release branch: `release/staging-readiness`
- Acceptance image lineage: `87b577a` for the completed customer render;
  `eb7d445` for sanitized provider diagnostics; `152d403` pins provider secret
  versions and fixes exhausted-chain retry semantics; `8e12e0d` hardens
  production auth, MCP audience binding, lease recovery, and cancellation ownership.
- Final gated image tag: `292054a`; staging revisions API `00008-p7h`, web
  `00007-hvf`, worker `00009-tlr`.

## Customer journey (1–5)

### 1. Sign in and upload

- A dedicated verified reviewer signed in through hosted WorkOS AuthKit.
- The library loaded a personal workspace with the beta credit grant.
- A 31.77-second H.264/AAC vertical MP4 containing intelligible speech was
  uploaded directly from the browser to R2.
- The R2 response returned the exact staging web CORS origin and the one-day
  abandoned-upload expiration.
- Upload completion created one durable finalize task and returned the ready
  media asset in 1.18 seconds.

### 2. Generate, edit, and persist captions

- Gemini 3.5 Transcribe produced 34 provider-native timed words in the deployed
  fallback path after the Scribe attempt failed; provider/model provenance is
  stored on the revision.
- The reviewer selected `submagic-pop`, corrected `Clips Subtitles` to
  `ClipSubtitles`, deleted the duplicate word, and reloaded the editor.
- The correction, deletion, style, project version, and content hash persisted.
- The deterministic tone-burst corpus was rejected as live-ASR evidence and
  replaced with intelligible speech before this acceptance result was recorded.

### 3. Preview and approve a fixed quote

- An eight-second 480p preview rendered in 4.13 seconds.
- The reviewer selected MP4, transparent overlay, SRT, and WebVTT at 1080p/30.
- The immutable quote pinned project version 4, content hash
  `be42bd0669735ccb0460d629206aaa3920bd13779ae93a91ac93c37781fd075d`,
  settings, output list, price version, and an 11-credit total.
- Approval reserved credits once and started one durable render task.

### 4. Render and verify outputs

- Task `task_01m1a5r29py5k0tnwpzbbvqaqz` succeeded in one attempt.
- Wall time was 150.15 seconds for a 31.77-second master plus four outputs; the
  ProRes alpha overlay was the dominant stage.
- MP4: 17,212,831 bytes, H.264/AAC, 1080×1920, 31.7667 seconds,
  SHA-256 `306164d819e8738faf5ad5a41b984d465fc0dc7428088933e201e27748895e31`.
- Overlay: 87,430,397 bytes, ProRes `yuva444p12le`, 1080×1920,
  SHA-256 `955640a55ee3423b446381d4e0ab3fa8873b538fd3296e931332a16974145288`.
- SRT: 551 bytes, SHA-256
  `ff2f76bc5f3a32982c20b47a71a9e73ce7aec5bfc230b99ca06ee9185a5404a8`.
- WebVTT: 559 bytes, SHA-256
  `c1817b3c386cee01ae21528d1512b13894dbff2dba5b5f7b587b33a897486974`.
- Every downloaded byte hash matched its stored export record. The overlay has
  a real alpha channel and the subtitle files contain the persisted correction.

### 5. Recovery, security, scale, and lifecycle

- Unauthenticated API access: 401.
- Invalid WorkOS signature: 401; correctly signed webhook: 200; correctly signed
  but stale webhook: 401.
- Oversize upload: 413; unsupported media type: 400; signed-length mismatch was
  rejected before completion.
- Five simultaneous preview requests were submitted. Four succeeded once across
  three Cloud Run instances; the fifth was cancelled before execution. The
  queue and worker maximum concurrency are both four, with one render request
  per worker instance.
- Replaying the same preview idempotency key returned the same task id.
- Replaying the approved render returned the original task and left the balance
  at 489 credits. Reusing the same key with a changed cost returned 409
  `IDEMPOTENCY_KEY_REUSED`.
- A manually triggered OIDC Cloud Scheduler maintenance request reached the
  private worker and returned 200 in 0.50 seconds.
- A forced provider failure exercised the three-attempt legacy retry path. The
  discovered bug that requeued permanent 401 responses is fixed and regression
  tested so permanent failures terminate once while transient failures remain
  retryable. The successful final render charged once and left no reserved credits.
- On the final image, forced task `task_01m1a8937br7c85qsmakp988mq`
  terminated after exactly one 401 attempt with `retryable: false`; normal-chain
  task `task_01m1a89kzpz25k9nenkce8s6nt` then succeeded in one attempt through
  Gemini fallback with 34 words and stored `fallbackFrom: elevenlabs`.
- A newly created Speech-to-Text-only replacement key was then bound as Secret
  Manager version 4 to worker revision `clipsubtitles-staging-worker-00010-mdl`.
  Forced task `task_01m1adkv8jh9f9hgc8saatphhc` still terminated after one
  401 attempt (`retryable: false`; worker-observed latency 270 ms). The same v4
  secret succeeded through the direct local adapter with valid Scribe v2 word
  timings. ElevenLabs' own request log records the matching Cloud Run POST at
  23:46:05 UTC+1 as HTTP 401, so rotation did not repair the deployed-origin
  authorization failure. Terraform returned `No changes` after the rollout.
- A staging-only allowlisted diagnostic then resolved the remaining ambiguity:
  an isolated Cloud Run request using the same v4 key and worker service account
  returned HTTP 401 with provider code `detected_unusual_activity` and trace
  `8e11eb5dce359fefbe13e6e440bf18b6`. The probe retained no response message or
  body, credential, audio, or transcript, and its temporary Cloud Run job was
  deleted after readback. This confirms ElevenLabs' Free-tier shared/datacenter
  IP abuse detector is the deployed-origin blocker.
- After the ElevenLabs workspace was upgraded to Starter, the identical
  isolated Cloud Run request returned HTTP 200 with no provider error (trace
  `8258fe9e4ce516ad35eb328cb8965534`). The one-second in-memory tone correctly
  produced zero spoken words; this canary proves authorization and provider
  reachability, not transcription quality. The temporary job was deleted after
  readback and all three staging services remained Ready.
- Forced task `task_01m1am1kzyx2t84pymsbb8kzer` then regenerated the retained
  31.77-second real-user staging clip through the normal private worker. It
  succeeded in one attempt, selected `elevenlabs` / `scribe_v2`, stored 35
  provider-native words with valid monotonic start/end timings, recorded no
  fallback, and measured a 653 ms provider call. The resulting first word began
  at 119 ms and the final spoken word ended at 13,319 ms, both within the source
  duration. The temporary database-scoped acceptance job was deleted after
  readback and all three staging services remained Ready.

## Transcription provider boundary

- Both the original and replacement ElevenLabs secret versions succeed from
  the operator environment with provider-native timed words.
- Before the Starter upgrade, both explicitly pinned secret versions on Cloud
  Run returned a sanitized HTTP 401 in roughly 0.25 seconds. Secret trimming,
  fingerprint comparison,
  revision readback, explicit version pinning, and a clean key rotation rule
  out stale secret bytes or a defective individual key.
- Gemini 3.5 Transcribe fallback is proven through the full deployed browser
  flow and produced the accepted render.
- Scribe remains the intended primary based on the audio benchmark. Its Cloud
  Run authorization and real spoken-clip execution are now proven on Starter
  through the deployed worker, with stored provider/model provenance and native
  word timings.

## Automated and infrastructure gates

- `pnpm check`: 44 test files passed and one skipped; 262 tests passed and 15
  were explicitly skipped. Lint, TypeScript, and every production build pass.
  Cloud Build now runs this same FFmpeg-capable Linux gate before it can build
  or publish images.
  TypeScript, lint, and the production Next/server builds passed.
- Terraform formatting and validation passed.
- Every applied Terraform plan was saved and inspected before apply; the public
  staging change was zero-destroy, and the provider roll was zero-destroy.
- API and web use the Cloud Run invoker-IAM-check disable supported under the
  organisation's domain-restricted-sharing policy. The worker remains private.
- R2 CORS and lifecycle policies were applied through a least-privilege,
  non-printing Mission Control command and read back semantically.
- Production fails closed unless WorkOS auth is selected. WorkOS MCP access
  tokens are audience-bound to the advertised MCP resource. Cloud Run push
  workers opportunistically reclaim expired leases, platform shutdown is no
  longer misclassified as user cancellation, and credits are released only
  after the cancelling worker proves lease ownership.

## Independent review reconciliation

Claude Code independently reviewed the release branch. Its strongest current
findings were implemented: pre-image CI, fail-closed production auth, MCP token
audience binding, secret whitespace normalization, deterministic provider
secret versions, push-worker lease maintenance, shutdown-safe task state, and
cancellation/billing ownership. Several review claims were stale and were
rejected against live evidence: staging now has real WorkOS sign-in and signed
webhooks, PostgreSQL application transactions, R2 upload/downloads, Cloud Tasks
dispatch, Linux rendering, signed exports, lifecycle policy, and a complete
real-user video journey. Unbounded scale, cross-architecture byte identity,
and broad media/provider quality remain appropriately unclaimed.

## Evidence boundaries

This run proves a real single-user journey and a bounded four-way preview burst;
it is not a 500-job soak, a provider-quota certification, a 2/4/8-vCPU renderer
bake-off, or a claim about multilingual/noisy/music/multi-speaker accuracy. The
talking-head audited timing set and codec torture corpus remain necessary before
public accuracy or universal-media claims. Billing purchases, production WorkOS,
public DNS/TLS, alerting/budgets, support operations, and directory submissions
were intentionally untouched.
