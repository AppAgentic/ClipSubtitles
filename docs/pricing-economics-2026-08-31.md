# ClipSubtitles pricing and economics proposal — 2026-08-31

This is a launch proposal, not a live catalog. No checkout products or prices
exist yet. The current production beta grants credits at sign-in and already
has deterministic render quotes plus an idempotent reserve/settle/release
ledger.

## Current product truth

- Standard 1080p MP4: 10 credits per billable video minute.
- Standard 1080p transparent overlay: 8 credits per billable video minute.
- SRT and VTT: no additional credits.
- High quality: 1.5× the relevant video-output credits.
- Minimum paid render: 2 credits.
- Preview: free but rate-limited.
- Beta sign-in grant: 500 credits. This is appropriate for a private beta, but
  is too large for an ungated public Free plan: it represents about 50 minutes
  of standard 1080p MP4 output.
- Credit purchasing, subscriptions, checkout and webhook grants are not yet
  implemented.

Credits should remain the internal accounting unit. Customer-facing plan copy
should lead with approximate captioned-video minutes and explain that overlays,
multiple video outputs and high-quality rendering use more of the allowance.

## Variable cost envelope

The direct measured/provider inputs support an indicative COGS envelope rather
than a final audited number:

| Component | Evidence | Indicative unit cost |
| --- | --- | ---: |
| Direct Scribe v2 transcription | ElevenLabs lists $0.22/hour; the internal canary estimated the same direct route | $0.0037/video minute |
| MP4 + transparent overlay render compute | 31.77-second 1080p production-shaped staging render took 150.15 worker seconds; worker is 4 vCPU/8 GiB | about $0.025/video minute at published Cloud Run default rates |
| R2 storage/delivery | Internal 100k-job model with direct upload and current retention | about $0.0044/job |
| Queue, API, DB operations, retries and failed work | Not yet measured as a customer cohort | allowance required |

Use **$0.03 per standard 1080p MP4-equivalent minute** as the base planning
case and **$0.06** as the downside case until production telemetry separates
MP4-only, overlay, quality, resolution, retry and cold-start costs. The existing
credit weights make expensive overlay and multi-output work consume more of a
plan allowance.

This envelope excludes fixed Cloud SQL/monitoring costs, support and payroll,
tax borne by the seller, refunds, discounts and marketplace fees. It assumes a
generic card-processing placeholder of 2.9% + $0.30 only for the plan table
below; the chosen payment provider must replace that assumption.

## Current competitor frame

Observed from official pricing/help pages on 2026-08-31:

| Product | Customer model | Relevant price/allowance |
| --- | --- | --- |
| ZapCap | Web subscription plus separately purchased API usage | $8/$16/$32 per month billed annually for Starter/Pro/Agency+; API access requires Pro+ and rendered video is $0.10/minute |
| Submagic | Per-video creator subscriptions | $19 for 15 videos, $39 for 40, $69 for up to 100; duration and API allowances rise by tier |
| Kapwing | Broad editor subscription with pooled AI credits | $24 monthly Pro with up to 1,000 auto-subtitle minutes; $64 monthly Business with up to 4,000 minutes |
| Captions | Mobile-first broad AI video subscription | Max $24.99/month; Scale starts at $69.99/month with larger credit pools |
| Descript | Per-editor broad editing subscription | Creator $15 monthly with 10 transcription hours; Pro $30 monthly with 30 hours |
| VEED Subtitle API | Pure usage API | from $0.10/minute for basic styles and $0.20/minute for dynamic styles at up to 1080p, with a one-minute minimum |

The useful position is not "cheapest transcription." Kapwing and Descript can
bundle very large transcription allowances because they sell broad editors,
while ZapCap and VEED establish a clearer $0.10–$0.20/minute API reference for
finished styled video. ClipSubtitles can charge for the finished, editable,
agent-operable workflow: word correction, real style previews, deterministic
outputs, exact quotes and safe automation.

## Recommended launch catalog

All prices are proposed USD prices before tax. All paid plans include browser
use and connected-agent use; the product should not punish the agent-first path
with a separate price.

| Plan | Price | Included credits | Plain-language equivalent | Product boundary |
| --- | ---: | ---: | --- | --- |
| Free | $0 | 20 lifetime | about 2 minutes of standard 1080p MP4 | One real end-to-end test, free previews and editing; hard cap before provider work |
| Creator | $12/month | 600/month | up to 60 standard MP4 minutes | Browser + connected agents, all core styles/exports, one active render |
| Pro | $29/month | 2,000/month | up to 200 standard MP4 minutes | Creator plus API keys/webhooks, higher concurrency and priority processing |
| Studio | $79/month | 6,000/month | up to 600 standard MP4 minutes | Pro plus team/brand controls and four active renders when those capabilities ship |

Offer annual billing at roughly 15% off after monthly conversion is understood.
Do not launch an unlimited plan. Cap subscription-credit rollover at 2× the
monthly allowance; keep purchased credits in a separate non-expiring pool and
spend expiring subscription credits first.

Recommended top-ups:

