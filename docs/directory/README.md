# Directory readiness packet (Phase 4)

**Status: PREPARED, NOT SUBMITTED.**

Current dated portal evidence: [submission-status-2026-09-05.md](submission-status-2026-09-05.md). A ClipSubtitles draft and demo link have been saved; no final submission has occurred. Joe authorized completing preparation for review on 2026-09-05, with Submit explicitly withheld.

| File | Purpose |
| --- | --- |
| [listing-copy.md](listing-copy.md) | Proposed 1.0.0 listing fields with current limits |
| [starter-prompts.md](starter-prompts.md) | Three final candidate starter prompts and screenshot mapping |
| [reviewer-packet-1.0.0.md](reviewer-packet-1.0.0.md) | Exactly five positive and three negative tests, release notes, and concrete remaining gates |
| [tool-justifications-1.0.0.md](tool-justifications-1.0.0.md) | Current flags and draft rationale for 12 public tools plus app-only upload helper |
| [demo-recording-2026-09-05.md](demo-recording-2026-09-05.md) | Published demo evidence and limitations |

`capability-manifest.json`, `reviewer-fixture.md`, `submission-checklist.md` and `cimd-dcr-notes.md` retain historical engineering detail and may contain superseded pre-deployment values. Do not paste them into the portal unchanged. Use the dated packet and production readback for current OAuth scopes, source limits, field limits and saved state. None is the verified schema for the portal's JSON importer.

## Verify locally (no external calls)

```bash
pnpm dev                    # API :3101, worker, web :3100 (mock auth)
pnpm mcp:conformance        # initialize → list tools → full tool workflow over Streamable HTTP
curl -s http://localhost:3101/.well-known/oauth-protected-resource | jq
curl -s http://localhost:3101/llms.txt
pnpm openapi:emit && git diff --stat docs/api/openapi.json   # must be empty
```

The conformance run exercises the same tool sequence as `reviewer-fixture.md`.
