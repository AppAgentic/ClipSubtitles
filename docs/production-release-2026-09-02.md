# Production release receipt — 2026-09-02

This records the application and monitoring cutover performed before paid
traffic. It does not authorize advertising or enable payment collection.

## Immutable inputs

- Application commit: `c2b031cb6b01f9c01a5cf5e5aa6b6cc3649347ff`
- Monitoring correction merged to `main`: `9e297ff`
- Cloud Build: `7496896a-8d00-4081-b89d-c3ce026b093b`
- API image: `sha256:83eec3acbaa184f57ae22208be3794a28ce2e271f9752e41db7950099df4b228`
- Worker image: `sha256:bbbb5a812a3ca14bc0b0aa93afd045e01f597c7632d60d9b998aee24bc5dbb95`
- Web image: `sha256:6060112d346f542e6a70288fd28210ecaaf14e45fb0da223c0e5caf70f864313`
- Pre-release Cloud SQL backup: `1788387407599` (`SUCCESSFUL`)

The local and Cloud Build release gates passed lint, types, production builds,
312 tests (15 skipped), dependency audit with no known production
vulnerabilities, deterministic render, REST smoke, MCP conformance, eight
desktop/mobile browser tests, and Terraform format/validate/test.

## Cutover

The final revisions use the immutable image digests and production runtime
configuration:

- API: `clipsubtitles-production-api-00005-w9b`
- Web: `clipsubtitles-production-web-00003-p5d`
- Worker: `clipsubtitles-production-worker-00008-zxc`

The image candidates were first created at zero traffic. The final web and API
configuration revisions then received a 5% canary. The new `/pricing` route was
served successfully by the final web revision and the API remained healthy.
The render queue contained zero tasks before the worker cutover. All three
services then moved to 100% of the final revisions.

Post-cutover public readback returned 200 for `/`, `/pricing`, `/developers`,
`/help`, API `/healthz`, `/llms.txt`, OAuth protected-resource metadata and
`/openapi.json`; unauthenticated `/v1/me` correctly returned 401. No new 5xx or
error logs were present on the final revisions.

## Monitoring and billing boundary

Terraform applied with zero destructive actions. It created two public uptime
checks, five alert policies, two log metrics, the API edge security policy, and
the Whop Secret Manager containers with API-service least-privilege bindings.
The raw uptime metric is Boolean, but `ALIGN_FRACTION_TRUE` produces a numeric
ratio, so regional aggregation uses `REDUCE_MEAN`; Terraform validation and its
production test pass with that correction.

The notification channel targets `joe@appagentic.dev`. A labelled synthetic
5xx log entry was accepted to exercise the alert path; human inbox delivery is
still awaiting confirmation. Billing remains fail-closed with
`BILLING_PROVIDER=none`, and no Whop secret value or plan ID was installed.

## Rollback

The immediately previous serving revisions are retained:

- API: `clipsubtitles-production-api-00003-mwm`
- Web: `clipsubtitles-production-web-00001-xxf`
- Worker: `clipsubtitles-production-worker-00006-wf9`

The database migration is additive/forward-only. Rollback must route traffic to
the revisions above rather than reversing the schema. The successful Cloud SQL
backup is the pre-release recovery point.

## Remaining paid-traffic gates

- Finish the signed-in deployed-origin upload/customer journey; the current
  AppAgentic browser session is waiting for its one-time sign-in code.
- Confirm alert delivery to the monitored human inbox.
- Complete Whop sign-in/elevation, catalog and webhook provisioning, then the
  charged acceptance runbook.
- Resolve and publish the legal decisions in
  `docs/legal-paid-traffic-review.md` before enabling checkout.
- Configure billing-account budget alerts from a billing administrator account.

Do not send paid traffic or enable Whop until these gates are complete.