| Pack | Price | Credits | Standard MP4 equivalent |
| --- | ---: | ---: | ---: |
| Small | $8 | 300 | about 30 minutes |
| Medium | $20 | 1,000 | about 100 minutes |
| Large | $50 | 3,000 | about 300 minutes |

There should be no automatic unbounded overage. A user either has credits,
buys a pack, or upgrades. Enterprise/dedicated-capacity pricing comes only
after measured sustained usage and support requirements.

### Full-utilization contribution check

This deliberately stresses every included credit as standard MP4-equivalent
usage. Net revenue uses the placeholder 2.9% + $0.30 processing fee.

| Plan | Net revenue | Base COGS ($0.03/min) | Base contribution margin | Downside COGS ($0.06/min) | Downside contribution margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Creator | $11.35 | $1.80 | 79.6% | $3.60 | 64.6% |
| Pro | $27.86 | $6.00 | 75.4% | $12.00 | 54.7% |
| Studio | $76.41 | $18.00 | 73.9% | $36.00 | 51.2% |

The downside Studio margin is the launch warning. Keep the allowance and four
render concurrency behind telemetry, and change either the price, allowance or
credit weights if P90 cost approaches the downside case. Fixed infrastructure
must be tracked separately; at low customer counts it will dominate total
profit despite healthy variable margins.

## One catalog, two upgrade experiences

The account, workspace, entitlements and credit pools must be identical across
the website, ChatGPT, Claude, Codex and other MCP clients. Prices must never
differ by surface.

### Website

1. Show the exact render quote before the paid action.
2. If balance is short, replace the disabled export dead end with a compact
   plan/top-up chooser that shows the shortfall in minutes and credits.
3. Create a server-side, workspace-bound hosted checkout.
4. A signed webhook grants subscription or purchased credits exactly once.
5. The confirmation route waits for the entitlement readback and resumes the
   existing quote when it is still valid; otherwise it creates a fresh quote.
6. Existing subscribers go to subscription management, not another checkout.

### Agent or agent platform

1. The agent may prepare the project, captions, edits, style and immutable
   render quote without spending credits.
2. If the workspace cannot cover the approved quote, return a structured
   `checkout_required` result, not only `INSUFFICIENT_CREDITS`:
   current balance, shortfall, quote expiry, plan/top-up choices and an
   app-owned URL such as
   `/pricing?workspace=...&source=chatgpt&resume=...`.
3. Preserve the project, quote and original intent through sign-in and hosted
   checkout. Never expose a raw payment-provider link from the tool result.
4. After the signed webhook updates the ledger, tell the user to return to the
   agent and offer **Resume export**.
5. Retry the same request with the same idempotency key. If the quote expired
   or the project changed, issue a fresh quote and ask for approval again.
6. Never collect new card details inside an agent widget and never turn a plan
   upgrade into approval to spend on a render.

Official OpenAI plugin documentation currently says developers choose their
monetization, recommends merchant-hosted external checkout as the generally
available route, and limits the ChatGPT payment sheet to selected partners in
private beta. It does not establish generally available embedded checkout for
this digital SaaS. ClipSubtitles should therefore use its own hosted pricing and
checkout flow and re-check directory policy before submission.

## Implementation sequence

1. Add a server-owned, versioned plan/top-up catalog separate from the existing
   render `PRICE_TABLE`; use both for enforcement, UI and tests.
2. Reduce the public Free state from the 500-credit beta grant to 20 lifetime
   credits, while preserving explicitly granted beta/admin credits as their own
   pool.
3. Add subscription and purchased-credit pools, rollover rules, entitlements,
   concurrency limits and immutable billing events.
4. Add server-side checkout creation plus signed, idempotent webhook grants.
5. Add `/pricing`, billing management and the web insufficient-balance chooser.
6. Extend MCP output with `checkout_required`, the app-owned resume URL and a
   responsive upgrade card.
7. Test no-credit → checkout → webhook → resume end to end in web and ChatGPT;
   cover duplicate/out-of-order webhooks, checkout cancellation, stale quotes,
   retries and refunds.
8. Instrument cost and funnel events: transcribed minutes, render seconds by
   output/resolution/quality, worker vCPU/GiB seconds, bytes stored/delivered,
   retries, checkout starts, paid conversions, retained paid usage and refunds.

Do not scale paid acquisition until this telemetry yields retained-paid cohorts
and a real blended CAC/payback model. A reasonable first gate is a small
high-intent creator/API test only after checkout and the resumable agent loop are
proven.

## Sources

- ElevenLabs API pricing: https://elevenlabs.io/pricing/api?price.section=speech_to_text
- Cloud Run pricing: https://cloud.google.com/run/pricing
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- ZapCap web pricing: https://app.zapcap.ai/pricing
- ZapCap API billing: https://platform.zapcap.ai/docs/billing/
- Submagic pricing: https://www.submagic.co/pricing
- Kapwing pricing: https://www.kapwing.com/pricing
- Captions pricing: https://captions.ai/pricing
- Descript pricing: https://www.descript.com/price
- VEED Subtitle API pricing: https://support.veed.io/en/articles/15230204-veed-subtitles-api
- OpenAI plugin checkout guidance: https://developers.openai.com/plugins/build/monetization

