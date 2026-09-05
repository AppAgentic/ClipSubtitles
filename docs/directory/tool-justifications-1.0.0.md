# Tool annotation justification draft — 1.0.0

Source audited 2026-09-05: `packages/contracts/src/mcp.ts` and `packages/server/src/mcp/upload-tool.ts`. These are proposed explanations of current behavior, **not approved portal attestations**. Reconcile flagged discrepancies, deploy any source corrections, then rescan before pasting. Flags below are current source values in read-only / open-world / destructive order.

| Tool | Current flags | Read-only justification | Open-world justification | Destructive justification |
| --- | --- | --- | --- | --- |
| `create_caption_project` | false / true / false | Creates a private project and may enqueue an import. | Fetches a caller-supplied public URL or temporary attachment URL. **Review required:** current OpenAI guidance defines this flag around publicly visible writes; importing media is an external read, not publication. | Creates new project/source records without deleting an existing project. |
| `generate_captions` | false / false / false | Starts a transcription job and commits transcript, caption pages and project version. | Uses private transcription processing; does not post media or captions publicly. | **Review required:** confirm regeneration eligibility and retained revisions before claiming replacement of existing captions is reversible. |
| `get_caption_project` | true / false / false | Retrieves only the signed-in workspace's project and bounded transcript data. | Reads private application records without public publication. | Does not remove or overwrite project content. |
| `update_caption_project` | false / false / false | Changes words, timing, style, placement or project title after a version check. | Updates private project data without public posting. | Word edits create a retained child transcript revision (`patchProject`); style/pages/title are committed to current project state. **Review required:** confirm recovery of overwritten non-transcript structure before treating every mode as nondestructive. |
| `render_caption_export` | false / false / false | Creates a quote or starts a render and reserves/settles credits after explicit approval. | Produces private downloadable output; does not publish to social media or other public systems. | **Review required:** success settles a credit transaction. Quote approval and exactly-once billing are safeguards, not evidence the transaction is reversible. Current false may require correction. |
| `get_caption_task` | true / false / false | Reads task state and completed export metadata. | Reads private task data; signed output access does not publish it globally. | Does not cancel, delete or modify the task. |
| `cancel_caption_task` | false / false / false | Requests cancellation of queued/running work and releases reserved render credits when cancelled. | Changes a private worker task only. | **Review required:** cancellation is terminal and discards outputs for that task; confirm whether the appropriate definition treats this as irreversible. Source media/project remains available for a new task. |
| `get_caption_style_catalog` | true / false / false | Retrieves presets and bounded style guidance only. | Reads the first-party catalog. | Does not change projects or delete data. |
| `open_caption_start` | true / false / false | Presents the start UI; the tool itself does not create a project until a separate user upload action. | Presents first-party UI without public writes. | Does not overwrite or delete content. |
| `show_caption_style_picker` | true / false / false | Retrieves project and presets to display; applying a style is a separate update tool call. | Displays private project data and first-party presets. | The presentation call does not mutate the project. |
| `open_caption_editor` | true / false / false | Retrieves project and a bounded word window for review; edits use separate version-checked calls. | Displays the user's private content only. | Opening the editor does not overwrite content. |
| `open_caption_progress` | true / false / false | Reads task progress for one updating card. | Displays private job/output state without publishing. | Does not start/cancel/change work. |
| `prepare_caption_upload` (app-only) | false / false / false | Creates a project or short-lived upload target for a user-selected file. | Uploads into private first-party storage; no public publication. | Prepares upload without deleting an existing project; uploaded-source reuse is checked before preparing another target. |

OpenAI's current [review guidance](https://developers.openai.com/plugins/deploy/app-review) calls for annotations to reflect every mode, including indirect effects; confirmations do not automatically make an irreversible action nondestructive. Do not invent rationales solely to satisfy a form.

## UI domains — proposed explanations

Source `packages/server/src/mcp/ui.ts` requests connect/resource access to the configured API and web origins, with redirects to the web origin. It does not declare external `frame_domains`.

- `https://api.clipsubtitles.com`: first-party authenticated upload, project/task data and media endpoints needed for caption playback and workflow updates.
- `https://clipsubtitles.com`: first-party web editor, upload/help handoff and application resources. Review the current pricing redirect separately under the commerce gate.

If the live scan reports external frame domains, inspect that exact output and supply the actual embedded content and purpose. Do not paste a generic frame explanation for connect/resource domains or invent an iframe dependency.
