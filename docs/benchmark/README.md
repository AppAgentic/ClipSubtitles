# Transcription benchmark

`pnpm benchmark` runs the provider-neutral harness in
`packages/transcription/src/benchmark/`.

## What it measures

| Metric | Definition |
|--------|------------|
| WER | (substitutions + deletions + insertions) / reference words, on normalised tokens (case/punctuation-insensitive) |
| Entity accuracy | Share of `[[entity]]`-marked reference words matched exactly |
| Timestamp drift | Mean/max absolute start offset on matched words, plus the least-squares slope of offset over time (ms/min) — the "no cumulative drift" gate |
| Caption-break F1 | Breaks chosen by the production segmenter on the hypothesis vs. on the reference, compared in reference index space |
| Latency / RTF | Provider latency and real-time factor |
| Failure rate | Failed calls / total |
| Cost | `estimatedUsd` from the adapter or `BENCHMARK_USD_PER_MINUTE_<PROVIDER>` |

## Corpus

13 synthetic cases across clean, music, accent, code-switching, poor-mic, and
multilingual categories. Scripts are original; audio is deterministic tone
bursts aligned to the ground truth (`fixtures/generated/benchmark/*.wav` +
`.truth.json`). It exercises extraction, VAD, chunking, adapters, and scoring,
but it is **not speech** — mock results are never evidence about real
providers.

## Acceptance gates

A candidate provider passes only when it is live, the `gemini` baseline ran in
the same report, WER ≤ baseline, max drift slope ≤ 20 ms/min, mean |offset|
≤ 80 ms, failure rate ≤ 5 %, and entity accuracy ≥ 90 %.

## Production decision

The 2026-08-30 product-audio canary selected direct ElevenLabs Scribe v2 as
primary and Gemini 3.5 Transcribe as fallback. See
`docs/decisions/ADR-0003-benchmark-evidence.md` for the bounded results and
limitations. The synthetic corpus described above remains useful for regression-testing
the harness, but it must not overturn the real-audio decision.

## Running a new live comparison

```bash
# keys injected from the vault into this shell only — never written to .env or the repo
pnpm benchmark --providers elevenlabs,gemini --baseline gemini --repeats 2
```

Reports: `fixtures/benchmark/reports/latest.{md,json}` (gitignored).
`mock-run.md` in this folder is an illustrative mock run.
