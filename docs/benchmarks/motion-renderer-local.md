# Motion renderer bake-off — 2026-08-29

This is a local architecture benchmark, not a Cloud Run capacity claim. It is
reproducible with `pnpm fixtures:build && pnpm benchmark:motion`; generated
videos, contact sheets, JSON, and the run report live under
`.data/motion-benchmark/` and are intentionally not committed.

## Fixture and controls

- Synthetic `clean-en-product-demo.mp4`, first 6 seconds
- 720×1280, 30 fps, H.264/AAC, `standard` quality
- Identical transcript, segmentation, layout, fonts, and motion evaluator
- Warm Remotion number excludes the one-time 93.5 MB Chrome download
- Full-frame and caption-band Skia differ only in the RGBA raster region and
  FFmpeg overlay y-coordinate

## Warm local result

| Approach | Wall time | Raw bytes piped | Raster CPU | Outcome |
|---|---:|---:|---:|---|
| Sparse PNG control | 0.82–0.86 s | n/a | n/a | Fastest still-state control; no easing |
| Full-frame Skia pipe | 0.76–0.81 s | 632.8 MiB | 177–202 ms | Smooth, but copies every pixel |
| Cropped-band Skia pipe | 0.48–0.55 s | 143.4 MiB | 115–134 ms | Selected production lane |
| Remotion / Chromium | 4.11–4.47 s | n/a | n/a | Smooth DOM reference; much heavier |

The caption band was 720×290 at y=975. It removed 77.3% of raw pipe traffic,
was 30–41% faster than full-frame across warm repeats, and produced SSIM
1.000000 against the full-frame result. A regression
test also requires byte-identical encoded output between the two Skia modes.

Process RSS in the generated report is sampled sequentially and is not used to
rank the lanes because allocator high-water marks carry between runs. The
production memory argument instead rests on a hard one-frame backpressure
contract plus a 143.4 MiB total stream delivered over time, not retained at
once. Isolated Linux container RSS remains a deployment gate.

## Visual review

The generated eight-frame sheets were inspected at source pixels for:

- soft rise with opacity, translation, scale, and blur settling
- closed-form spring pop with bounded overshoot and an exact final frame
- sliding karaoke highlight with active-word scale interpolation
- full-frame versus cropped-band equivalence
- Skia versus Remotion at the same timestamp

Both animated engines were smooth. Skia retained the existing approved Canvas
stroke/shadow character more closely, while avoiding Chromium. Full-frame and
cropped-band Skia were visually and numerically identical.

## Decision and remaining gate

Ship sparse PNG for motion `none` and cropped-band Skia + one FFmpeg process for
named motion. Keep full-frame mode benchmark-only and Remotion optional for
future compositions that genuinely require DOM/full-scene effects. Before
production sizing, rerun the benchmark in the pinned Linux image at 2/4/8 vCPU,
then run the codec torture corpus and a 500-job multi-instance soak.
