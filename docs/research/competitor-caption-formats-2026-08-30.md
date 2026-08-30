# Competitor caption-format review — 2026-08-30

## Scope and evidence

Read-only review of official public product documentation and finished demo outputs. Eight output videos were downloaded to a temporary directory, inspected with Gemini 3.7 Flash as a multimodal motion-typography critic, and then deleted from the provider after analysis. Competitor media is not committed to this repository.

Sources:

- ZapCap animated-caption API and four official demos: `Beast`, `Hormozi`, `Tracy`, `Devin` — https://zapcap.ai/api/animated-captions/
- ZapCap API render controls — https://platform.zapcap.ai/docs/guides/captions-configuration/
- Captions style controls and AI emoji behavior — https://help.captions.ai/docs/captions/styles
- Captions keyword emphasis guidance — https://captions.ai/help/guides/engagement/highlight-keywords
- Captions official `Stack`, `Pop`, and `Align` preview videos — https://captions.ai/styles/stack
- Submagic official caption-generator demo — https://www.submagic.co/features/auto-video-editor
- VEED animated subtitle families and controls — https://www.veed.io/tools/add-subtitles/animated-subtitles

## Transferable format families observed

1. **High-energy creator pop** — one to three large words, black outline, bright active word, restrained spring scale, optional emoji above a matched keyword.
2. **Editorial box/badge** — clean grotesque or mono type, solid rectangular or rounded plate, hard cut or subtle rise, no emoji.
3. **Aesthetic capsule** — rounded type in a pill, compact entrance scale and a softer palette.
4. **Stacked token highlight** — a readable multi-line phrase stays in place while the active word receives its own moving background.
5. **Rapid single-word display** — one word at a fixed anchor for high speech rates and minimal eye travel.

These are mechanics, not competitor templates. Do not reuse competitor names, logos, proprietary assets, or exact trade dress.

## Agent control surface implied by the outputs

- preset as a coherent starting point;
- font family, weight, size and casing;
- explicit vertical position and safe margin;
- words and lines per caption page;
- text, outline, shadow and plate colours;
- active-word fill or pill and bounded scale;
- entrance/exit/word-transition motion;
- automatic keyword emoji on/off, timing, position, size and animation;
- free preview before final render.

## Implemented from this review

- Added `get_caption_style_catalog`, a read-only MCP tool returning every preset and guidance for the complete bounded style surface.
- Made font family and casing selectable in the web inspector. All font and layout attributes remain available through `set_style` to API/MCP agents.
- Added deterministic automatic keyword emojis as visual overlays. They do not alter transcript words and therefore do not enter SRT/VTT output.
- Added emoji timing (active word, keyword-through-page-end, or full-page hold), position (`above-word` or `above-caption`), relative size, and optional pop animation.
- Bundled fixed Twemoji SVG assets so canvas/FFmpeg, browser preview and Remotion render offline from the same geometry.
- Existing segmentation already supports the observed rapid single-word and short-phrase families through `resegment.maxWordsPerPage`; existing presets cover pop, badge, pill, stacked highlight and minimalist treatments.

## Deliberately deferred

- Per-project custom font upload: requires font-file validation, licensing policy, storage, cache limits and deterministic registration in every renderer.
- Free-floating stickers, B-roll, scene cuts and automatic face-aware movement: those are full video-editor features rather than caption-format primitives, and can occlude faces or make renders non-deterministic.
- Generative emoji selection: the first version uses a bounded semantic dictionary. A model-assisted suggestion pass can be added later, but must return explicit decorations for preview/approval rather than silently modifying captions.

## Visual constraints retained

- Keep spring scale at or below `1.3×`; larger amplitudes collide with adjacent words.
- Keep social pop captions to short display units; long sentences force unreadably small text.
- Do not default large captions to the visual centre of talking-head video.
- Always retain outline, shadow or plate contrast over variable footage.
