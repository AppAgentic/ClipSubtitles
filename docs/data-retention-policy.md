# Data retention policy

ClipSubtitles minimizes private media storage by default while leaving users a
short recovery window. Retention is based on the time an object becomes usable,
not the time its project was created.

| Data class | Default | Allowed user setting | Enforcement |
|---|---:|---:|---|
| Source video/audio | 30 days | 1–365 days | Daily sweep and immediate project deletion |
| Final exports | 7 days | 1–90 days | Daily sweep and immediate project deletion |
| Preview exports | 24 hours | Fixed | Daily sweep and immediate project deletion |
| In-progress render files | Task lifetime | Fixed | Removed on success publication, failure, cancellation, or lost lease |
| Upload targets | 1 hour | Fixed | Token expires; incomplete request bodies are never published |
| Signed playback/download URLs | 15 minutes | Fixed deployment setting | URL expires independently of object retention |
| Idempotency records | 7 days | Fixed | Daily maintenance |
| Open render quotes | 15 minutes | Fixed deployment setting | Expired by maintenance |

Transcript/project metadata remains available after its source media expires so a
user can continue editing captions and create text subtitle exports. Deleting a
project removes its source and export objects immediately and soft-deletes its
metadata for audit consistency.

## Enforcement and failure handling

- The authenticated maintenance scheduler wakes the scale-to-zero worker daily.
- A sweep handles up to 20,000 expired rows with 16 bounded deletion workers.
- A database row is marked purged only after every referenced object deletion
  succeeds. Provider failures remain eligible for the next sweep and are audited.
- Render artifacts use task-scoped prefixes, allowing cleanup to remove row-less
  partial outputs as well as published rows.
- GCS lifecycle deletion is a final orphan safety net. For R2, an equivalent
  provider lifecycle rule should be installed when the production bucket is
  provisioned; application retention remains authoritative because workspace
  settings differ.

The API and web UI expose the active source/export retention windows and each
object's exact expiry timestamp. Retention extensions are explicit workspace
settings; there is no indefinite-retention default.
