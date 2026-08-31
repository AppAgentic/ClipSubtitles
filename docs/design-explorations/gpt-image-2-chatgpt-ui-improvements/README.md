# GPT Image 2 — ChatGPT app UI improvements

Reference-preserving UI explorations generated from the five live ClipSubtitles
widget states on 2026-08-31. These are design concepts, not production UI assets.

## Shared prompt direction

- Product: an agent-operated video-captioning service embedded in ChatGPT.
- Tone: a premium, quiet production utility for creators.
- System: warm near-black and charcoal, warm off-white text, orange reserved for
  primary or active states, precise sans-serif typography, solid separators,
  strong contrast, and restrained density.
- Preserve: real workflow, controls, copy, costs, stage states, and human approval.
- Avoid: standalone-dashboard chrome, fake data, analytics, internal infrastructure
  language, decorative AI motifs, neon gradients, glassmorphism, and impossible UI.

## State briefs

1. **Upload** — start from either a new local video or an existing ChatGPT file;
   keep both source choices distinct and make the upload affordance immediately clear.
2. **Style selection** — compare Clean, Bold Pop, Lower Third, Karaoke, and Minimal
   using useful caption previews; retain Minimal as the selected starting point.
3. **Approval** — preserve the exact MP4 + SRT, 1080p, 0:58, 10-credit quote and
   explicit approval boundary; nothing is charged or exported before approval.
4. **Progress** — show Preparing video complete, Adding captions active at 68%,
   Packaging files next, continued chat availability, and cancellation.
5. **Editor** — retain scene navigation, dominant vertical-video preview, word-level
   correction, current Minimal style, style comparison, saved state, and fullscreen.

The editor concept received one targeted correction after generation so scene 2 and
its displayed word tokens describe the same active caption. No application code was
changed during this exploration.
