# GPT Image automation sketches — 2026-09-01

Three sparse, transparent line-sketch assets for the landing-page “AI and
automation” paths. Full-resolution PNG sources live here; optimized alpha WebP
derivatives live under `apps/web/public/marketing/`.

## Assets

1. `conversation.png` — two chat bubbles flowing into a video.
2. `workspace.png` — one document and cursor flowing into a video.
3. `automation.png` — three workflow nodes flowing into an approved video.

## Prompt direction

“Create one extremely simple transparent editorial line-sketch asset for the
ClipSubtitles AI and automation section. Use sparse charcoal-black hand-drawn
outlines with exactly one flat Apple-blue (#0071E3) accent. One central symbol
only, generous empty space, immediately readable at 160 px wide. No people,
scene, room, background, panel, wash, shadow, glow, blur, texture, lighting,
card, words, logos, detailed UI, 3D or gradients. Genuine fully transparent
alpha background.”

The subject prompt then specified conversation, workspace or automation. The
image model's flat-line edits returned near-white preview mattes, so a
deterministic threshold removed only those matte pixels before final alpha
verification. Generated black and blue linework was otherwise preserved.
