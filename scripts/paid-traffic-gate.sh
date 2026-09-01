#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ "${REQUIRE_CLEAN_GIT:-0}" == "1" ]] && ! git diff --quiet --ignore-submodules --; then
  echo "Release gate requires a clean tracked worktree." >&2
  exit 1
fi

pnpm check
pnpm audit --prod --audit-level=moderate
pnpm smoke:render
pnpm smoke:e2e
pnpm mcp:conformance

if [[ "${SKIP_BROWSER_E2E:-0}" == "1" ]]; then
  exit 0
fi

gate_tmp="$(mktemp -d "${TMPDIR:-/tmp}/clipsubtitles-paid-gate.XXXXXX")"
stack_pid=""

cleanup() {
  if [[ -n "$stack_pid" ]] && kill -0 "$stack_pid" 2>/dev/null; then
    kill "$stack_pid" 2>/dev/null || true
    wait "$stack_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ "${USE_EXISTING_STACK:-0}" != "1" ]]; then
  if curl --silent --max-time 1 http://localhost:3100/sign-in >/dev/null 2>&1 \
    || curl --silent --max-time 1 http://127.0.0.1:3101/llms.txt >/dev/null 2>&1; then
    echo "Ports 3100/3101 are already serving another stack. Stop it or set USE_EXISTING_STACK=1 after verifying ownership." >&2
    exit 1
  fi
  pnpm dev >"$gate_tmp/stack.log" 2>&1 &
  stack_pid=$!
fi

ready=0
for _ in $(seq 1 90); do
  if curl --fail --silent --show-error http://localhost:3100/sign-in >/dev/null \
    && curl --fail --silent --show-error http://127.0.0.1:3101/llms.txt >/dev/null; then
    ready=1
    break
  fi
  if [[ -n "$stack_pid" ]] && ! kill -0 "$stack_pid" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [[ "$ready" != "1" ]]; then
  echo "Local acceptance stack did not become ready. Logs: $gate_tmp/stack.log" >&2
  tail -200 "$gate_tmp/stack.log" >&2
  exit 1
fi

E2E_BASE_URL=http://localhost:3100 pnpm --filter @clipsubtitles/web e2e
