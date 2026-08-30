# ADR-0003 — Live evidence selects Scribe as primary

**Date:** 2026-08-29 · **Amended:** 2026-08-30 · **Status:** accepted

## Context

Provider ordering must be based on real product audio rather than public
leaderboards or synthetic fixtures alone.

The prerecorded Gemini adapter uses the dedicated `gemini-3.5-transcribe`
Interactions API in verbatim mode with native word timestamps and diarization.
It was live-verified on one 12-second source on 2026-08-30. The public-preview
service currently rejects `custom_vocabulary` together with word timestamps,
so the word-timed adapter does not claim vocabulary biasing until that live
behavior changes.

On 2026-08-30, a bounded canary ran two preserved repeats for each provider on
six real English voice clips from the product thread (92.045 seconds and 238
reference words per repeat). The Scribe lane used ElevenLabs' Scribe v2 through
its official fal partner endpoint because a direct key was not yet available.
Both lanes used provider-native word timestamps. A separate blinded render
review used the same source, caption style and renderer for both transcripts.
The preserved method, aggregate table, artifact hashes and provenance are in
`docs/benchmark/product-audio-canary-2026-08-30.md`.

## Decision

- The harness (`packages/transcription/src/benchmark`) ships a synthetic,
  redistributable corpus (13 cases across clean, music, accent, code-switching,
  poor-mic, and multilingual categories; tone-burst audio aligned to original
  scripts), a deterministic scorer (WER, entity accuracy, mean/max timestamp
  offset, cumulative drift slope, caption-break F1, latency/RTF, failure rate,
  cost), and acceptance gates.
- Direct ElevenLabs Scribe v2 is the production primary; Gemini 3.5 Transcribe
  is the fallback. Production sets `TRANSCRIPTION_PROVIDERS=elevenlabs,gemini`.
- Scribe won both repeats. Pooled WER was 3.99% versus Gemini's 12.18%, named-term
  accuracy was 86.36% versus 63.64%, and mean latency was 3.70 seconds versus
  4.85 seconds. Both returned structurally valid timings; Scribe timestamps
  were millisecond-granular while Gemini's were quantized to 100 ms.
- The blinded rendered-caption review selected Scribe in both presentation
  orders at 9/10 confidence and scored its sync 9/10 versus Gemini's 7/10.
- Use the direct ElevenLabs adapter in production. At published route prices,
  the measured corpus would have cost an estimated $0.0113 direct versus the
  measured $0.0153 Gemini route; the fal route was useful for the canary but is
  not the production path.
- Mock profiles continue to prove the harness only; mock reports claim no live
  winner. Existing benchmark gates retain Gemini as the comparison baseline.

## Consequences

- `TRANSCRIPTION_PROVIDERS=mock` remains the safe local default.
- The production provider decision is resolved. Secret binding and a direct
  staging smoke remain deployment gates, not model-selection gates.
- The direct `api.elevenlabs.io` adapter itself is not live-verified: the canary
  used the official fal partner route. A direct staging smoke is mandatory
  before serving users.
- This directional canary was evaluated outside the synthetic harness's strict
  absolute gates. In particular, Scribe's 86.36% named-term accuracy was better
  than Gemini's 63.64% but below the harness's 90% threshold; the real clips had
  no human-audited absolute word-time reference for offset/drift scoring. The
  result selects the private-staging candidate, not a general launch claim.
- This is a small, one-speaker English canary. Add human-audited talking-head,
  multilingual, noisy/music and multi-speaker cases before broader claims.
- `docs/benchmark/mock-run.md` is illustrative only.
