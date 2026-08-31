# Hardened direct uploads

Production R2 uploads use a short-lived, exact-content-length presigned `PUT`
to `staging/<workspace>/<upload>/incoming.<ext>`. The URL is object-specific but
remains reusable until it expires, so completion never trusts that key as the
final source:

1. The authenticated completion endpoint checks the upload row, expiry, stored
   size, content type, and signed metadata.
2. R2 makes an internal copy to a random server-only verification snapshot.
3. A durable `finalize_upload` task downloads that snapshot once, computes its
   SHA-256, checks an optional caller checksum, and runs FFprobe.
4. R2 copies verified bytes internally to the final immutable source key. The
   asset becomes ready only after that copy and probe succeed.
5. Application cleanup deletes the complete staging prefix. Project deletion
   and retention sweeps also remove abandoned prefixes.

The API-streamed bounded PUT remains the fallback when the active object store
does not support direct authorization or the browser cannot identify a supported
MIME type.

## R2 bucket gates

The production bucket was explicitly approved and provisioned on 2026-08-31
through the non-printing Mission Control wrapper. Its exact-origin CORS and
one-day abandoned-upload policy were applied from the checked-in JSON files and
read back successfully:

```bash
mc cloudflare r2 policy apply --business appagentic \
  --bucket clipsubtitles-media-production \
  --cors-file infra/r2/cors.production.json \
  --lifecycle-file infra/r2/lifecycle.production.json
```

The CORS origin must match exactly (no trailing slash). Only `PUT` and
`Content-Type` are allowed. The one-day `staging/` rule is a final orphan safety
net; normal application cleanup runs much earlier. R2's default incomplete
multipart cleanup remains useful even though v1 direct uploads are bounded
single PUTs.

Before enabling direct browser traffic, verify from the deployed web origin:

- the preflight permits only `https://clipsubtitles.com`;
- an exact-length supported-media upload completes and reaches `ready`;
- a changed length/signature is rejected;
- a late reuse of the signed staging URL cannot alter the final source hash;
- an expired, uncompleted staging object is removed by the application sweep;
- the R2 lifecycle rule is visible in provider readback.
