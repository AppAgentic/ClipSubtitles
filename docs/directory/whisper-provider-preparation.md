# Whisper transcription preparation — not activated

This patch adds the opt-in `openai-whisper` provider. Existing local defaults and the production `elevenlabs,gemini` Terraform guard remain unchanged. No provider request, key provisioning, contract acceptance, deployment, or account eligibility verification was performed.

## Compatibility and limits

The adapter uses `/v1/audio/transcriptions`, fixed `whisper-1`, `verbose_json`, and word timestamps. Omitted language preserves automatic detection; supplied BCP-47 hints reduce to a two-letter primary language. Known returned English language names/codes normalize to ISO codes; unknown values become `und`, never a guessed language. Word times are validated, converted to milliseconds and clipped to source duration; confidence and speaker labels are not invented.

The existing mono 16 kHz PCM16 extraction produces approximately 19.2 MB for the default ten-minute maximum. Whisper's 25 MB file bound is checked before reading and against the actual upload Blob. Longer inputs are rejected: this patch does not raise product limits or silently truncate/chunk speech. If limits increase later, implement VAD-boundary chunks with absolute timestamp offsets and overlap deduplication, then evaluate boundary accuracy.

No streaming progress, diarization, vocabulary biasing, or verbatim guarantee is advertised. Whisper supports a limited prompt, but this adapter deliberately does not inject vocabulary without a tested multilingual prompting strategy. Word-timing accuracy, code switching, punctuation, filler words and silence hallucinations still need a representative live benchmark.

Published cost: $0.006/minute; approximately $0.06 per ten-minute upload, excluding retries and our infrastructure. The adapter reports an estimate, not an invoice. HTTP timeout is five minutes and cancellation propagates. Existing HTTP error handling excludes upstream response bodies.

## Activation gates

1. Verify the intended AppAgentic API project, credential authority, model access, billing/rate limits and applicable agreement. Existing general OpenAI access does not prove this deployment can use it.
2. Resolve teen consent and safety/data obligations. Services Agreement §2.2 allows customer applications and §3.3(c) requires parent/guardian consent for minors. Under-18 guidance adds age-appropriate safeguards; it also conditions processing personal data below 13 or the applicable digital-consent age on zero data retention. Adult API account ownership alone does not satisfy these obligations. This is source analysis, not legal clearance.
3. Run bounded live English, non-English, silence, noisy and maximum-duration canaries; verify full caption rendering, correction and export. Recheck data-use/retention settings and align provider consent and privacy disclosures with actual processing.
4. Review the inactive Terraform template with the platform owner. Bind an authorized secret to the worker only, revise the production provider guard explicitly and select `openai-whisper` alone if replacing the old providers. Check forced-provider requests cannot escape the configured chain. Do not silently retain Gemini/ElevenLabs as fallbacks.
5. Require final-tree CI, reviewed deployment and post-deployment verification before calling the alternative operational.

## Official evidence

- https://developers.openai.com/api/docs/guides/speech-to-text — word timestamps, 25 MB limit, chunking and 224-token Whisper prompt limitation.
- https://developers.openai.com/api/docs/models/whisper-1 — multilingual recognition, language identification, $0.006/minute.
- https://github.com/openai/openai-python/blob/main/src/openai/types/audio/transcription_create_params.py — optional language, verbose JSON and timestamps, no Whisper streaming.
- https://openai.com/policies/services-agreement/ — customer applications, minors' consent, customer content use.
- https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance — downstream safeguards and digital-consent data restriction.
- https://openai.com/policies/usage-policies/ — minors' safety and content restrictions.
