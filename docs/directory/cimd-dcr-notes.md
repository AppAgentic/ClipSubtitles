# Client registration: DCR today, CIMD/DCR in production

How an MCP client (ChatGPT, Claude, an IDE) obtains a client id for the
ClipSubtitles authorization server, what the repository implements, and what is
a WorkOS dashboard setting rather than code. **Nothing here has been enabled in
production; there is no production client yet (gate 2).**

## What the resource server publishes (implemented)

`GET /.well-known/oauth-protected-resource` (RFC 9728), served by
`packages/server/src/http/routes/wellknown.ts`:

- `resource` — `API_PUBLIC_URL`
- `authorization_servers` — the configured issuer (local mock AS, or the WorkOS
  Connect/AuthKit domain root when `AUTH_MODE=workos`). Do not use WorkOS's
  `api.workos.com/user_management/client_…` issuer here: it is the web-login
  identity issuer and does not publish the MCP Connect registration endpoint.
- `scopes_supported` — `captions:read`, `captions:write`
- `bearer_methods_supported` — `header`
- `resource_name` — the MCP server title

Unauthenticated MCP requests get `401` with a `WWW-Authenticate: Bearer
resource_metadata="…"` challenge so clients can discover the AS without
out-of-band configuration.

## Local development: mock AS with PKCE + DCR (implemented)

With `AUTH_MODE=mock`, the API hosts a minimal OAuth 2.1 authorization server
for development only:

- `/.well-known/oauth-authorization-server` — issuer metadata advertising
  `code_challenge_methods_supported: ["S256"]` and the registration endpoint
- `POST /dev/oauth/register` — RFC 7591 Dynamic Client Registration; any
  client may register a public client with `redirect_uris`; no secrets issued
- `/dev/oauth/authorize` + `/dev/oauth/token` — authorization code with PKCE,
  issuing HS256 JWTs whose scopes are enforced fail-closed by the API and MCP
  middleware

`pnpm mcp:conformance` performs the full DCR → PKCE → token → tools flow. The
mock AS is compiled out of the request path when `AUTH_MODE=workos`.

## Production: WorkOS AuthKit (config, not code)

WorkOS AuthKit acts as the authorization server. Two ways a directory client
can get a client id — choose one before gate 3:

| Option | What it is | Where it is set | Notes |
| --- | --- | --- | --- |
| **DCR** (RFC 7591) | Client POSTs its metadata to WorkOS's registration endpoint and receives a client id at connect time | WorkOS dashboard → the AuthKit application → "Dynamic Client Registration" (enable) | Simplest for directories that register per-user connectors. Register the directory's known redirect URIs if WorkOS requires an allow-list. |
| **CIMD** (Client ID Metadata Documents) | The client id *is* an HTTPS URL to a JSON document describing the client; the AS fetches and validates it | WorkOS dashboard / support — confirm AuthKit's current support before relying on it | Preferred by the latest MCP authorization spec when supported; no registration call needed. |

Either way the API only sees a bearer JWT: verification is RS256 against the
WorkOS Connect JWKS at `<AuthKit issuer>/oauth2/jwks`
(`packages/server/src/auth/tokens.ts`), audience/issuer pinned
from config, scopes required per route. Revocation is per client via
`oauth_grants`, so a directory client can be cut off without touching users.

## Verification steps (staging, before submission)

1. `curl https://api.clipsubtitles.com/.well-known/oauth-protected-resource` shows the
   WorkOS issuer in `authorization_servers`.
2. `curl <issuer>/.well-known/oauth-authorization-server` shows
   `registration_endpoint` (DCR) — or the CIMD capability if that option is chosen.
3. From a clean MCP client (e.g. the MCP Inspector), connect to
   `https://api.clipsubtitles.com/api/mcp`, complete the browser sign-in, and run
   `initialize` + `tools/list`; expect eight tools.
4. Revoke the client's grant in the account page and confirm the next call is
   `401 unauthenticated` (grant revocation test exists in `packages/server/src/test/mcp.test.ts`).

## Things to decide (owner: auth/infra)

- DCR vs CIMD (table above).
- Token lifetime and refresh policy in AuthKit.
- Whether directory clients may request `captions:write` by default or must
  ask for it (the API enforces the scope either way).
