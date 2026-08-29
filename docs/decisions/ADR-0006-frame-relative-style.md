# ADR-0006 — Frame-relative style, fit-to-width, explicit positions

**Date:** 2026-08-29 · **Status:** accepted

## Context

Short-form video is mostly 1080×1920 but landscape sources exist. Font sizes
expressed as a fraction of frame *height* overflowed the width of vertical
frames; auto-repositioning is out of scope by product decision.

## Decision

- `fontSizePct`, stroke, shadow, plate padding, and radius are fractions of the
  **shorter** frame side; vertical offsets (`safeMarginPct`,
  `lowerThirdOffsetPct`) are fractions of height. Presets are calibrated so their
  longest allowed line fits the 90 % safe width at 1080p in both orientations.
- `layoutCaption` applies a fit-to-width rule (shrink to at most 55 % of the
  styled size) when a line would still overflow the horizontal safe area; QA
  flags overlong lines.
- Positions are exactly `top | center | lower-third | bottom`; no content-aware placement.

## Consequences

- The same numbers render identically in the browser overlay, the rasterizer, and Remotion.
- Users pick a position; the system never moves captions on its own.
