# Starter prompts

Suggested first prompts for the directory listing. Each one maps onto a real
tool path and none of them implies an action the server cannot do. Paid
renders always surface the quote first; the prompts are worded so the model
asks before spending credits. **Not submitted.**

| Prompt | Expected tool path |
| --- | --- |
| "Caption this clip: https://example.com/clip.mp4 — keep the captions at the bottom." | `create_caption_project` (sourceUrl, position via `generate_captions`) → poll `get_caption_task` → `generate_captions` → `get_caption_project` |
| "I have a video on my laptop. Set up a caption project and tell me where to upload it." | `create_caption_project` without `sourceUrl` → return the web upload link → wait for the user |
| "Show me the captions you generated and flag anything that looks mis-heard." | `get_caption_project` (pages, optionally `words=true` window) — model reports, does not rewrite words |
| "Fix the word at 00:12 — it should be 'Ruvix', not 'Rubik'." | `update_caption_project` with a word-text op and `expectedVersion` |
| "Move the captions to the top and make them a bit larger." | `update_caption_project` with style/position ops |
| "Split the second caption after 'tonight'." | `update_caption_project` with a page-split op |
| "Give me a quick preview before we render." | `render_caption_preview` (free) → `get_caption_task` → download URL |
| "How much would a 1080p MP4 plus SRT cost?" | `render_caption_export` **without** approval → show the immutable quote; do not reserve credits |
| "Go ahead and render it." (after a quote was shown) | `render_caption_export` with `approval: {quoteId, approvedCreditCost}` → `get_caption_task` until finished → download links |
| "Cancel that render." | `cancel_caption_task` → confirm reserved credits were released |

## Phrasing rules used above

- Never name a price or credit cost in the prompt — it comes from the quote.
- Never suggest the assistant can post the result anywhere; downloads only.
- Prompts that edit text name the exact word: edits are explicit per-word
  operations, never "clean up the transcript".
