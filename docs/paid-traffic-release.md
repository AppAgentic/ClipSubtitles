# Paid-traffic release and rollback

This is the release contract for a public paid launch. A successful build is a
candidate, not permission to deploy or enable billing.

## Immutable candidate gate

1. Work on an isolated branch and commit every intended change.
2. Run `REQUIRE_CLEAN_GIT=1 pnpm release:gate` from that exact commit. The gate
   covers lint, types, unit/integration tests, production builds, dependency
   audit, deterministic render smoke, REST smoke, MCP conformance, and the full
   desktop/mobile browser customer journey.
3. Run `terraform -chdir=infra/terraform fmt -check`, `validate`, and `test`.
4. Build the API, worker, and web images with the full commit SHA. Never deploy
   a floating `latest` tag.
5. Record the commit SHA, three image digests, schema migration version, prior
   serving revisions, and acceptance evidence before changing traffic.

## Gated production cutover

The following steps require explicit production approval:

1. Confirm all Secret Manager bindings exist without reading secret values.
2. Apply reviewed Terraform, including two public uptime checks and their alert
   policies. Production monitoring must have at least one real notification
   channel.
3. Deploy database-compatible API and worker revisions at zero traffic first.
   Run health and migration readback, then a private worker canary.
4. Deploy the web revision at zero traffic and exercise the signed-in browser
   journey against the candidate revision.
5. Move a small share of traffic, watch 5xx, failed-task, queue-depth, latency,
   and checkout/webhook signals, then increase traffic only while the gates stay
   green.
6. Enable Whop only after the live checkout, signed webhook replay,
   renewal/cancellation, portal, and agent-resume acceptance in
   `docs/billing-launch.md` passes.

## Rollback

Keep the previous API, worker, and web revisions plus their immutable image
digests until the observation window closes.

1. Stop increasing traffic at the first gate breach.
2. Route web and API traffic back to the recorded prior revisions. Pause new
   task dispatch if the worker or schema is implicated, while leaving already
   completed exports readable.
3. Restore the prior worker revision, then resume dispatch only after a private
   canary succeeds.
4. Do not reverse a forward database migration. Application changes must remain
   compatible with the migrated schema; use a new forward migration for repair.
5. Re-run health, one signed-in read-only journey, queue recovery, and credit
   reservation reconciliation. Record the incident reference before attempting
   another cutover.

## No-go conditions

- uncommitted or unpushed candidate code
- any failed paid-traffic gate
- high/critical dependency vulnerability, or an unexplained moderate issue in
  an exercised production path
- missing monitoring notification channel or failed public uptime check
- unverified provider ownership, product mapping, webhook signature, or portal
- unresolved legal review of Terms and Privacy before money is accepted
- no recorded prior revisions/image digests for rollback

## Deliberate launch trade-off: database availability

The initial production database remains zonal with automated backups, point-in-
time recovery, deletion protection, and uptime paging. This avoids making the
minimum paid launch uneconomic, but it accepts that a zone outage requires
recovery rather than automatic failover. Move to a dedicated regional HA tier
before an announced availability commitment, sustained paid volume, or any
workload whose recovery objective cannot tolerate a multi-hour zone incident.
This cost/risk decision must be revisited from real paid usage, not silently
carried forward.
