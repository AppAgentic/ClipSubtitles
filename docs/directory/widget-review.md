# Combined caption workspace review

The first post-transcription review presents source playback with synchronized captions and all 13 caption styles. Fullscreen expands the same workspace; word correction is secondary and caption navigation seeks the video. Saved edits reread the authoritative project, retain playback position, load bounded transcript windows, and ignore stale responses from a previous view.

Task polling is data-only. `open_caption_progress` intentionally opens one live card. Missing initial output remains loading; transient errors retain task state with bounded retries and manual recovery. The widget owns its frame consistently across start, progress, approval and review.

The source player streams fresh signed URLs through the existing API with `stream=1`; ordinary download redirects are unchanged. Source controls are explicit play/pause, seek and mute so Safari cannot move the video away from its sibling caption overlay through a native fullscreen button. Baked preview/export players keep native controls. Public bundled fonts permit cross-origin loading by the isolated widget.

## Local validation

- Repository lint, typecheck and production build pass.
- API tests cover signed streaming, Safari byte ranges, HEAD, expiry, ownership, renewal and unchanged downloads.
- Thirteen preset image comparisons match the shared export renderer (emoji excluded from pixel comparisons).
- Executable widget tests cover delayed host data, public tool errors, polling retries, cancellation, expiry, paid approval, long transcript windows, save/readback, cross-project races, fullscreen and playback controls.
- Desktop (1040 px) and mobile (390 px), light/dark, expanded workspace, corrections, start, disconnected progress and expired quote were visually inspected. No horizontal overflow or missing preset/font assets.
- Actual Safari local playback shows advancing video with caption overlay and the complete expanded workspace. Local harness tool responses and host fullscreen are simulated; its free-preview video is a fixture.

## Remaining release acceptance

The local desktop/mobile screenshots must receive the established visual approval before merge/deployment. Then refresh the private ChatGPT connector and verify the served revision, all 13 tools, first-review style selection, same-origin source playback, persistent edits, one live progress card and a real free render in the existing Safari conversation. Local fixture screenshots do not establish production iframe playback or real rendering. No paid export or directory submission is included in this validation.
