# Storage cost model

This model compares private Cloud Storage in the same Google Cloud region as the
workers with Cloudflare R2 Standard. It covers object storage, object operations,
and network transfer only. It excludes Cloud Run compute, transcription, database,
taxes, and support plans.

## Baseline workload

- 100 MB source retained for 30 days
- 25 MB export retained for 7 days
- One full-equivalent source playback in the editor
- Three full export downloads
- Direct object-store downloads. The current secure upload path streams through
  the API; a second scenario models a future direct upload with equivalent byte
  and content-type enforcement.
- Cloud Run and Cloud Storage colocated in one region

## Unit economics

At August 2026 list prices:

- Cloud Storage single-region storage: approximately $0.020/GiB-month
- Cloudflare R2 Standard storage: $0.015/GB-month
- Cloud Storage public delivery: tiered, beginning around $0.12/GiB
- R2 public delivery: no egress charge
- Cloud Run upload to R2: charged as Google Cloud internet data transfer

Average retained storage per job is:

```text
(0.100 GB × 30/30) + (0.025 GB × 7/30) = 0.10583 GB-month
```

Baseline transfer per job is:

```text
Cloud Storage public delivery = (0.100 + 3 × 0.025) GB = 0.175 GB
R2 current API uploads       = 0.100 + 0.025 GB = 0.125 GB
R2 optimized direct upload   = 0.025 GB
```

The request charges are small at these sizes. R2 also includes 10 GB-month of
Standard storage, 1 million Class A operations, and 10 million Class B operations
per month at no charge.

## Scenario results

These are indicative USD estimates using Google's volume tiers and rounding to the
nearest dollar.

| Jobs/month | Cloud Storage | R2 current secure upload | R2 optimized direct upload |
|---:|---:|---:|---:|
| 1,000 | $23 | $16 | $4 |
| 10,000 | $224 | $163 | $46 |
| 100,000 | $1,965 | $1,487 | $444 |

The current R2 path is still approximately 24–29% cheaper under this workload.
Direct source upload raises the modeled saving to approximately 77–82%. The first
customer download roughly offsets the Cloud Run-to-R2 export upload; any additional
export download, or any source playback, moves the network economics in R2's favour.
Provider-signed playback/download is implemented. Direct source upload is a separate
hardening task because it must retain the current exact-once token claim, maximum
byte limit, content-type policy, and post-upload media probe.

## Decision

Use R2 Standard for production source and export media, with Cloud Storage retained
as a supported fallback. The safe API-streamed upload is acceptable for launch and
still cheaper in the baseline; move to direct upload only after its enforcement and
abandoned-upload cleanup tests pass. Benchmark worker-to-R2 throughput from the
chosen Cloud Run region before launch. Keep objects private, use short-lived signed
URLs, lifecycle cleanup in the application, and scoped credentials held in Secret
Manager.

Pricing references:

- https://developers.cloudflare.com/r2/pricing/
- https://cloud.google.com/storage/pricing
- https://cloud.google.com/vpc/pricing
