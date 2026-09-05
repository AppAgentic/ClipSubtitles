# MCP annotation audit — 1.0.0

Audited 2026-09-05 against the production candidate source and the current [OpenAI MCP review requirements](https://developers.openai.com/plugins/deploy/app-review), plus the [official submission skill](https://github.com/openai/plugins/blob/main/plugins/openai-developers/skills/chatgpt-app-submission/SKILL.md).

The current review definition explicitly treats log writes as state changes. Every public tool records a redacted durable access audit through the common MCP wrapper. All thirteen tools therefore declare `readOnlyHint: false`; presentation and retrieval tools still require only the internal `captions:read` scope and do not modify project content. No permission widening or removal of security auditing is included.

Four tools declare `destructiveHint: true`, considering every mode and indirect effect:

- `generate_captions`: regeneration retains transcript revisions but resets manual breaks/joins and current layout without a complete prior-layout snapshot (`worker/handlers/generate-captions.ts`).
- `update_caption_project`: edits retain parent transcript revisions but overwrite current title/style/layout without full historical snapshots; expected-version checks prevent stale edits (`services/projects.ts`, `patchProject`).
- `render_caption_export`: quoting alone does not charge, but the approved completion path settles existing credits irreversibly; immutable quotes, explicit approval and idempotency are safeguards (`services/captions.ts`, `worker/worker.ts`, billing service).
- `cancel_caption_task`: accepted cancellation is terminal and worker cleanup discards task outputs; source projects remain and already-completed tasks reject cancellation (`services/tasks.ts`, `worker/worker.ts`, `services/outputs.ts`).

All tools declare `openWorldHint: false` under the review definition of public/external writes. Source import fetches media without publishing or modifying the source system. Audio is sent to private ElevenLabs/Gemini transcription processing, disclosed in the generation descriptor. The workflow does not post content or message external recipients. Private processor transfers are still privacy-relevant; this flag is not a no-transfer claim.

## Import

The root `chatgpt-app-submission.json` contains thirteen tools and thirty-nine one-sentence justifications, five positive cases and three non-trigger intent negatives. Expected results are procedures, explicitly marked live execution pending. No credentials or execution evidence are embedded. `app_info` is deliberately omitted to preserve the already-saved listing; the live portal's Creativity category is not in the import schema's enum.

The official skill example uses an old apps-sdk schema URL. The actual schema fetched from that URL requires the canonical `$schema` value `https://developers.openai.com/plugins/schemas/chatgpt-app-submission.v1.json`; this file uses that value and was validated against the fetched Draft 2020-12 schema. Import does not replace deploying the corrected descriptors and scanning them into the draft; verify every imported value against the fresh scan before submission.

## Other review checks

All thirteen registered tools declare output schemas. Input schemas request media, project/task references and workflow settings, not passwords, MFA codes, government IDs, payment details or health identifiers. User media may naturally contain personal data, and generation transfers audio to the configured transcription providers; policy disclosure and actual user consent remain a separate review lane. Source/tool names match the implemented operations. Widget CSP allows only the configured first-party API/web origins, with no wildcard or frame domains; its production values must be confirmed in the refreshed scan. No unsupported translation, video generation or social publishing is claimed.
