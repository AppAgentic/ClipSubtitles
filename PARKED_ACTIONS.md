# Parked actions

Only items that still require Joe or a separate external/account-level approval.
Production, public DNS/TLS, WorkOS authentication, the real transcription path,
and a charged production render are live and verified as of 2026-08-31.

| # | Gate | Why it is blocked locally | Safe next action |
|---|------|---------------------------|------------------|
| 2 | **Billing-account budget alerts** | Project resources and production monitoring can be managed by the AppAgentic service account, but the Billing Budget API is disabled in the separate billing-host project and the service account has no billing-account/API authority. | From a billing administrator account, enable the Billing Budget API in the billing host and create the agreed monthly thresholds. This does not block the serving product. |
| 6 | **ChatGPT / directory submission** (Phase 4) | Submission is an explicit approval gate. Readiness artifacts live in `docs/directory/` (capability manifest, listing copy, reviewer fixture, starter prompts, submission checklist), and `https://clipsubtitles.com/llms.txt` is public. CIMD/DCR is a WorkOS setting, not code. OpenAI currently documents **Sign in with ChatGPT** as a partner rollout rather than a public self-serve identity provider, so production enablement/client details must come from OpenAI. | When Joe authorizes directory work, request Sign in with ChatGPT enablement alongside the plugin/directory review, enable/read back DCR+CIMD in WorkOS Production, run the reviewer fixture against the live MCP resource, then prepare the portal draft and stop at its submission/attestation gate. If enabled, connect it through WorkOS/AuthKit identity linking and complete the sign-in acceptance checks in `docs/directory/submission-checklist.md`; do not ship a decorative or parallel-auth button. |
| 8 | **Enable live Whop checkout** | The approved catalog, credit pools, workspace-bound checkout endpoint, signed idempotent webhook grants, web upgrade surfaces and agent resume contract are implemented. Enabling payments still requires verified AppAgentic-owned Whop resources and production secrets. | In the verified AppAgentic Whop account, create the Creator/Pro/Studio monthly products and three top-up products matching `BILLING_CATALOG`; register `/v1/billing/webhooks/whop`; put the API key and webhook secret in `mc-vault`/Secret Manager; bind all six plan IDs; set `BILLING_PROVIDER=whop`; deploy; then run a real low-value checkout, duplicate-webhook, cancellation and agent-resume acceptance test. Complete legal review of `/terms` and `/privacy` before accepting money. |
| 9 | **Deploy the direct URL and customer-copy cutover** | The verified cutover is isolated on `goal/prelaunch-ux-cutover`; the live environment was intentionally not changed during this goal run. There are no active users requiring compatibility redirects. | After reviewing the branch, approve deployment of `/` as the public landing page, `/app` as the product home, and `/studio/:id` as the editor. |
| 10 | **Approve the Design 1 implementation pass** | Direction 1 is selected and its refined dashboard, agent-connections screen, and ChatGPT plugin states are preserved in `docs/design/dashboard-concepts/design-1-exploration/`. The remaining choice is whether the visual family is ready to become the responsive product UI. | Review the high-resolution studies; once approved, translate the selected hierarchy into responsive wireframes and implement it without copying invented values or unsupported image text. |

## Residual notes (not gates)

- The provider-order benchmark is resolved: two preserved runs over six real product voice
  clips selected Scribe v2 primary over Gemini 3.5 fallback (3.99% vs 12.18%
  pooled WER), and a blinded same-render comparison selected Scribe in both
  presentation orders. The direct ElevenLabs key now exists in `mc-vault`.
  Remaining coverage work is a talking-head clip with audited word times plus
  multilingual, noisy/music and multi-speaker cases; it does not block the
  private staging canary. Direct local Scribe v2 requests return timed words;
  Gemini 3.5 Transcribe fallback is also proven end to end.
  A second least-privilege key was created and deployed as Secret Manager v4;
  forced task `task_01m1adkv8jh9f9hgc8saatphhc` failed once with the same 401,
  while a local v4 adapter smoke returned valid Scribe v2 word timings. The
  ElevenLabs request log independently records the Cloud Run request at
  2026-08-30 23:46:05 UTC+1 as POST `/v1/speech-to-text`, HTTP 401. The exposed
  intermediate key/version are disabled; the original key remains enabled only
  as rollback during final provider acceptance. A follow-up isolated
  Cloud Run diagnostic captured only allowlisted status/code/trace metadata and
  confirmed HTTP 401 `detected_unusual_activity` with trace
  `8e11eb5dce359fefbe13e6e440bf18b6`. After the workspace was upgraded to
  Starter, the identical Cloud Run diagnostic returned HTTP 200 with no
  provider error (trace `8258fe9e4ce516ad35eb328cb8965534`). Both temporary
  diagnostic jobs were deleted immediately after readback. This resolves the
  deployed Scribe origin gate. Forced task
  `task_01m1am1kzyx2t84pymsbb8kzer` then processed the retained 31.77-second
  real-user staging clip through the normal private worker in one attempt. It
  stored 35 native `scribe_v2` words with valid monotonic timings, no fallback,
  and a 653 ms provider call. The temporary acceptance job was deleted and all
  three staging services remained Ready.
- Private staging is operational: API, web, and worker revisions are Ready;
  API/web use the Cloud Run invoker-IAM-check disable supported under the
  organisation's domain-restricted-sharing policy; the worker accepts only the
  Cloud Tasks and maintenance identities. Real browser upload, WorkOS sign-in,
  caption generation/edit persistence, preview, fixed quote, final render,
  downloads, cancellation, idempotency and a four-way preview burst passed. A
  manually triggered maintenance job reached the internal worker with HTTP 200.
  Keep this environment scaled to zero when idle; Cloud SQL is the remaining
  always-on staging cost unless staging is deliberately torn down and recreated.
- Production is operational on `clipsubtitles.com` and `api.clipsubtitles.com`.
  The global HTTPS edge, Google-managed certificate, Cloud Run services, Cloud
  Tasks worker, Cloud SQL, private R2 storage, retention maintenance job and
  environment-scoped WorkOS Production configuration are live. A real signed-in
  journey imported 10.8 seconds of speech, transcribed it with Scribe v2, saved
  a word edit and style revision, rendered a preview, approved a fixed two-credit
  MP4+SRT quote, and downloaded hash-matching outputs. See
  `docs/production-acceptance-2026-08-31.md`.
- Retired gate 5 is resolved locally: Chrome Headless Shell was installed into the git-ignored Remotion cache and `pnpm smoke:render:remotion` passed (360×640 preview MP4, ProRes 4444 overlay MOV, and SRT). The default production renderer is cropped-band Skia + FFmpeg, whose exact linux/amd64 image canary now verifies FFmpeg/ffprobe, x264/ProRes, Skia PNG output, writable scratch space, and all six bundled Inter font files. Remotion remains optional and is not included in the economical default runtime image.
- A Discord worker-status post was attempted once at the start of this job (per machine-level defaults) and returned `HTTP 401 … FAILED to create worker status thread`; per your instruction no further posts or corrections were sent. It is very likely nothing was posted, but that could not be verified.
- The Chrome MCP tab in this session rendered an error page for `localhost`/`127.0.0.1` (extension-side), so the visual pass relied on your agent-browser findings, the production build, and the API/MCP conformance suites.
