# Production acceptance — 2026-08-31

## Outcome

ClipSubtitles is serving publicly over Google-managed TLS at:

- `https://clipsubtitles.com`
- `https://api.clipsubtitles.com`

The production deployment uses the immutable release tag `a872ccc`. The final
Terraform validation passed and the live refresh produced `No changes`.

## Infrastructure evidence

- GCP project: `clipsubtitles-production` (`europe-west2` workloads)
- Global HTTPS address: `34.160.184.219`
- Google-managed certificate: active for the apex and API hostnames
- Web and API: public Cloud Run services behind regional serverless NEGs
- Worker: private Cloud Run service invoked by Cloud Tasks and Scheduler identities
- Database: Cloud SQL PostgreSQL 17 with backups, PITR and deletion protection
- Media: private R2 object storage plus lifecycle/retention maintenance
- Daily maintenance: Scheduler job at 03:17 UTC; authenticated invocation returned 200
- Auth: isolated WorkOS Production environment with Magic Auth, production redirects,
  webhook events and the explicit display name `ClipSubtitles`

Public smoke checks returned 200 for the web app, `llms.txt`, OpenAPI and OAuth
metadata. An unauthenticated `/v1/me` request returned the expected 401.

## Real user journey

The acceptance run used a 10.8-second, 720×1280 H.264/AAC speech fixture. It was
passed to the signed-in production UI through a short-lived signed URL from a
private GCS object; the source was never made public.

1. Signed in as `joe@appagentic.dev` through WorkOS Magic Auth.
2. Created project `proj_01m1b2zn02c2qwz6ben8rdmkrj` and completed the durable import task.
3. Generated nine caption pages through ElevenLabs Scribe v2.
4. Removed an incorrect comma; the UI persisted a new immutable transcript revision.
5. Applied `submagic-pop`, lower-third positioning and `Spring` motion.
6. Rendered the eight-second preview successfully.
7. Requested an immutable quote for 1080p MP4 + SRT: 0.18 billable minutes, two credits.
8. Approved the quote; two credits were reserved and charged once after success.
9. Downloaded and verified the final outputs.

## Output verification

| Output | Size | SHA-256 | Verification |
| --- | ---: | --- | --- |
| `captions-v5.mp4` | 458,768 bytes | `ef03fc2989fb0e9321c8b4ae8d09978210e9e0ba37c6d563ca0290dd10c15065` | H.264 + AAC, 1080×1920, 10.800 seconds |
| `captions-v5.srt` | 460 bytes | `4573c1f335b69e9e3a754b8fde1e96089b5263c079c700d2143df4532a45455a` | Matches the production export readback |

The hashes returned by the product matched independent hashes of the downloaded
bytes. The render task was `task_01m1b37gpdhrd5rt79ztt23h1n` and reached
`succeeded` in the production UI.

## Remaining external gate

Billing-account budget alerts require a billing administrator to enable the
Billing Budget API in the separate billing-host project and grant/create the
budget. Directory submission and real credit purchasing remain separate product
decisions; neither blocks the live beta service.
