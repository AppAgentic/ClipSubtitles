# ClipSubtitles pricing and economics proposal — 2026-08-31

This document records the approved launch catalog and the economics behind it.
The versioned catalog, lifetime Free allowance, pooled credit ledger, hosted
checkout contract, signed idempotent webhook processing, web pricing surfaces,
and agent `checkout_required` response are implemented in code. Live Whop
products and production secrets remain an external launch gate; see
`PARKED_ACTIONS.md`.

## Current product truth

- Standard 1080p MP4: 10 credits per billable video minute.
- Standard 1080p transparent overlay: 8 credits per billable video minute.
- SRT and VTT: no additional credits.
- High quality: 1.5× the relevant video-output credits.
- Minimum paid render: 2 credits.
- Preview: free but rate-limited.
- Public sign-in grant: 10 lifetime credits, approximately one standard 1080p
  MP4 minute. Explicit beta/admin grants remain isolated in their own pool.
- Credit purchasing, subscriptions, checkout and webhook grants are implemented
  behind the config-gated Whop provider. They are disabled until the live Whop
  products, webhook and Secret Manager bindings are verified.

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
| Free | $0 | 10 lifetime | about 1 minute of standard 1080p MP4 | One real end-to-end proof through web, agent or API; free previews and editing; hard cap before provider work |
| Creator | $15/month | 300/month | up to 30 standard MP4 minutes | Web, agent and API access, all core styles/exports, one active render |
| Pro | $39/month | 1,000/month | up to 100 standard MP4 minutes | The same interfaces with higher capacity, concurrency and priority processing |
| Studio | $99/month | 3,000/month | up to 300 standard MP4 minutes | The same interfaces plus team/brand controls and four active renders when those capabilities ship |

The catalog also includes annual billing at 15–20% off with clean monthly equivalents:
Creator is $144/year ($12/month) with 3,600 credits, Pro is $396/year ($33/month)
with 12,000 credits, and Studio is $1,008/year ($84/month) with 36,000 credits.
Annual credits are granted as one prepaid pool
and expire at the annual period end plus the same two-month grace window.
Do not launch an unlimited plan. Monthly subscription credits retain the
two-month rollover policy; the prepaid annual pool lasts through the annual
period plus the same two-month grace window. Keep purchased credits in a
separate non-expiring pool and spend expiring subscription credits first.

Recommended top-ups:

| Pack | Price | Credits | Standard MP4 equivalent |
| --- | ---: | ---: | ---: |
| Small | $12 | 200 | about 20 minutes |
| Medium | $35 | 750 | about 75 minutes |
| Large | $79 | 2,000 | about 200 minutes |

There should be no automatic unbounded overage. A user either has credits,
buys a pack, or upgrades. Enterprise/dedicated-capacity pricing comes only
after measured sustained usage and support requirements.

### Full-utilization contribution check

This deliberately stresses every included credit as standard MP4-equivalent
usage. Net revenue uses the placeholder 2.9% + $0.30 processing fee.

| Plan | Net revenue | Base COGS ($0.03/min) | Base contribution margin | Downside COGS ($0.06/min) | Downside contribution margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Creator | $14.27 | $0.90 | 89.1% | $1.80 | 83.1% |
| Pro | $37.57 | $3.00 | 88.6% | $6.00 | 80.9% |
| Studio | $95.83 | $9.00 | 87.7% | $18.00 | 78.6% |

These allowances intentionally target very strong margins even when every
included credit is consumed and per-minute COGS doubles. Keep four-render
concurrency behind telemetry and change either price, allowance or credit
weights if P90 cost exceeds the downside case. Fixed infrastructure must be
tracked separately; at low customer counts it will dominate total profit
despite healthy variable margins.

### Every paid tier at scale

This table assumes the most conservative normal case: every customer consumes
100% of the plan's included standard-MP4 allowance every month. “Contribution”
is revenue after the placeholder payment fee and measured/planned variable
COGS. It is not net profit because fixed platform costs, payroll, support, tax,
refunds and discounts are below this line.

| Tier | Paid users | Gross MRR | Payment fees | Base COGS | Base contribution | Downside COGS | Downside contribution |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Creator | 100 | $1,500 | $73.50 | $90 | $1,336.50 | $180 | $1,246.50 |
| Creator | 1,000 | $15,000 | $735 | $900 | $13,365 | $1,800 | $12,465 |
| Creator | 10,000 | $150,000 | $7,350 | $9,000 | $133,650 | $18,000 | $124,650 |
| Pro | 100 | $3,900 | $143.10 | $300 | $3,456.90 | $600 | $3,156.90 |
| Pro | 1,000 | $39,000 | $1,431 | $3,000 | $34,569 | $6,000 | $31,569 |
| Pro | 10,000 | $390,000 | $14,310 | $30,000 | $345,690 | $60,000 | $315,690 |
| Studio | 100 | $9,900 | $317.10 | $900 | $8,682.90 | $1,800 | $7,782.90 |
| Studio | 1,000 | $99,000 | $3,171 | $9,000 | $86,829 | $18,000 | $77,829 |
| Studio | 10,000 | $990,000 | $31,710 | $90,000 | $868,290 | $180,000 | $778,290 |

