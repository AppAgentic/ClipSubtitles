# Legal and privacy review packet for paid traffic

Status: factual engineering draft, prepared 2026-09-01. This is not legal
advice and is not a substitute for review by counsel in the launch entity's
jurisdictions. Paid checkout must remain disabled until the public Terms and
Privacy pages have an effective date and the open decisions below are resolved.

## Product facts counsel can rely on

### Data collected and why

| Data | Source | Purpose | Current handling |
| --- | --- | --- | --- |
| Account identifier, email and display name | WorkOS/AuthKit | Sign-in, workspace ownership and account support | Stored in PostgreSQL; authentication secrets remain with WorkOS |
| Uploaded video/audio, file name, size and media metadata | Customer | Generate, preview and export captions | Private R2 objects; short-lived signed URLs; source retention defaults to 30 days |
| Transcript words, timings, caption pages and user edits | Derived from customer media and user input | Editing, rendering and reproducibility | Stored as immutable revisions in PostgreSQL until project/account deletion policy applies |
| Style, motion and export settings | Customer | Preview and final rendering | Stored with project and immutable quote/task snapshots |
| Rendered previews and final outputs | Derived | Customer playback and download | Preview retention is 24 hours; final export retention defaults to 7 days |
| Billing SKU, provider membership/payment/event identifiers and status | Whop after billing is enabled | Checkout, entitlements, credits, invoices and subscription management | Minimal billing state and idempotency records in PostgreSQL; card details remain with Whop |
| Security and operational metadata | Service | Authentication, rate limiting, fraud/security response and support diagnostics | Structured logs and audit records; content and credential fields are redacted |

ClipSubtitles does not need to sell customer data, use uploaded media for
advertising, or train a ClipSubtitles model. No advertising, session-replay or
third-party product-analytics SDK is present in the release candidate. Those
facts must be re-audited if analytics or marketing tooling is later added.

### Processors and infrastructure

| Provider | Function | Customer content received |
| --- | --- | --- |
| WorkOS | Authentication and identity | Account identity and authentication events; no video/transcript content |
| Cloudflare R2 | Private object storage | Uploaded media, previews and exports |
| ElevenLabs | Primary speech-to-text | Audio extracted from the uploaded media |
| Google Gemini | Fallback speech-to-text | Audio only when the primary provider fails and fallback is allowed |
| Google Cloud | Cloud Run compute, Cloud SQL, Tasks, Scheduler, load balancing, secrets and logs | Application requests, derived project/transcript state, rendering inputs/outputs in transit, redacted operations data |
| Whop | Checkout, subscription management and payment events after enablement | Account/workspace-bound checkout metadata and billing activity; provider handles payment details |

Provider legal names, data locations, retention, training/default data-use
settings, DPAs and international-transfer mechanisms must be verified from the
signed account terms—not inferred from marketing pages.

### Retention and deletion behavior already implemented

- Source media: 30 days by default, user-selectable from 1–365 days.
- Final exports: 7 days by default, user-selectable from 1–90 days.
- Preview exports: 24 hours.
- Upload targets: 1 hour; signed playback/download URLs: 15 minutes.
- Open render quotes: 15 minutes; idempotency records: 7 days.
- A daily authenticated maintenance job removes expired objects. A database row
  is marked purged only after object deletion succeeds; failures remain visible
  for retry.
- Project deletion immediately attempts to remove source and output objects,
  cancels work and soft-deletes project metadata for audit consistency.
- Transcript/project metadata can outlive source media so users can continue
  editing text captions after source expiry.

The public policy must distinguish deletion of customer-accessible content from
security, accounting, dispute, tax, fraud and backup records that may need a
longer lawful retention period. The exact account-deletion SLA, backup expiry
and billing-record schedule are open legal/operational decisions.

## Public Privacy page: keep, add, remove, verify

### Keep

- Plain statement that account information provides the workspace.
- User-visible media retention windows and project deletion controls.
- Statement that service providers perform authentication, storage,
  transcription, rendering and billing functions.
- `privacy@clipsubtitles.com` as the request route, after delivery and ownership
  are tested.

### Add before paid traffic

- Effective date, controller/legal entity name, registered/contact address and
  applicable representative or data-protection contact.
- The data table above in customer language, including transcript metadata and
  fallback transcription.
- Purposes and lawful bases by jurisdiction; cookies/session authentication;
  billing records; security/fraud logs; international transfers and safeguards.
- Retention/deletion detail, account deletion process and response time.
- Rights and complaint routes applicable to UK/EU, US state and other target
  customers; age/minimum-use rule.
- Processor/subprocessor list or link, material-change notice mechanism and how
  customers can request a DPA where applicable.

### Remove or avoid

- Do not imply that providers may use data *only* under terms not yet verified.
- Do not promise immediate deletion from provider backups or statutory billing
  records unless the contracts and operations prove it.
- Do not make broad claims such as “GDPR compliant,” “never stored,” “anonymous,”
  or “end-to-end encrypted” without an audited, scoped basis.

### Verify externally

- Launch entity/controller, jurisdiction, support/privacy mailbox delivery and
  response ownership.
- WorkOS, R2, ElevenLabs, Gemini, Google Cloud and Whop contractual data-use,
  retention, regional-processing and transfer terms.
- Whether provider model-training/data-improvement controls require account
  configuration and whether they are off in the production accounts.

## Public Terms page: keep, add, remove, verify

### Keep

- Customers must hold the rights needed to upload and process media.
- The product charges credits only after an immutable quote is approved;
  previews/editing/subtitle-file export are not charged under the current catalog.
- Clear service contact route.

### Add before paid traffic

- Contracting entity, eligibility/age, account security and acceptable-use terms.
- Customer-content ownership/license limited to operating the service; output
  ownership and responsibility; copyright/privacy/personality-right obligations.
- Subscription price, taxes, renewal cadence, annual billing, cancellation,
  upgrade/downgrade effective timing, refunds, chargebacks and unused-credit rules.
- Service availability, beta/change language, support scope, termination,
  disclaimers, liability cap, indemnity where appropriate and force majeure.
- Governing law, venue/dispute process, notices, assignment, severability and
  change-notice process.
- Data-processing/privacy incorporation and an acceptable-use prohibition on
  unlawful, harmful or rights-infringing media.

### Remove or avoid

- Remove the current “early-access” label if paid traffic is marketed as a
  production service, or define the beta limitations precisely.
- Do not promise a refund/cancellation outcome that Whop and the dashboard have
  not been configured and acceptance-tested to deliver.
- Do not claim uninterrupted service, universal transcription accuracy or
  guaranteed platform acceptance.

### Verify externally

- Consumer cancellation/refund requirements in every sales geography.
- Whop merchant-of-record/payment role, tax handling, receipt language and
  dispute/refund responsibilities under the actual AppAgentic agreement.
- Support mailbox ownership, response expectation and escalation process.

## Counsel acceptance checklist

- [ ] Entity/controller, address, governing law and effective date supplied.
- [ ] Processor contracts and production account data-use settings reviewed.
- [ ] Privacy rights, international transfers, cookies and retention approved.
- [ ] Subscription/annual renewal, cancellation, refund, tax and credit terms
      match the implemented catalog and Whop configuration.
- [ ] Public pages updated, linked at checkout and captured in a dated artifact.
- [ ] `privacy@clipsubtitles.com` and `support@clipsubtitles.com` deliver to
      monitored humans.
- [ ] One independent browser review confirms Terms and Privacy are readable on
      desktop/mobile and reachable from landing, sign-in, pricing and checkout.
