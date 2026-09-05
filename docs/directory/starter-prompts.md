# OpenAI starter prompts — 1.0.0

Exactly three proposed listing prompts, prepared for review. Each is unique, one line, below 128 characters, and contains no app mention. These replace the former ten-prompt brainstorming library.

| # | Prompt | Expected flow | Screenshot subject |
| --- | --- | --- | --- |
| 1 | Add captions to a video I upload and let me choose a style. | `open_caption_start` → upload → `generate_captions` → one progress card → `open_caption_editor` | Real uploaded talking-head video with captions and visible styles |
| 2 | Help me review my video's captions and correct a word before exporting. | Identify the user's existing project or request a video; `open_caption_editor` → explicit word correction through `update_caption_project` | Actual saved correction and video, with no private account data |
| 3 | Show me the cost to export my captioned video as an MP4 with an SRT file. | Identify a ready project; `render_caption_export` without approval → show quote and wait | Real quote with output types and visible approval control |

Capture one actual PNG/JPEG UI image per prompt at 706 pixels wide and 400–860 pixels tall. These are capture subjects, not completed assets. Avoid synthetic or mock-auth listing screenshots. Prompt 2 and 3 need a prepared project; a fresh chat must request the video/project rather than inventing a project ID. `open_caption_progress` opens one updating card; subsequent polling uses `get_caption_task`.

[OpenAI screenshot and prompt requirements](https://developers.openai.com/plugins/deploy/submission-errors), checked 2026-09-05.
