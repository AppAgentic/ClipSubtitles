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
- Direct object-store downloads. The protected fallback streams uploads through
  the API. The optimized direct R2 path is implemented locally with an exact-size
  staging PUT, authenticated snapshot, and durable hash/FFprobe finalization.
  Production bucket CORS and lifecycle policy were applied and read back on
  2026-08-31; the deployed-origin upload smoke remains a launch gate.
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
Provider-signed playback/download and hardened direct source upload are implemented.
The direct path preserves one-time authenticated completion, exact signed length,
content-type policy, late-overwrite isolation, SHA-256, and post-upload media probe.

## Decision

Use R2 Standard for production source and export media, with Cloud Storage retained
as a supported fallback. The safe API-streamed upload remains available. Direct-upload
enforcement, late-overwrite isolation, checksum failure, project deletion, and
abandoned-upload cleanup are covered locally. Production R2 is provisioned with
exact-origin CORS and a one-day `staging/` cleanup rule; enable direct browser
traffic only after the deployed-origin smoke. Benchmark worker-to-R2 throughput
from the chosen Cloud Run region before launch. Keep objects private, use
short-lived signed URLs, lifecycle cleanup in the application, and scoped
credentials held in Secret Manager.

Pricing references:

- https://developers.cloudflare.com/r2/pricing/
- https://cloud.google.com/storage/pricing
- https://cloud.google.com/vpc/pricing
