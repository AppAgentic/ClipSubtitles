# Workflow sketches

Sparse transparent line-art illustrations for the landing-page workflow section.

- `words.png`: audio becoming editable caption lines
- `look.png`: a vertical video with styled captions
- `download.png`: a finished captioned video ready to download
- `contact-sheet.png`: the three assets on a neutral review canvas

The assets were generated with GPT Image using the existing ClipSubtitles audience illustrations as the visual reference. The prompt requested simple black marker lines, a single adaptive-blue accent, generous empty space, no text, no card, no shadow, and a transparent background.

Some generated files arrived with an opaque near-white/checkerboard matte despite the transparency request. Those files were normalized with a deterministic near-white matte removal, then all source PNGs and optimized WebP files were verified as 720×520 RGBA assets with a real alpha channel. Production WebP copies live in `apps/web/public/marketing/`.
