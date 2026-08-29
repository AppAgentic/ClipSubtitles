# ADR-0001 — Monorepo and runtime choices

**Date:** 2026-08-29 · **Status:** accepted

## Context

The contract calls for a Next.js web app, a remote MCP server, a typed REST API,
durable workers, and a media pipeline, all sharing schemas and caption logic.

## Decision

- **pnpm workspace** with `contracts → core → {transcription, storage, render} → server` and `apps/web`. Packages export TypeScript sources; the server is bundled with esbuild for production, the web app by Next.
- **TypeScript 5.9** (not 7.x) for tooling compatibility (typescript-eslint, Next); strict flags including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- **Node 24 `node:sqlite`** for the local database (no native build step). Repositories are plain functions over a `Db`, so a Postgres implementation can replace them for Cloud Run without touching services.
- **Hono + @hono/zod-openapi** for REST (typed routes → OpenAPI 3.1) and the official MCP SDK's web-standard Streamable HTTP transport, mounted stateless per request.
- **Vitest 4** projects per package; **ESLint 10** flat config; **Prettier** for formatting.

## Consequences

- `node:sqlite` prints an experimental warning; scripts pass `--no-warnings=ExperimentalWarning`.
- Core must stay isomorphic (Web Crypto + pure SHA-256) because the browser runs it.
