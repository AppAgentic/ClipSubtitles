# ADR-0003 — Provider selection needs live evidence

**Date:** 2026-08-29 · **Status:** accepted

## Context

Gemini 3.5 Transcribe is the leading candidate but must be benchmarked against
ElevenLabs Scribe v2, GPT Transcribe + alignment, and the Whisper baseline.
No provider credentials exist in this environment.

## Decision

- The harness (`packages/transcription/src/benchmark`) ships a synthetic,
  redistributable corpus (13 cases across clean, music, accent, code-switching,
  poor-mic, and multilingual categories; tone-burst audio aligned to original
  scripts), a deterministic scorer (WER, entity accuracy, mean/max timestamp
  offset, cumulative drift slope, caption-break F1, latency/RTF, failure rate,
  cost), and acceptance gates.
- Gates only pass for a **non-mock** provider compared against the **whisper**
  baseline run. Mock profiles exist to prove the harness ranks accurate >
  noisy > drifty > flaky; their reports state that no winner is claimed.
- Live adapter mappings are written against public API shapes and marked
  unverified until the first live run (see `PARKED_ACTIONS.md`).

## Consequences

- `TRANSCRIPTION_PROVIDERS=mock` locally; production selection is a documented human gate.
- `docs/benchmark/mock-run.md` is illustrative only.
