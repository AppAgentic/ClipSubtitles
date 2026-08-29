# Listing copy — ClipSubtitles

Draft copy for directory listing fields. Plain statements only; every feature
named here exists in the repository today. **Not submitted.**

## Name

ClipSubtitles

## Tagline (≤ 60 chars)

Word-timed captions for short video, rendered exactly as quoted.

## Short description (≤ 160 chars)

Generate, edit and render burned-in or overlay captions for vertical clips. Immutable quotes, credit billing charged once, exports you can re-download.

## Long description

ClipSubtitles turns a clip into word-timed captions and renders them as a
finished MP4, a transparent ProRes overlay, or SRT/VTT files.

Working with an assistant, you can:

- **Create a caption project** from a video URL or an upload.
- **Generate captions** with word-level timing, automatically segmented into
  readable pages and lines. Segmentation respects your manual splits and merges.
- **Edit precisely** — change words, split or merge lines, move page boundaries,
  and restyle (font size, position, colours, highlight mode) through a versioned
  project. Every change bumps the version and content hash, so nothing renders
  that you did not see.
- **Preview** a short window before committing.
- **Render with an immutable quote.** Exports are priced up front from the
  exact project version and settings. You approve that quote; if anything
  changes, the quote is void and you get a new one. Credits are reserved when
  you approve, charged once on success, and released on failure or cancel.
- **Recover your work** in the web studio at any time: the same projects,
  versions, tasks and downloads are there.

ClipSubtitles is built agent-first: a typed REST API with OpenAPI, and an MCP
server with eight tools over Streamable HTTP, share one contract with the web
studio.

## Category

Video & media / Productivity

## What it does not do (say this in the listing)

- It does not translate, dub, or generate video.
- It does not post to social platforms or touch any account other than yours.
- It does not treat transcript or media content as instructions: the caption
  text is data, and tools return it under an explicit content notice.
- It does not charge without an approved quote, and never charges twice for
  the same task.

## Screenshots to attach **[after deploy]**

Captured by `apps/web/e2e/studio.spec.ts` into `apps/web/e2e/.results/` at
1440×900 and 390×844:

1. `library` — project library with statuses
2. `editor` — video with live caption overlay, word timing list, style panel
3. `render-quote` — the immutable quote card before approval
4. `render-done` — completed render with downloads and refreshed credits

Use production-styled captures (real domain, no mock-auth banner) when the
staging environment exists.

## Support and policy links **[after deploy]**

- Privacy policy: `https://clipsubtitles.com/privacy`
- Terms: `https://clipsubtitles.com/terms`
- Support: a monitored support address on the clipsubtitles.com domain
- `llms.txt`: `https://api.clipsubtitles.com/llms.txt`

These pages do not exist yet; they are gate-6 prerequisites.
