# ADR-0005 — Immutable quotes and exactly-once billing

**Date:** 2026-08-29 · **Status:** accepted

## Decision

- `POST /v1/projects/{id}/render-quotes` returns an immutable `RenderQuote`:
  settings, project version, content hash, expected outputs (with per-output
  credits and dimensions), billable minutes, total credits, price version, TTL.
- `POST /v1/projects/{id}/renders` consumes a quote with
  `{quoteId, approvedCreditCost, idempotencyKey}`. The approved cost must equal
  the quote exactly; version/hash/price drift → `QUOTE_INVALIDATED`; expiry →
  `QUOTE_EXPIRED`. Reserve + consume + enqueue happen in one transaction; the
  task input snapshots the exact words revision, pages, and style.
- The MCP tool `render_caption_export` implements the same two steps: without
  `approval` it returns `quote_required`; with it, it starts the render.
- Credits: `reserve` (unique per quote/task), `settle` (once, in the completion
  transaction, only by the lease owner), `release` (failure, cancellation,
  lease loss). Ledger rows are idempotent by key; balances are derived and
  materialized.
- Previews and subtitle-only outputs are free; previews are rate limited.

## Consequences

- Duplicate render requests (same key) replay the original task; a different payload with the same key is rejected.
- Price changes require bumping `PRICE_VERSION`, which invalidates open quotes instead of repricing them.
