# ADR-0004 — WorkOS/AuthKit boundary with a local mock

**Date:** 2026-08-29 · **Status:** accepted

## Context

WorkOS/AuthKit is the sole identity and OAuth authority from day one; private
beta uses a predefined OAuth client; one subject maps to one personal
workspace; public tools never accept user or workspace ids.

## Decision

- `IdentityProvider` (hosted sign-in) and `TokenVerifier` (bearer) interfaces with
  two implementations each: WorkOS (config-gated, RS256 pinned to the AuthKit
  JWKS) and mock (local picker page, HS256 tokens from `pnpm dev:token`, and a
  minimal local OAuth 2.1 authorization server with PKCE + dynamic registration
  so real MCP clients can connect during development).
- Bearer tokens must carry at least one recognised scope (`captions:read`,
  `captions:write`); unknown/missing scopes fail closed.
- Every bearer client gets an `oauth_grant` on first use; users revoke grants
  from Settings, and revoked grants reject subsequent tokens immediately.
  WorkOS webhooks (`session.revoked`, `user.deleted`) revoke sessions/grants.
- Web sessions are HttpOnly cookies whose hash is stored server-side; unsafe
  methods require same-origin proof. The auth callback and the mock flow stay on
  the **web** origin (the web app proxies `/auth/*`) so the cookie is set for the
  host users browse.

## Consequences

- Production needs the WorkOS tenant, client, redirect URI, and webhook secret (parked).
- CIMD/DCR for public directories is a WorkOS setting layered on later without migrating identities.
