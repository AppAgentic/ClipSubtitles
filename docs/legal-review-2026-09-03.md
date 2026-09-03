# Paid-traffic legal readiness review — 2026-09-03

Status: internal product and compliance review, not legal advice. Paid checkout
remains disabled until the blockers below are resolved. This review covers an
initial UK launch by APP AGENTIC LTD; it does not clear unrestricted worldwide
consumer sales.

## Verified facts

- APP AGENTIC LTD is an active private company registered in England and Wales,
  company number `16428873`, with registered office at 12 Bramble Way,
  Stockport, England, SK7 5EE. Source: Companies House public record.
- The Whop `ClipSubtitles` business is under App Agentic. Its tax setting is
  `Whop collects and remits`, prices are tax-exclusive, no business address or
  tax registration is entered, and individual/business verification is not
  complete.
- Whop has no ClipSubtitles Terms, Privacy, Return Policy or EULA uploaded, and
  mandatory terms acceptance is not enabled.
- The application catalog is in USD. Monthly subscriptions are $15/$39/$99;
  annual subscriptions are $144/$396/$1,008 charged annually; top-ups are
  $12/$35/$79. Subscription credits remain for two additional months after the
  paid period; purchased credits do not have a routine expiry.
- The application uses WorkOS, Cloudflare R2, ElevenLabs, Google Gemini, Google
  Cloud, Whop and Gleap in the data flow. The previous review packet omitted
  Gleap and incorrectly stated that no third-party analytics SDK was present.
- Gleap previously initialized site-wide, identified signed-in users and sent
  `page_view` events. The 2026-09-03 remediation makes Gleap initialize only
  after the user opens support and removes automatic page-view tracking.
- The current Whop webhook subscribes to payment success and membership state,
  but not `refund.created` or `dispute.created`. The billing ledger does not yet
  reverse unused credits or record a refund/dispute adjustment. Live billing
  must remain disabled until this is implemented and acceptance-tested.

## Public-copy remediation in this branch

- Replaced the placeholder Terms and Privacy pages with dated policies naming
  the company, governing law, account/content rules, current catalog behavior,
  lawful bases, recipients, transfers, retention, rights and ICO complaint path.
- Added a separate Refund and Cancellation Policy covering auto-renewal,
  cancellation timing, UK 14-day rights, defects, duplicate charges, unused
  credits and the Whop Resolution Center.
- Added an 18+ acknowledgement before authentication because the production
  fallback uses Gemini and the service is not designed for children.
- Added currency, tax, renewal and legal-policy disclosure alongside pricing.
- Added the Refund policy to the public footer.

## Authoritative basis checked

- UK distance-selling information and cancellation duties:
  https://www.gov.uk/online-and-distance-selling-for-businesses
- Consumer Contracts (Information, Cancellation and Additional Charges)
  Regulations 2013:
  https://www.legislation.gov.uk/uksi/2013/3134/contents
- Fair consumer contract guidance:
  https://www.gov.uk/guidance/writing-a-fair-contract-for-customers
- ICO privacy-information checklist:
  https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/checklists/
- ICO cookies and storage-access guidance:
  https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/
- ICO international-transfer guidance:
  https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/
- ICO data-protection-fee assessment:
  https://ico.org.uk/fee-checker
- Whop Seller Terms:
  https://whop.com/seller-terms/
- Whop legal-document setup:
  https://docs.whop.com/manage-your-business/manage-business/legal-documents
- Whop webhook events and delivery guarantees:
  https://docs.whop.com/developer/guides/webhooks
- ElevenLabs DPA and data-use control:
  https://elevenlabs.io/dpa
  https://elevenlabs.io/docs/help-center/legal/is-my-data-used-to-improve-eleven-labs-ai-models

## Remaining blockers

1. Implement and test `refund.created` and `dispute.created` handling, including
   exact payment-to-workspace attribution, idempotent unused-credit reversal,
   accounting/audit state and a rule that cannot create a negative balance.
2. Verify the production ElevenLabs `Improve the models for everyone` setting
   is off. Record the account-level setting without exposing customer data.
3. Complete the ICO fee self-assessment for APP AGENTIC LTD and pay/register if
   required. This is an entity-level declaration and cannot be inferred from
   the repository.
4. Complete Whop individual/business verification and add the verified business
   address. Confirm with the accountant that `Whop collects and remits` is the
   intended transaction-tax mode and that any separate APP AGENTIC LTD VAT and
   corporation-tax duties are understood.
5. Confirm the initial paid sales geography. This review recommends UK-only
   paid acquisition first. EEA targeting needs a specific representative and
   transfer assessment; unrestricted US/global sales need jurisdiction-specific
   consumer/privacy review.
6. Have a qualified solicitor review the dated public copy and the
   immediate-performance/cooling-off wording. After approval, generate matching
   PDFs, upload Terms/Privacy/Return Policy to Whop and require acceptance.
7. Run the controlled charged/refund/replay/portal/agent-resume acceptance only
   after the above items and the matching production deployment are complete.

## Upcoming subscription regime

The Digital Markets, Competition and Consumers Act 2024 subscription-contract
rules are expected to commence in spring 2027. Before that date, add compliant
pre-contract information, renewal reminders, simple online cancellation,
renewal cooling-off handling and durable cancellation acknowledgements. The
current Whop management link is a useful foundation but not evidence of full
future compliance.
