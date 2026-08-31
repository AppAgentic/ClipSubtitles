# GPT Image audience sketches — 2026-09-01

Three separate transparent-background assets generated with the built-in GPT
Image workflow for the landing-page section “Who is ClipSubtitles for?”. The
full-resolution PNGs are preserved here; performance-sized transparent WebP
derivatives live under `apps/web/public/marketing/`.

## Shared art direction

- extremely simple editorial line sketch;
- charcoal linework with one or two flat Apple-blue accents;
- one instantly readable symbol per audience, with no miniature scene;
- isolated mark with real alpha transparency;
- no text, logos, watermarks, UI chrome, card background or fake claims;
- readable when rendered at roughly 180 px wide.

## Assets and subject prompts

1. `creators-editors.png` — one hand holding a vertical video with two caption
   strokes.
2. `studios-agencies.png` — three related video frames under one approval
   check.
3. `agents-automation.png` — three workflow nodes flowing into one approved
   video.

The generation prompts explicitly requested genuine alpha transparency and
avoided scenes, people, 3D rendering, gradients, robot mascots, readable
interface text and decorative clutter. Alpha presence was verified on all
source PNGs and all three WebP derivatives.

## Prompt set

All three generations used this shared direction: “Create one extremely simple
editorial line-sketch asset for the ClipSubtitles landing page. Use sparse
charcoal-black ink linework with only one or two flat Apple-blue (#0071E3)
accent strokes. One central symbol only, generous empty space, and genuine
transparent alpha to the subject edges. No scene, background wash, glow,
shadow, texture field, card, words, logos, UI text, 3D or gradients. It must
read instantly at 180 px wide.”

The subject instruction appended to each prompt was:

1. Creators & editors — “One hand holding a vertical video outline with a play
   triangle and two caption strokes.”
2. Studios & agencies — “Three overlapping vertical-video outlines unified by
   one approval check.”
3. Agents & automation — “Three empty workflow nodes connected to one vertical
   video outline with one approval check.”

The image model's simplification edits returned near-white preview mattes. A
deterministic threshold removed only those near-white matte pixels before the
final alpha verification; the black and blue generated linework is unchanged.
