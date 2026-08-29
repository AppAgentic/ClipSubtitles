# ADR-0002 — Deterministic canvas + ffmpeg renderer (Remotion optional)

**Date:** 2026-08-29 · **Status:** accepted

## Context

The contract names Remotion and FFmpeg. The local ffmpeg build has no `libass`
or `drawtext`, Remotion requires a Chromium download, and the acceptance gates
demand deterministic repeat renders and sub-second editor feedback that matches
the export.

## Decision

- The default renderer (`RENDERER=ffmpeg`) rasterizes each distinct caption
  state once with `@napi-rs/canvas` using the shared `layoutCaption` engine and
  bundled Inter faces, writes an ffconcat timeline, and composites with ffmpeg
  `overlay` under bit-exact flags. Outputs: H.264/AAC MP4, ProRes 4444 alpha
  overlay MOV, SRT, VTT, and 360/480/720p previews.
- The browser overlay uses the same layout engine with a canvas text measurer
  over the same TTFs, so the editor is WYSIWYG for text/style changes with no
  server round trip.
- A Remotion composition consuming the same layout engine is kept as an
  optional second renderer behind `RENDERER=remotion` (needs Chromium).

## Consequences

- `pnpm smoke:render` proves byte-identical outputs across runs.
- Visual safe-placement, face detection, OCR, and auto-repositioning remain out of scope; only explicit positions plus a fit-to-width safety rule exist.
