# Product-audio transcription canary — 2026-08-30

## Purpose and scope

This bounded internal canary selected the transcription order for private
staging. It is not a published ASR benchmark or evidence of universal accuracy.

- Six operator-authored English voice notes from the ClipSubtitles development
  thread; no customer media.
- 92.045 seconds and 238 reference words per repeat, manually normalized from
  the archived thread transcriptions and conversation context.
- Two preserved repeats per provider (12 calls per provider).
- Gemini lane: `gemini-3.5-transcribe`, Files + Interactions APIs, verbatim mode,
  provider-native word timestamps.
- Scribe lane: Scribe v2 through ElevenLabs' official fal partner route. The
  direct ElevenLabs adapter was not yet credentialed and remains staging-smoke
  gated.
- Raw audio/transcripts remain private and gitignored under
  `.data/transcription-benchmark-20260830/`; the immutable source conversation
  is Slack thread `1787967837.244119`.

## Aggregate result

| Metric | Gemini 3.5 | Scribe v2 | Directional winner |
|---|---:|---:|---|
| Word error rate | 12.18% | 3.99% | Scribe |
| Word errors / reference words | 58 / 476 | 19 / 476 | Scribe |
| Named-term accuracy | 63.64% | 86.36% | Scribe |
| Mean wall latency | 4.849 s | 3.696 s | Scribe |
| Invalid word spans | 0 | 0 | Tie |
| Backwards word starts | 0 | 0 | Tie |
| Positive word spans under 60 ms | 0 | 36 | Gemini |
| Timestamps quantized to 100 ms | 100% | 0.82% | Scribe |
| Measured route cost, both repeats | $0.01534 | $0.02455 via fal | Gemini route |
| Estimated direct-route cost | $0.01534 | $0.01125 | Scribe direct |

The under-60-ms count is a structural diagnostic, not an audited sync metric;
the renderer applies its existing 160-ms minimum active-word dwell so a very
short provider span does not flash unreadably. It remains a talking-head canary
item rather than evidence to discard.

Scribe won both repeats independently. A separate same-source render used the
identical Bold Pop style and renderer for both transcripts. A blinded multimodal
review with `gemini-3.7-flash` was run twice with A/B order reversed; it selected
the Scribe render both times at 9/10 confidence and scored perceived sync 9/10
versus Gemini's 7/10.
Those judgments were reconciled against the stored words and extracted frames;
two unsupported critic details were rejected.

### Critic reconciliation

The critic said the Scribe lane omitted the opening “Are you able to” and the
later “looking and seeing if.” The stored Scribe words, generated SRT and
extracted frames contain both phrases, so those two details were rejected. The
winner, sync and readability judgments were retained because they were stable
after the A/B order reversal and agreed with the inspected media.

## Integrity manifest

The private audio is not committed, but these hashes make the preserved local
evidence identifiable without exposing transcript text.

| File | Duration (s) | Bytes | SHA-256 |
|---|---:|---:|---|
| `long-style-critique.wav` | 39.450688 | 1,262,500 | `aded05a0d7c5600cb45e39bf6daf7a3f7c43a93a0e3a29dc75afbad016ef1846` |
| `mcp-install.wav` | 17.206000 | 550,670 | `59929fd7c3fdb0cfdb3e44b04d041c571be66a6ac6b037c3ab14823b0975ff2a` |
| `provider-question.wav` | 7.662625 | 245,282 | `799d56ecf4c94a4e15332882c5559245cdcccfe722796f8cef600b4ad646d3d0` |
| `provider-routing.wav` | 7.616125 | 243,794 | `715f22b29219de78ead83ba7452af075708238d04312200e4a18f5dc400ad694` |
| `short-command.wav` | 3.250813 | 104,104 | `2998791b5a941e0e8cd5b404577bbb67143b099fab892f4b1150f6a276627928` |
| `timing-question.wav` | 16.857688 | 539,524 | `cc766f60381d58e17d957d38ba4b7f09405917f120af4f0431c70aee511453a6` |
| visual source MP4 | 18.730000 | 949,633 | `6bc78d4f532b852545a6fa6f3ccdfb3f7f4a1b7b43fd740648545539a830c568` |
| Gemini comparison MP4 | 18.730000 | 1,023,806 | `5e48f6cb9e49ac90eb5a4adc2dbb14987167b99b9f59f22d595c46e8e99004c9` |
| Scribe comparison MP4 | 18.730000 | 1,038,558 | `766a0473f3bf844efd7caaee3aec0846b10a00fdead538e0195424c393380a2d` |

## Acceptance interpretation

The synthetic harness requires at least 90% entity accuracy and audited
absolute offset/drift thresholds. This real-audio canary does not satisfy those
absolute evidence requirements: Scribe achieved 86.36% entity accuracy, and
the real clips lack a human-audited word-time truth set. The canary therefore
selects Scribe as the candidate for a direct private-staging smoke because it
materially beat Gemini on every measured accuracy result and on the blinded
render comparison. It does not remove the need for talking-head, multilingual,
music/noise and multi-speaker coverage before public launch claims.
