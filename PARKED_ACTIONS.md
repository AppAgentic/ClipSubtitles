# Parked actions

Only items that still require Joe, a public cutover, or an external provider
change. Private staging is provisioned and verified; production, public DNS,
directory submissions, and billing remain untouched.

| # | Gate | Why it is blocked locally | Safe next action |
|---|------|---------------------------|------------------|
| 1 | **Resolve deployed Scribe authorization or approve provider reordering** | The pinned ElevenLabs key and adapter return 35 timed words locally, but the same explicit secret version receives HTTP 401 from Cloud Run. Gemini fallback works end to end, but silently relying on fallback would contradict the benchmark-selected primary order. | Ask ElevenLabs to confirm whether the API key/account restricts Google Cloud/datacenter requests, rotate or scope a production-capable server key, and rerun a forced Cloud Run canary. If that cannot be resolved, make an explicit product decision to use Gemini primary or the previously benchmarked partner route and rerun cost/quality acceptance. |
| 2 | **Production WorkOS/AuthKit + OAuth clients** | Staging browser sign-in, logout, valid/invalid/stale webhooks and session revocation are proven. Production must use a separate WorkOS environment and production-only secrets. Agent clients also require their exact redirect URIs. | Create the production WorkOS environment, add the production callback/logout/webhook URLs, store new secrets non-printingly, register one predefined client per approved beta surface, and rerun the auth acceptance matrix before public cutover. Keep CIMD/DCR disabled until directory approval. |
| 3 | **Production infrastructure, R2, DNS, and TLS** | Staging is live and its exact-origin R2 CORS plus abandoned-upload lifecycle are verified. Production resources, production R2 credentials/policies, public DNS, alerting/budgets, provider quotas, and the 500-job soak are intentionally absent. | Create an isolated production project/environment; promote immutable image digests; provision production-only secrets and R2 policy; add monitoring/budgets; run the codec/provider quota soak; inspect a zero-destroy plan; then point `clipsubtitles.com` and `api.clipsubtitles.com` at the verified services. |
| 6 | **ChatGPT / directory submission** (Phase 4) | Submission is an explicit approval gate. Readiness artifacts live in `docs/directory/` (capability manifest, listing copy, reviewer fixture, starter prompts, submission checklist). CIMD/DCR is a WorkOS setting, not code. | After the WorkOS, predefined-client, and private-staging gates pass: enable DCR/CIMD on the WorkOS client, publish `https://clipsubtitles.com/llms.txt`, run the reviewer fixture end to end, then submit through the directory console. |
| 8 | **Credit purchases / real billing** | v1 grants beta credits on first sign-in (`INITIAL_CREDIT_GRANT`). Purchasing credits needs a payment provider decision. | Decide the provider; add a `grant` ledger entry from a verified webhook (the ledger already enforces idempotent grants). |

## Residual notes (not gates)

- The provider-order benchmark is resolved: two preserved runs over six real product voice
  clips selected Scribe v2 primary over Gemini 3.5 fallback (3.99% vs 12.18%
  pooled WER), and a blinded same-render comparison selected Scribe in both
  presentation orders. The direct ElevenLabs key now exists in `mc-vault`.
  Remaining coverage work is a talking-head clip with audited word times plus
  multilingual, noisy/music and multi-speaker cases; it does not block the
  private staging canary. Direct local Scribe v2 requests return timed words;
  the deployed worker's forced-Scribe smoke is now isolated to an HTTP 401 and
  is tracked as gate 1 while Gemini 3.5 Transcribe fallback is proven end to end.
- Private staging is operational: API, web, and worker revisions are Ready;
  API/web use the Cloud Run invoker-IAM-check disable supported under the
  organisation's domain-restricted-sharing policy; the worker accepts only the
  Cloud Tasks and maintenance identities. Real browser upload, WorkOS sign-in,
  caption generation/edit persistence, preview, fixed quote, final render,
  downloads, cancellation, idempotency and a four-way preview burst passed. A
  manually triggered maintenance job reached the internal worker with HTTP 200.
  Keep this environment scaled to zero when idle; Cloud SQL is the remaining
  always-on staging cost unless staging is deliberately torn down and recreated.
- Retired gate 5 is resolved locally: Chrome Headless Shell was installed into the git-ignored Remotion cache and `pnpm smoke:render:remotion` passed (360×640 preview MP4, ProRes 4444 overlay MOV, and SRT). The default production renderer is cropped-band Skia + FFmpeg, whose exact linux/amd64 image canary now verifies FFmpeg/ffprobe, x264/ProRes, Skia PNG output, writable scratch space, and all six bundled Inter font files. Remotion remains optional and is not included in the economical default runtime image.
- A Discord worker-status post was attempted once at the start of this job (per machine-level defaults) and returned `HTTP 401 … FAILED to create worker status thread`; per your instruction no further posts or corrections were sent. It is very likely nothing was posted, but that could not be verified.
- The Chrome MCP tab in this session rendered an error page for `localhost`/`127.0.0.1` (extension-side), so the visual pass relied on your agent-browser findings, the production build, and the API/MCP conformance suites.
