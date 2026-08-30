# ADR-0003 — Provider selection needs live evidence

**Date:** 2026-08-29 · **Status:** accepted

## Context

Gemini 3.5 Transcribe is the production model. ElevenLabs Scribe v2 is retained
as the only live fallback candidate and must be benchmarked against Gemini.

The prerecorded Gemini adapter uses the dedicated `gemini-3.5-transcribe`
Interactions API in verbatim mode with native word timestamps and diarization.
It was live-verified on one 12-second source on 2026-08-30. That proves the API
mapping, not provider superiority. The public-preview service currently rejects
`custom_vocabulary` together with word timestamps, so the word-timed adapter
does not claim vocabulary biasing until that live behavior changes.
No provider credentials exist in this environment.

## Decision

- The harness (`packages/transcription/src/benchmark`) ships a synthetic,
  redistributable corpus (13 cases across clean, music, accent, code-switching,
  poor-mic, and multilingual categories; tone-burst audio aligned to original
  scripts), a deterministic scorer (WER, entity accuracy, mean/max timestamp
  offset, cumulative drift slope, caption-break F1, latency/RTF, failure rate,
  cost), and acceptance gates.
- Gates only pass for a **non-mock fallback** compared against a **gemini**
  baseline run. Mock profiles exist to prove the harness ranks accurate >
  noisy > drifty > flaky; their reports state that no winner is claimed.
- Live adapter mappings are written against public API shapes and marked
  unverified until the first live run (see `PARKED_ACTIONS.md`).

## Consequences

- `TRANSCRIPTION_PROVIDERS=mock` locally; production selection is a documented human gate.
- `docs/benchmark/mock-run.md` is illustrative only.
