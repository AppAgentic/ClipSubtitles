# GPT Image audience sketches — 2026-09-01

Three separate transparent-background assets generated with the built-in GPT
Image workflow for the landing-page section “Who is ClipSubtitles for?”. The
full-resolution PNGs are preserved here; performance-sized transparent WebP
derivatives live under `apps/web/public/marketing/`.

## Shared art direction

- premium hand-drawn editorial ink sketch;
- graphite linework with restrained Apple-blue accents and pale blue wash;
- human, capable and calm rather than generic SaaS clip-art;
- isolated landscape vignette with real alpha transparency;
- no text, logos, watermarks, UI chrome, card background or fake claims;
- readable when rendered inside a roughly 320 × 180 px website card.

## Assets and subject prompts

1. `creators-editors.png` — one creator at an editing desk reviewing a vertical
   short-video frame, caption blocks and timing marks.
2. `studios-agencies.png` — two creative professionals reviewing a consistent
   family of captioned videos, shared style cues and an approval check.
3. `agents-automation.png` — one builder connecting an abstract agent node to
   input video, timed words, human approval and finished captioned output.

The generation prompts explicitly requested genuine alpha transparency and
avoided 3D rendering, neon gradients, robot mascots, stock-vector SaaS style,
readable interface text and decorative clutter. Alpha presence was verified on
all source PNGs and all three WebP derivatives.

## Prompt set

All three generations used this shared direction: “Create a premium,
hand-drawn editorial ink illustration for the ClipSubtitles website. Use loose
graphite-black linework, restrained Apple blue (#0071E3) accents, and a very
light blue watercolor wash. Keep the composition calm, human and elegant, with
the tactile confidence of an editorial technology sketch. Isolate the complete
landscape vignette on a genuinely transparent alpha background. No words,
letters, logos, watermarks, card, border, UI chrome, gradients, 3D rendering,
robot mascot, stock-vector SaaS style, or decorative clutter. It must remain
clear when displayed at roughly 320 × 180 pixels.”

The subject instruction appended to each prompt was:

1. Creators & editors — “Show one creator at a tidy editing desk, reviewing a
   vertical short-video frame on a laptop. Suggest animated caption blocks and
   word timing with abstract bars and marks, without readable text. Include a
   small camera and headphones. Make the person the clear focal point.”
2. Studios & agencies — “Show two creative professionals collaborating around
   several vertical captioned-video frames. Suggest a shared style board,
   reusable visual consistency and a clear approval check, without readable
   text. Make teamwork and repeatable delivery immediately understandable.”
3. Agents & automation — “Show one builder at a laptop connected to an elegant,
   abstract AI workflow: source video, timed words, style choice, human approval
   and finished captioned video. Use simple connected nodes and a prominent
   approval check. Do not depict a humanoid robot.”
