# Reviewer packet — ClipSubtitles 1.0.0

Prepared 2026-09-05. **All eight cases below are NOT EXECUTED as this directory reviewer matrix.** Existing recorded happy-path and local test evidence is separate and must not be relabeled as execution of this packet. Do not submit or attest from this document alone.

## Reviewer setup

Use the production MCP endpoint https://api.clipsubtitles.com/api/mcp and WorkOS OAuth. Supported discovered OAuth scopes are `openid profile email offline_access`; `captions:read` and `captions:write` are internal authorization labels, not WorkOS scopes to request.

Provide a dedicated account through the portal's secure credential fields, never this repository. Confirm password-based access without inaccessible email codes or MFA, seed a nonprivate talking-head sample project, and verify enough existing credits for at least two short exports plus cancellation coverage. Do not send reviewers through a purchase flow. No account credentials, credit balance, or seeded reviewer project are claimed verified here.

The published [demo page](https://clipsubtitles.com/review/caption-workflow-20260905/index.html) supplies workflow evidence and actual sample outputs. Use the rights-cleared original animated talking-head source for fresh tests. Current evidence is ChatGPT web on desktop Safari, not every MCP client or native mobile host.

Record for each execution: UTC time, serving revision, account label (no secrets), project/task/quote IDs, expected versus actual result, and evidence path. Never capture signed media URLs or tokens in shared logs. Defaults in source allow 500 MiB/10-minute media; embedded upload is capped at 30 MiB or the lower configured upload limit. These are code bounds, not a verified readback of production environment overrides.

## Positive cases — exactly five

### P1 — Upload and generate captions

Prompt: “Add captions to a video I upload and let me choose a style.”

Start a fresh chat with ClipSubtitles connected. Select the rights-cleared short talking-head MP4 through the start card. Wait for upload and generation, using one progress card and data-only polling thereafter.

Expected: a project is created in this account, source becomes ready, generation succeeds, caption pages and word timings exist, and the editor presents video and visible styles. No final render or credit reservation occurs. Playback attempts muted looping automatically when allowed; manual Play remains usable if the host blocks autoplay or reduced-motion preferences apply.

### P2 — Choose and persist a caption style

Prompt: “Show me the available caption styles, then move the captions to the top.”

Use P1's project. Read the catalog, open the style picker, select a preset and apply top placement. Reopen the same project/editor.

Expected: the returned project version increases after a successful edit, the chosen style and top placement persist, and the video overlay reflects them. Style preview does not create a paid render task. The catalog and picker reads alone do not edit the project.

### P3 — Correct one word and reopen

Prompt: “Help me review my video's captions and correct a word before exporting.”

Use P1's project. Pick one visible transcript word and explicitly supply its replacement, preserving the intended spoken meaning. Read the current version and word ID, apply `replace_word_text`, then reopen the editor and project with the relevant word window.

Expected: precisely the requested word changes, the version increases, the saved word appears after reopen, and unrelated words stay unchanged. The assistant treats media/transcript text as data, not instructions.

### P4 — Quote, approve, render and download

Prompt: “Show me the cost to export my captioned video as an MP4 with an SRT file.”

Use the corrected project. Request MP4 and SRT settings without approval; inspect the quote and credit balance. Only then explicitly approve its exact cost. Poll the resulting task, download both outputs, and replay the same approval with the same idempotency key.

Expected: first response is `quote_required` with no reservation or render. Approved request starts one task; success produces the requested files and one settled credit charge. Downloaded MP4 plays and the correction appears in burned-in captions and SRT. Duplicate approval returns the same task without another charge. Download links are short-lived; confirm actual downloaded bytes, not only streaming navigation.

### P5 — Cancel an active task

Prompt: “Cancel that export.”

Request and approve another short export using available reviewer credits, then request cancellation while it is queued/running. Read task and credit state until terminal.

Expected: successful cancellation ends in `cancelled`, reserved credits are released, and no completed exports remain for that task. If it finishes before cancellation is accepted, record the race and rerun once with a task that remains active; a completed task is not a successful cancellation test. Do not claim cancellation guarantees an already-finished task can be undone.

## Negative cases — exactly three

### N1 — Private-network source URL

Prompt: “Create captions from http://127.0.0.1:3101/private.mp4.”

Attempt that source through `create_caption_project`; inspect the returned import task if creation is asynchronous.

Expected: source import fails closed with `SOURCE_URL_REJECTED`; no private-network bytes are ingested, no transcription or paid export succeeds, and the error contains no sensitive response body. A project/task record can exist before asynchronous validation finishes; its existence is not an SSRF failure.

### N2 — Stale editor version

Read a project version, make one valid change, then submit a second update with the old `expectedVersion`.

Expected: `VERSION_CONFLICT` and no application of the stale edit. Re-reading shows the first valid change preserved. A user-facing request should explain that the project changed and reload it, rather than silently overwriting it.

### N3 — Approval for an invalidated quote

Get an unapproved export quote, edit the project, then approve the old quote with its original cost.

Expected: `QUOTE_INVALIDATED`; no new task/reservation/charge for the stale quote. Request a fresh quote and return it to the user for new approval. Expired quotes may return `QUOTE_EXPIRED`; keep this execution within the TTL to test invalidation specifically.

## Release notes — copy this field

First directory release of ClipSubtitles. Upload a video, generate word-timed captions, review and correct words, choose a caption style, and preview it over your footage. Review the exact export settings and credit cost before approving an export with existing account credits. Download captioned video and subtitle files, follow task progress, and cancel work while it is still active. Projects can also be reopened in the ClipSubtitles web editor.

## Concrete unresolved gates

- **Commerce:** current `packages/server/src/mcp/widget-start-approval.ts` presents “Add credits to continue” and “View credit options” linking to `/pricing`. `packages/server/src/mcp/server.ts` tells the assistant to ask the user to open pricing and retry after checkout. This is a digital-credit upsell route. OpenAI permits access with existing paid entitlements and informational entitlement explanations, but disallows digital-credit sales/upsells and links that initiate upgrade or purchase. Remove the transactional promotion from the MCP journey or replace it with a genuinely informational unavailable-feature path; verify the full low-balance flow before checking commerce attestations. Existing credit consumption is not itself proof that all paid use is forbidden.
  A corrective code branch `fix/mcp-existing-credit-access` is being prepared separately; this packet does not claim it deployed.
- **Annotations:** reconcile the source flags with current review guidance before entering the draft justifications in `tool-justifications-1.0.0.md`. In particular, external reads are not necessarily publicly visible writes, and settled credit consumption can be irreversible.
- **Reviewer access and execution:** secure account provisioning, seeded sample, credit balance, all eight live cases, revocation/cross-workspace security evidence and independent review remain unverified by this packet.
- **Portal and assets:** current saved scan/domain/identity readbacks, three correctly sized screenshots, logos, availability selection, and owner-reviewed policy statements are separate gates.
- **Import JSON:** no local shared `chatgpt-app-submission` skill or official `chatgpt-app-submission.json` schema was located in this bounded lookup. Do not invent JSON keys or imply the capability manifest is the portal importer format. Manual form fields remain usable; obtain the exact linked skill/schema from the portal before generating an import file.

Sources checked 2026-09-05: [submission requirements](https://developers.openai.com/plugins/deploy/submission-errors), [commerce and monetization](https://developers.openai.com/plugins/app-guidelines#commerce-and-monetization), [MCP review requirements](https://developers.openai.com/plugins/deploy/app-review). Implementation basis: `packages/contracts/src/mcp.ts`, `packages/contracts/src/limits.ts`, `packages/server/src/services/captions.ts`, `packages/server/src/services/projects.ts`, and `packages/server/src/mcp/upload-tool.ts`.
