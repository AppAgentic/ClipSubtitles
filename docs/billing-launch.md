# Billing launch runbook

ClipSubtitles has one code-owned billing catalog for the website and every
connected-agent surface. The launch catalog is defined in
`packages/contracts/src/billing.ts`; provider products mirror it but never
become the source of product entitlements or displayed allowances.

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
- Active export admission is serialized per workspace and enforced against the
  current plan, so simultaneous requests cannot exceed the included capacity.
- Agents receive `checkout_required` with the exact balance, shortfall, quote
  expiry and an app-owned pricing URL. The payment provider URL is never
  returned directly from an MCP tool.

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

Set `BILLING_PROVIDER=whop` only after every binding exists. Configuration
fails closed if any required value is missing.

## Live acceptance checklist

1. Verify the Whop account belongs to AppAgentic and that each product price,
   interval and currency matches `BILLING_CATALOG` exactly.
2. Register the production webhook URL at
   `https://api.clipsubtitles.com/v1/billing/webhooks/whop` and store its secret
   without printing it.
3. Deploy with pinned Secret Manager versions, then read back only non-secret
   configuration and service readiness.
4. Complete a real low-value top-up and a paid-plan checkout from an
   authenticated test workspace.
5. Confirm one verified event creates one billing-event row and one credit
   grant; replay the same signed event and confirm it is a no-op.
6. Confirm cancellation and failed-payment events do not grant credits. Verify
   the provider's exact live event shapes before expanding status handling.
7. Exhaust a test workspace, trigger `checkout_required` from an agent, pay on
   the app-owned URL, and resume the same quote when valid.
8. Review `/terms` and `/privacy` with counsel before public payment traffic.

The code path is ready for this acceptance pass, but passing unit/integration
tests with an injected provider is not evidence that live Whop event payloads
or account ownership have been verified.
