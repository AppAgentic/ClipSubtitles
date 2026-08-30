# Parked actions

Only items that still require Joe, a public cutover, or an external provider
change. Private staging is provisioned and verified; production, public DNS,
directory submissions, and billing remain untouched.

| # | Gate | Why it is blocked locally | Safe next action |
|---|------|---------------------------|------------------|
| 2 | **Public WorkOS/AuthKit wiring** (identity + OAuth authority) | A dedicated staging WorkOS project/app, AuthKit domain, client id, issuer, and API key now exist in Secret Manager. The private Cloud Run services cannot yet receive a browser redirect or WorkOS webhook, so public sign-in, webhook verification, and Connect OAuth have not been exercised. | When a public preview is approved, add the exact staging callback/logout URLs, create the webhook and replace the placeholder webhook-secret version, then smoke browser sign-in, logout, webhook revocation, and MCP OAuth. Configure the production WorkOS environment separately at launch. |
| 3 | **Predefined OAuth client for private beta** (ChatGPT / Claude / Codex testing) | Requires the WorkOS tenant above plus the clients' redirect URIs. | Register one AuthKit OAuth client per tester surface; keep CIMD/DCR disabled until directory readiness. |
| 4 | **R2 browser policy + production promotion** | Private staging is live in the dedicated `clipsubtitles-staging` GCP project with Cloud Run, Cloud SQL, Tasks, Scheduler, Secret Manager, Artifact Registry, and a bucket-scoped R2 runtime key. The runtime key correctly cannot administer bucket CORS/lifecycle. Production is intentionally not created. | Through the Cloudflare admin lane, apply and read back the exact-origin CORS policy and one-day `staging/` lifecycle rule. Before launch, create an isolated production project/environment, promote immutable image digests, provision fresh production-only secrets, and review a zero-destroy Terraform plan. Benchmark worker CPU/RSS before increasing concurrency above 1. |
| 6 | **ChatGPT / directory submission** (Phase 4) | Submission is an explicit approval gate. Readiness artifacts live in `docs/directory/` (capability manifest, listing copy, reviewer fixture, starter prompts, submission checklist). CIMD/DCR is a WorkOS setting, not code. | After the WorkOS, predefined-client, and private-staging gates pass: enable DCR/CIMD on the WorkOS client, publish `https://clipsubtitles.com/llms.txt`, run the reviewer fixture end to end, then submit through the directory console. |
| 7 | **DNS + TLS for `clipsubtitles.com` / `api.clipsubtitles.com`** | `clipsubtitles.com` was registered on 2026-08-29 with auto-renew, registrar lock, and privacy redaction. DNS and Cloud Run certificates remain unchanged. | After staging services pass, point the site/API records at their verified service endpoints and set `API_PUBLIC_URL`/`WEB_PUBLIC_URL` accordingly (signed URLs and OAuth metadata derive from them). |
| 8 | **Credit purchases / real billing** | v1 grants beta credits on first sign-in (`INITIAL_CREDIT_GRANT`). Purchasing credits needs a payment provider decision. | Decide the provider; add a `grant` ledger entry from a verified webhook (the ledger already enforces idempotent grants). |

## Residual notes (not gates)

- Retired gate 1 is resolved: two preserved runs over six real product voice
  clips selected Scribe v2 primary over Gemini 3.5 fallback (3.99% vs 12.18%
  pooled WER), and a blinded same-render comparison selected Scribe in both
  presentation orders. The direct ElevenLabs key now exists in `mc-vault`.
  Remaining coverage work is a talking-head clip with audited word times plus
  multilingual, noisy/music and multi-speaker cases; it does not block the
  private staging canary. A direct Scribe v2 request also passed against the
  live API with timed words, confirming the deployed credential/provider path.
- Private staging is operational: API, web, and worker revisions are Ready;
  API/web have no `allUsers` invoker binding; the worker accepts only the Cloud
  Tasks and maintenance identities; authenticated metadata checks pass; and a
  manually triggered maintenance job reached the internal worker with HTTP 200.
  Terraform now refreshes to `No changes`. Keep this environment scaled to zero
  when idle; Cloud SQL is the remaining always-on staging cost unless staging is
  deliberately torn down and recreated.
- Retired gate 5 is resolved locally: Chrome Headless Shell was installed into the git-ignored Remotion cache and `pnpm smoke:render:remotion` passed (360×640 preview MP4, ProRes 4444 overlay MOV, and SRT). The default production renderer is cropped-band Skia + FFmpeg, whose exact linux/amd64 image canary now verifies FFmpeg/ffprobe, x264/ProRes, Skia PNG output, writable scratch space, and all six bundled Inter font files. Remotion remains optional and is not included in the economical default runtime image.
- A Discord worker-status post was attempted once at the start of this job (per machine-level defaults) and returned `HTTP 401 … FAILED to create worker status thread`; per your instruction no further posts or corrections were sent. It is very likely nothing was posted, but that could not be verified.
- The Chrome MCP tab in this session rendered an error page for `localhost`/`127.0.0.1` (extension-side), so the visual pass relied on your agent-browser findings, the production build, and the API/MCP conformance suites.
