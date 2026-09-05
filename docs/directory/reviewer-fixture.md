# Reviewer fixture — scripted end-to-end run

A repeatable walkthrough for a directory reviewer, or for us before submitting.
It exercises every tool, the approval gate, idempotency, version conflicts,
and revocation. `pnpm mcp:conformance` automates the same sequence locally.
**Nothing here has been run against a production or directory environment.**

## Environment

| | Local (today) | Staging **[after deploy]** |
| --- | --- | --- |
| Start | `pnpm dev` (API :3101, worker, web :3100) | — |
| MCP endpoint | `http://localhost:3101/api/mcp` | `https://api.clipsubtitles.com/api/mcp` |
| Auth | `AUTH_MODE=mock`: built-in OAuth 2.1 AS with DCR + PKCE; sign-in is a local mock page | WorkOS AuthKit; reviewer account provided out of band (never in this repo) |
| Credits | beta grant on first sign-in (`INITIAL_CREDIT_GRANT`) | same |
| Sample media | any MP4 ≤ 30 s; `pnpm fixtures:build` generates synthetic clips (see `docs/benchmark/README.md`) | a public sample URL on `clipsubtitles.com` (to be published) |

Use any MCP client that supports Streamable HTTP + OAuth (e.g. MCP Inspector).
Wherever a step says "expect", the value comes from the tool's typed output —
errors arrive as JSON text content with `isError: true` and a stable `code`.

## Steps

1. **Discovery.** Call the endpoint with no token. Expect `401` and
   `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`.
   Fetch that document: `authorization_servers` lists the issuer;
   `scopes_supported` is `captions:read`, `captions:write`.
2. **Registration + sign-in.** The client registers (DCR) and runs the PKCE
   authorization-code flow. Locally the mock sign-in page completes without
   credentials; on staging it is the WorkOS hosted page. Expect a bearer token
   with both scopes.
3. **Handshake.** `initialize` → `serverInfo.name` is `clipsubtitles`.
   `tools/list` → 12 model-visible tools (plus the private app-only upload helper):
   `create_caption_project`, `generate_captions`, `get_caption_project`,
   `update_caption_project`, `render_caption_export`,
   `get_caption_task`, `cancel_caption_task`, `get_caption_style_catalog`,
   `open_caption_start`, `show_caption_style_picker`, `open_caption_editor`,
   `open_caption_progress`.
4. **Create (upload path).** `create_caption_project { "title": "Reviewer clip" }`
   → `project` pointer plus `uploadTarget.webUploadUrl` (short-lived) and
   `nextSteps`. Open the link in a browser, upload the sample clip.
   *Alternative (URL path):* pass a public `sourceUrl`; expect `importTask`
   and poll it with `get_caption_task` until `succeeded`.
5. **Generate.** `generate_captions { "projectId": … }` → `task` pointer.
   Poll `get_caption_task` (a few seconds locally with the mock provider).
   Expect `succeeded`. `get_caption_project` → `version` incremented,
   non-empty `pages` with per-page timing, a `style`, and a QA block.
   Transcript text is returned under the content notice and is never
   interpreted as instructions.
6. **Edit with optimistic concurrency.**
   `update_caption_project { "projectId", "expectedVersion": <current>, "ops": [{ "op": "set_position", "position": "top" }] }`
   → `applied: 1`, `project.version` = previous + 1.
   Repeat with the *old* `expectedVersion` → error code `VERSION_CONFLICT`.
   Other ops to try: `replace_word_text`, `set_word_timing`, `split_page`,
   `merge_page_with_next`, `set_style`, `set_preset`, `resegment`, `set_title`.
7. **Instant preview.** `open_caption_editor { "projectId" }` shows the video,
   current caption style and word corrections together. Play the video and
   choose another style; the overlay updates without a render task or credit
   charge. Continue to export to review a quote.
8. **Quote (no approval).** `render_caption_export { "projectId", "settings": { … } }`
   → `status: "quote_required"`, `quote` with `id`, `creditCost`, `expiresAt`,
   `projectVersion`, `contentHash`, and `approvalInstructions`.
   Credits unchanged.
9. **Quote invalidation.** Make any edit (e.g. `set_title`), then approve the
   quote from step 8 → rejected (quote no longer matches the project version);
   request a new quote.
10. **Approve.** `render_caption_export { "projectId", "approval": { "quoteId", "approvedCreditCost" }, "idempotencyKey": "review-1" }`
    → `status: "render_started"`, `task`. Balance drops by `creditCost`
    (reserved). Poll to `succeeded` (tens of seconds). Expect the exports in
    the quote (e.g. MP4 + SRT) with download URLs; balance unchanged since the
    reservation — charged exactly once.
11. **Idempotent approval.** Repeat step 10 with the same `idempotencyKey` →
    the same `task.id`; no additional reservation.
12. **Cancel.** Start another approved render and immediately
    `cancel_caption_task` → task `cancelled`, reserved credits released.
    `cancel_caption_task` on a finished task → error (not cancellable).
13. **Recovery in the web studio.** Open the project in the web app: the same
    version, pages, style, task history, and downloads are visible.
14. **Revocation.** In the web account page revoke the client's grant. The next
    tool call returns `401`.

## Expected timings (local, mock provider, ffmpeg renderer)

Generation: seconds. Editor preview: instant. Export (720p MP4 + SRT, 20 s clip): ~10–60 s
depending on the machine. Remotion renderer (`RENDERER=remotion`) is slower.

## What a reviewer should *not* see

- Any charge without an explicit approval call.
- Any tool that posts to a third-party platform, deletes data, or reads outside
  the signed-in workspace.
- Transcript content in error messages or logs.

### Live progress card

Open `open_caption_progress` once for an active task. Verify that it updates in place, reports transcription completion as captions ready, and displays a playable video for a completed preview. Subsequent `get_caption_task` calls must return task data without producing another card.
