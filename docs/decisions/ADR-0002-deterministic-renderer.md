# ADR-0002 — Deterministic canvas + ffmpeg renderer (Remotion optional)

**Date:** 2026-08-29 · **Status:** accepted

## Context

The contract names Remotion and FFmpeg. The local ffmpeg build has no `libass`
or `drawtext`, Remotion requires a Chromium download, and the acceptance gates
demand deterministic repeat renders and sub-second editor feedback that matches
the export.

## Decision

- The default renderer (`RENDERER=ffmpeg`) has two deterministic lanes. Motion
  `none` rasterizes each distinct caption state once with `@napi-rs/canvas`,
  writes an ffconcat timeline, and composites it with ffmpeg. Named motion
  presets evaluate bounded cubic or closed-form spring curves on the exact
  output frame grid, rasterize only a padded full-width caption band, and feed
  straight RGBA to one ffmpeg process with one-frame backpressure. The source
  is decoded once; animation frames are never written to disk.
- Motion is part of `StyleConfig` and the content hash. The supported launch
  presets are `soft-rise` (fade/rise/blur), `spring-pop`, and
  `karaoke-slide`; `none` is the still/control path.
- Full-frame raw streaming exists only as a benchmark control. It is not a
  production fallback.
- The browser overlay uses the same layout and motion evaluators with a canvas text measurer
  over the same TTFs, so the editor is WYSIWYG for text/style changes with no
  server round trip.
- A Remotion composition consuming the same layout and motion evaluators is kept as an
  optional second renderer behind `RENDERER=remotion` (needs Chromium).

## Consequences

- `pnpm smoke:render` proves byte-identical outputs across runs.
- `pnpm benchmark:motion` compares sparse PNG, full-frame Skia, cropped-band
  Skia, and warm Remotion under the same fixture. The 2026-08-29 local 720p
  repeated local canaries found the cropped band 30–41% faster than full-frame,
  with 77.3% fewer raw bytes and SSIM 1.000000; warm Remotion was 7.5–9.3x
  slower than the cropped band. These are local Apple Silicon results, not
  Cloud Run capacity claims.
- Container startup must verify Skia, fonts, FFmpeg codecs, and the selected
  renderer; capability mismatch fails rather than silently changing lanes.
- Visual safe-placement, face detection, OCR, and auto-repositioning remain out of scope; only explicit positions plus a fit-to-width safety rule exist.
