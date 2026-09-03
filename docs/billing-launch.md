# Billing launch runbook

ClipSubtitles has one code-owned billing catalog for the website and every
connected-agent surface. The launch catalog is defined in
`packages/contracts/src/billing.ts`; provider products mirror it but never
become the source of product entitlements or displayed allowances.

The provider catalog is reconciled by `pnpm whop:catalog`. It uses Whop CLI
`0.16.0`, derives every provider plan from the shared catalog, and is read-only
unless the sole mutation flag `--apply` is supplied.

## Implemented boundary

- Free grants 10 lifetime credits in a dedicated `free` pool.
- Every plan, including Free, includes browser, agent, MCP and API access;
  tiers differ by credits, render concurrency and team controls.
- Creator, Pro and Studio use expiring `subscription` pools.
- Monthly purchases grant one monthly allowance; annual purchases grant the
  full prepaid annual allowance. Both use the provider period end plus the
  configured two-month grace window as their expiry.
- Top-ups use non-expiring `purchased` pools.
- Existing/manual grants use an isolated `admin` pool.
- Reservations spend subscription, free and admin credits before purchased
  credits, preserving non-expiring value when possible.
- Checkout sessions are created server-side, bound to the authenticated
  workspace, and carry catalog version, SKU, source and resume metadata.
- Whop webhooks are signature verified and event IDs are recorded before an
  entitlement or credit grant can be applied again.
- Provider event time is stored on the billing account. A delayed older event
  may grant a legitimate payment once, but cannot reactivate or otherwise
  overwrite a newer cancellation state.
- The webhook is bounded by both the application anonymous limiter and the
  shared Cloud Armor API policy before signature verification work reaches a
  horizontally scaled instance.
- Paid workspaces can open Whop's membership-specific billing portal from the
  dashboard to upgrade, downgrade, update payment details, view invoices or
  cancel without creating a second subscription. The portal destination is
  resolved server-side and restricted to `https://whop.com`.
- Membership activation, scheduled-cancellation changes and deactivation
  webhooks update the dashboard plan status without granting credits.
- Active export admission is serialized per workspace and enforced against the
  current plan, so simultaneous requests cannot exceed the included capacity.
- Agents receive `checkout_required` with the exact balance, shortfall, quote
  expiry and an app-owned pricing URL. The payment provider URL is never
  returned directly from an MCP tool.
- Agent source/resume context and the chosen monthly or annual plan survive
  sign-in; checkout resumes automatically after authentication. The completion
  page tells the customer to return to ChatGPT, Claude, or their agent and
  continue the same still-valid quote.

## Safe local configuration

Local development uses `BILLING_PROVIDER=none`; pricing, Free workspaces and
the credit ledger remain usable while paid checkout returns a controlled
`PROVIDER_UNAVAILABLE` response. Do not put provider credentials in `.env`.

Production requires these Secret Manager/process bindings:

- `WHOP_API_KEY`
- `WHOP_ACCOUNT_ID`
- `WHOP_WEBHOOK_SECRET`
- `WHOP_PLAN_CREATOR_MONTHLY`
- `WHOP_PLAN_CREATOR_ANNUAL`
- `WHOP_PLAN_PRO_MONTHLY`
- `WHOP_PLAN_PRO_ANNUAL`
- `WHOP_PLAN_STUDIO_MONTHLY`
- `WHOP_PLAN_STUDIO_ANNUAL`
- `WHOP_PLAN_TOPUP_SMALL`
- `WHOP_PLAN_TOPUP_MEDIUM`
- `WHOP_PLAN_TOPUP_LARGE`

Terraform creates isolated production secret containers for these values and
grants access only to the API service account. Set `enable_billing = true` only
after every secret has a verified version and the provider catalog readback
matches the code-owned catalog.

Set `BILLING_PROVIDER=whop` only after every binding exists. Configuration
fails closed if any required value is missing.

## Catalog provisioning contract

1. Select the verified AppAgentic Whop business and make its non-secret
   `biz_...` identifier available as `WHOP_ACCOUNT_ID`. Never trust an account
   selected only by the current CLI profile name.
2. Authenticate the pinned official Whop CLI through the account workflow; do
   not copy provider credentials into this repository or an `.env` file.
3. Run `pnpm whop:catalog` first. This lists the exact create/update/unchanged
   plan without mutating provider state.
4. Review that the desired catalog contains one hidden product, six hidden
   recurring plans and three hidden one-time top-ups. Price, currency, cadence,
   product ownership and plan type are immutable safety fields: drift aborts
   instead of rewriting a potentially sold plan.
5. Only after explicit provider-mutation approval, run
   `pnpm whop:catalog -- --apply`. The command uses idempotency keys, performs
   exact provider readback, and prints only verified binding names—not API
   keys, webhook secrets, account IDs or provider plan IDs. After exact
   readback, it pipes all nine plan IDs directly into app-scoped `mc-vault`
   entries without exposing their values.
6. Copy those vault entries into the matching Secret Manager containers using
   the approved non-printing production workflow. Run the default dry-run
   again; every action must be `unchanged`.

The catalog command intentionally does not create the Standard Webhook. Prior
AppAgentic launches found that an Admin API key could manage products/plans but
not webhooks, and a webhook secret is create-only. Register and verify the
endpoint separately through the authenticated AppAgentic Whop dashboard, store
the secret without printing it, and then run the signed-event acceptance below.

## Live acceptance checklist

1. Verify the Whop account belongs to AppAgentic and that each product price,
   interval and currency matches `BILLING_CATALOG` exactly.
2. Register the production webhook URL at
   `https://api.clipsubtitles.com/v1/billing/webhooks/whop` and store its secret
   without printing it. Subscribe it to `payment.succeeded`,
   `membership.activated`, `membership.deactivated`, and
   `membership.cancel_at_period_end_changed`, plus `refund.created` and
   `dispute.created` after the matching reversal/hold handlers are deployed.
3. Deploy with pinned Secret Manager versions, then read back only non-secret
   configuration and service readiness.
4. Complete a real low-value top-up and a paid-plan checkout from an
   authenticated test workspace.
5. Confirm one verified event creates one billing-event row and one credit
   grant; replay the same signed event and confirm it is a no-op. Refund the
   payment and confirm the original workspace receives one idempotent
   adjustment, no unrelated pool is modified, and the balance cannot become
   negative. Exercise the equivalent dispute hold/reversal path with a
   provider fixture or controlled provider event.
6. Open *Manage subscription* from a paid test workspace and verify upgrade,
   downgrade, payment-method, invoice and cancellation controls. Confirm the
   membership status webhooks update the dashboard without granting credits.
7. Exhaust a test workspace, trigger `checkout_required` from an agent, pay on
   the app-owned URL, and resume the same quote when valid.
8. Complete every gate in `docs/legal-review-2026-09-03.md`, including counsel
   review of `/terms`, `/privacy`, and `/refunds`, before public payment
   traffic.

The purchase-grant path is ready for its acceptance pass. Refund/dispute
handling remains a code blocker. Passing unit/integration tests with an
injected provider is not evidence that live Whop event payloads, legal settings
or account ownership have been verified.
