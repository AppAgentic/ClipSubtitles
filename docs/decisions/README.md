# Decision records

Short, dated records of choices that are not obvious from the code. The product
contract itself lives in `AGENTS.md` and `docs/plans/initial-agent-native-plan.md`.

| ID | Decision |
|----|----------|
| [ADR-0001](ADR-0001-monorepo-and-runtime.md) | pnpm workspace, TypeScript 5.9, Node 24 `node:sqlite`, esbuild server bundle, Next.js 16 web |
| [ADR-0002](ADR-0002-deterministic-renderer.md) | Canvas + ffmpeg compositor as the default deterministic renderer; Remotion optional |
| [ADR-0003](ADR-0003-benchmark-evidence.md) | Real product-clip evidence selects direct Scribe v2 primary and Gemini 3.5 fallback; mock runs prove the harness only |
| [ADR-0004](ADR-0004-auth-boundary.md) | WorkOS/AuthKit only; local mock identity + local OAuth AS for development; fail-closed scopes |
| [ADR-0005](ADR-0005-quotes-and-billing.md) | Immutable quotes, exact-cost approval, exactly-once ledger, snapshot renders |
| [ADR-0006](ADR-0006-frame-relative-style.md) | Style sizes relative to the shorter frame side; fit-to-width; explicit positions only |
