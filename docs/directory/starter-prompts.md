# OpenAI starter prompts — 1.0.0

Exactly three proposed listing prompts, prepared for review. Each is unique, one line, below 128 characters, and contains no app mention. These replace the former ten-prompt brainstorming library.

| # | Prompt | Expected flow | Screenshot subject |
| --- | --- | --- | --- |
| 1 | Add captions to a video I upload and let me choose a style. | `open_caption_start` → upload → `generate_captions` → one progress card → `open_caption_editor` | Real uploaded talking-head video with captions and visible styles |
| 2 | Help me review my video's captions and correct a word before exporting. | Identify the user's existing project or request a video; `open_caption_editor` → explicit word correction through `update_caption_project` | Actual saved correction and video, with no private account data |
| 3 | Create a captioned version of my video that I can download and share. | Identify or create a captioned project; `render_caption_export` without approval → show quote → wait for explicit approval → render → downloads | Actual completed export with playable captioned video and download controls |

Capture one actual PNG/JPEG UI image per prompt at 706 pixels wide and 400–860 pixels tall. These are capture subjects, not completed assets. Avoid synthetic or mock-auth listing screenshots. Prompt 2 needs an existing project or a requested upload; prompt 3 can start from a new upload. A fresh chat must request the video/project rather than inventing a project ID. The result-led third prompt is not permission to spend credits: show the quote and obtain explicit approval before rendering. `open_caption_progress` opens one updating card; subsequent polling uses `get_caption_task`.

[OpenAI screenshot and prompt requirements](https://developers.openai.com/plugins/deploy/submission-errors), checked 2026-09-05.