For a more plausible portfolio mix of 70% Creator, 25% Pro and 5% Studio, the
weighted account produces $25.20 gross MRR and includes 61 standard-MP4
minutes. The following is still the full-utilization case:

| Total paid users | Gross MRR | Payment fees | Base variable COGS | Base contribution | Downside variable COGS | Downside contribution |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | $2,520 | $103.08 | $183 | $2,233.92 | $366 | $2,050.92 |
| 1,000 | $25,200 | $1,030.80 | $1,830 | $22,339.20 | $3,660 | $20,509.20 |
| 10,000 | $252,000 | $10,308 | $18,300 | $223,392 | $36,600 | $205,092 |

To turn contribution into a planning proxy for operating profit, subtract the
real monthly fixed-cost ledger. If, purely for capacity planning, the business
reserved $500/month at 100 paid users, $2,000 at 1,000 and $10,000 at 10,000
for database, queue, logs, monitoring and platform headroom, the mixed-plan
base/downside contribution after that reserve would be:

| Paid users | Illustrative fixed platform reserve | Base after reserve | Downside after reserve |
| ---: | ---: | ---: | ---: |
| 100 | $500 | $1,733.92 | $1,550.92 |
| 1,000 | $2,000 | $20,339.20 | $18,509.20 |
| 10,000 | $10,000 | $213,392 | $195,092 |

Those reserve figures are not forecasts and deliberately exclude people costs.
The production dashboard must replace them with actual invoices. The margin
policy should be enforced in code: alert when trailing P90 variable gross
margin falls below 80%, stop increasing allowances below 75%, and reprice or
reweight an output before it falls below 70%.

### Free-tier and scale scenarios

Free is a one-time proof allowance, not a renewable monthly subsidy. Require a
verified account, cap it at one standard MP4 minute, do not permit overlays or
multiple video outputs from the free pool, and rate-limit transcription and
preview generation. At the planning envelope, fully consuming the grant costs
about $0.03 base or $0.06 downside per non-paying signup before abuse controls.

| Activated Free accounts in a signup cohort | Revenue | Base one-time grant cost | Downside one-time grant cost |
| ---: | ---: | ---: | ---: |
| 100 | $0 | $3 | $6 |
| 1,000 | $0 | $30 | $60 |
| 10,000 | $0 | $300 | $600 |
| 100,000 | $0 | $3,000 | $6,000 |

This is the maximum normal free-render liability if every verified account
uses the whole grant. Fraud, repeated-account creation and preview abuse can
exceed it, so phone/domain/device/rate controls and a global daily provider
budget are economic requirements, not optional security polish.

The following first-month cohort model uses deliberately explicit assumptions:

- 1,000 new verified signups;
- every non-paying signup consumes the entire one-minute free grant;
- paid mix is 70% Creator, 25% Pro and 5% Studio;
- paid customers use 35% of their included allowance in month one;
- card processing is the same placeholder 2.9% + $0.30 per payment;
- fixed infrastructure, support, tax and refunds remain excluded.

| Signup-to-paid conversion | Paid customers | Gross first-month MRR | Base variable contribution | Base margin | Downside variable contribution | Downside margin |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3% | 30 | $756 | $676.76 | 89.5% | $628.45 | 83.1% |
| 5% | 50 | $1,260 | $1,147.94 | 91.1% | $1,087.41 | 86.3% |
| 8% | 80 | $2,016 | $1,854.70 | 92.0% | $1,775.86 | 88.1% |

The model scales linearly before fixed-capacity step changes: multiply the
1,000-signup row by 10 for a 10,000-signup cohort and by 100 for 100,000. It is
not an LTV model. Retained subscribers improve cohort economics after month one
because the free proof cost does not recur; churn, refunds and support reduce
them. Break-even paid customer count is therefore:

`monthly fixed operating cost / contribution per retained paid account`

At the assumed plan mix and 35% allowance use, weighted gross ARPU is $25.20
and variable contribution is about $23.53 base or $22.89 downside before fixed
costs. A $1,000 monthly fixed-cost base would therefore require roughly 43-44
retained paid accounts; use the real fixed-cost ledger before treating this as
a launch forecast.

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

## Implementation status

1. **Implemented:** server-owned, versioned plan/top-up catalog separate from
   the render `PRICE_TABLE`, shared by enforcement, UI and tests.
2. **Implemented:** 10-credit lifetime Free pool while preserving explicit
   beta/admin grants separately.
3. **Implemented:** subscription and purchased-credit pools, rollover expiry,
   entitlements, transactionally enforced active-render limits and immutable
   billing events.
4. **Implemented:** server-side workspace-bound checkout creation plus signed,
   idempotent webhook grants.
5. **Implemented:** `/pricing`, settings billing management and plan/top-up
   checkout entry points.
6. **Implemented:** MCP `checkout_required` with balance, shortfall, quote
   expiry, catalog version and an app-owned resume URL.
7. **External acceptance gate:** configure live Whop products/secrets and test
   no-credit → checkout → webhook → resume end to end, including duplicate and
   out-of-order webhooks, cancellation, stale quotes, retries and refunds.
8. **Post-launch telemetry:** record transcribed minutes, render seconds by
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
