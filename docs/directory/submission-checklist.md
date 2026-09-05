# Submission checklist — directory listing

> Current audit: [submission-status-2026-09-05.md](submission-status-2026-09-05.md).
> The checklist below is historical: production is live, OAuth uses OIDC scopes,
> and current OpenAI field limits/test-case/screenshot requirements supersede it.

- [x] Demo recording prepared, published and added to the submission packet:
  https://clipsubtitles.com/review/caption-workflow-20260905/index.html
- [x] Save the demo URL to the exact ClipSubtitles 0.1.0 portal draft;
  persistence verified by Exit and reopen in the ClipSubtitles project.

**Do not start the form until every box in "Before" is ticked and the release
owner has signed off.** Submission is gate 6 in `PARKED_ACTIONS.md`; this
checklist is what "ready" means. Nothing here has been done yet unless marked.

## Before (prerequisites — all external to this repository)

- [ ] Gate 1: staging deployment reachable over HTTPS at `api.clipsubtitles.com`
      and `clipsubtitles.com` (`API_PUBLIC_URL`/`WEB_PUBLIC_URL` set; signed URLs
      and OAuth metadata derive from them).
- [ ] Gate 2: production WorkOS AuthKit client created; `AUTH_MODE=workos`;
      RS256 verification pinned to the WorkOS JWKS (already implemented, config-gated).
- [ ] Gate 3: DCR (or CIMD) enabled on the WorkOS client — see `cimd-dcr-notes.md`.
- [ ] `https://api.clipsubtitles.com/.well-known/oauth-protected-resource` returns the
      resource metadata with `authorization_servers` = the WorkOS issuer and
      `scopes_supported` = `captions:read`, `captions:write`.
- [ ] `https://api.clipsubtitles.com/llms.txt` served (route exists; needs the domain).
- [ ] Privacy policy, terms, and support pages published on `clipsubtitles.com`.
- [ ] Retention policy documented on the privacy page and matching
      `RETENTION_*` config (sweeps are implemented in `services/retention.ts`).
- [ ] A reviewer account provisioned in WorkOS with the beta credit grant
      (`INITIAL_CREDIT_GRANT`). **Credentials are never stored in this repository**;
      hand them over through the directory's reviewer-credentials field only.
- [ ] `reviewer-fixture.md` executed end to end against staging by us, with the
      expected outputs confirmed and timings noted.
- [ ] `pnpm check`, `pnpm mcp:conformance`, `pnpm smoke:e2e`, `pnpm smoke:render`
      and the Playwright suite green on the commit being submitted.
- [ ] `docs/api/openapi.json` regenerated and committed for that commit.
- [ ] Brand assets exported: 512×512 logo, 1024×1024 logo, listing screenshots
      (see `listing-copy.md`).
- [ ] Legal/owner approval recorded (who, when) for: listing copy, privacy text,
      pricing disclosure ("credits reserved on approval, charged once on success").

## Form contents (copy from this packet)

- Name, tagline, descriptions, category → `listing-copy.md`
- MCP endpoint → `https://api.clipsubtitles.com/api/mcp` (Streamable HTTP, stateless)
- Auth → OAuth 2.1 with PKCE; resource metadata at the well-known URL above
- Scopes → `captions:read`, `captions:write`
- Tool list, side effects, billing statement → `capability-manifest.json`
- Starter prompts → `starter-prompts.md`
- Reviewer instructions → `reviewer-fixture.md`
- Data handling → `capability-manifest.json` → `dataHandling`

## After submission

- [ ] Record submission id/date in `PARKED_ACTIONS.md` (gate 6) and `AGENTS.md`.
- [ ] Watch the reviewer account's audit log (`audit_events`) for the review run.
- [ ] Keep the reviewer account funded until the listing decision.
- [ ] Any change to tool names, schemas, scopes, or the endpoint after submission
      requires re-review — treat `packages/contracts/src/mcp.ts` as frozen during review.
