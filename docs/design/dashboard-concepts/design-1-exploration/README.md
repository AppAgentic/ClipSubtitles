# Design 1 exploration: dashboard and ChatGPT plugin

Generated with GPT Image 2 on 2026-08-31 after Design 1, **Editorial production desk**, was selected. These are high-resolution interaction and visual-direction studies, not implementation specifications. Discard invented filenames, balances, limits, identities, timings, or copy that is not supported by the product.

## Product-owned surfaces

### Refined dashboard

The selected project is the primary working surface. Upload is compact, next actions use creator language (`Fix words`, `Try styles`, `Preview`, `Export`), and recent work remains visible without turning the home page into a settings screen.

### Agent connections

The connection page explains the customer outcome before setup mechanics: connect ChatGPT, ask naturally, and approve before export. Connection health and permissions are written in plain language. Developer setup remains secondary. The generated phrase `burn-in or sidecar captions`, if present, must not be copied into customer-facing implementation.

## ChatGPT-hosted plugin surfaces

The current OpenAI terminology is **plugin**: a package can include skills, an MCP server, and optional UI shared across ChatGPT and Codex. ClipSubtitles already exposes MCP tools, but it does not yet expose the optional UI resources shown here.

1. **Start card** — a single-purpose inline card for the attached video, language, and initial style. It has no internal navigation and at most two actions.
2. **Style review** — an inline carousel for visual alternatives plus one focused word correction. It is a review surface, not the full editor.
3. **Export approval** — a separate consequential-action boundary with files, resolution, fixed credits, and explicit approval. No paid render starts automatically.
4. **Progress and result** — an inline card updates in place from plain-language progress to downloadable files. Internal tasks, queues, hashes, and codecs stay hidden.
5. **Fullscreen editor** — a focused conversational review workspace for words, look, and position. The ChatGPT composer remains available, and the experience does not reproduce the full ClipSubtitles dashboard.

## Official documentation applied

- [Plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
- [UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines)
- [Define tools](https://developers.openai.com/plugins/plan/tools)
- [UI reference](https://developers.openai.com/plugins/reference)
- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [Add a ChatGPT UI](https://developers.openai.com/plugins/build/chatgpt-ui)
- [Connect and test in ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)

The concepts follow the documented constraints: system colors for core UI, restrained brand accents, single-purpose inline cards, no deep navigation or nested scrolling, carousels for visual alternatives, optional fullscreen for richer work, user-goal-oriented tools, and explicit confirmation for consequential actions.

## Implementation boundary

The web app should own account connection, project history, full editing, storage/retention, downloads, billing, and developer setup. ChatGPT should own conversational initiation, lightweight review, approval, progress, results, and a focused fullscreen correction experience. This keeps the plugin useful without making it a miniature copy of the product.
