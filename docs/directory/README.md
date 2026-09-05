# Directory readiness packet (Phase 4)

**Status: PREPARED, NOT SUBMITTED.**

Current status and verified demo URL: [submission-status-2026-09-05.md](submission-status-2026-09-05.md). This dated audit supersedes legacy pre-deploy claims and form limits below. Nothing in this folder has been sent to the
ChatGPT/OpenAI apps directory, the Anthropic/Claude connector directory, or any
other listing. Submission is an explicit approval gate — see
`PARKED_ACTIONS.md` (gate 6) — and depends on gates 1–3 (staging deploy,
WorkOS production client, domain/TLS) landing first.

This packet is the reviewable input for that decision. Every claim in it is
backed by code or a check you can run locally; anything that is not yet true
in production is marked **[after deploy]**.

| File | What it is | Consumed by |
| --- | --- | --- |
| `capability-manifest.json` | Machine-readable description of the connector: endpoint, transport, auth, scopes, the eight tools, side effects, billing, limits, data handling | Directory submission form, internal review |
| `listing-copy.md` | Human-facing name, tagline, descriptions, category, screenshots list, "does not do" statements | Directory listing fields |
| `reviewer-fixture.md` | A scripted end-to-end run a directory reviewer (or we, before submitting) can follow against staging or local mock auth, with expected outputs | Reviewer instructions field |
| `starter-prompts.md` | Suggested first prompts, phrased so the model reaches for the right tool and asks before spending credits | Directory "starter prompts" |
| `submission-checklist.md` | Pre-flight checklist: what must be true before the form is filled in, who approves, what evidence to attach | Release owner |
| `cimd-dcr-notes.md` | How clients register: Dynamic Client Registration locally today, CIMD/DCR through WorkOS AuthKit in production; the exact settings and how to verify | Auth/infra owner |

## Verify locally (no external calls)

```bash
pnpm dev                    # API :3101, worker, web :3100 (mock auth)
pnpm mcp:conformance        # initialize → list tools → full tool workflow over Streamable HTTP
curl -s http://localhost:3101/.well-known/oauth-protected-resource | jq
curl -s http://localhost:3101/llms.txt
pnpm openapi:emit && git diff --stat docs/api/openapi.json   # must be empty
```

The conformance run exercises the same tool sequence as `reviewer-fixture.md`.
