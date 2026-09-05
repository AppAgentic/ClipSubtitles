# Remaining decisions and evidence — 5 September 2026

Prepared for Joe's review. No final attestations or submission. This record distinguishes verified preparation from outstanding execution and provider decisions.

## Completed portal preparation

Version1.0.0, verified Business author, listing category/copy/URLs/icons, public demo, all three starters and all three matching screenshots are saved. The production domain is verified in OpenAI. Fresh OAuth discovery returns all13tools with current annotations. Official JSON import/readback matched39annotation explanations plus5positive/3negative intent definitions: zero missing and zero mismatched fields. Accepted artifact: `/tmp/clipsubtitles-portal-import/chatgpt-app-submission.json`. Portal schema identifier required `apps-sdk` although the published schema constant used `plugins`; do not overwrite the accepted identifier from stale assumptions.

These are parent operator readbacks, not claims that this documentation worker independently mutated or retested the portal. Actual reviewer tests remain pending. Joe completed Cloudflare and secure email verification. Read-only WorkOS Production audit then confirmed exact reviewer `joe+clipsubtitles-review@appagentic.dev`, user `user_01M1ST5EP3EH3CA5V2XM09JQ5Y`, is Active with verified email and no configured authentication methods. Production Email+Password is Disabled; Magic Auth Enabled. Receipt: `/private/tmp/clipsubtitles-workos-reviewer-audit.md`, with two screenshots. No provider settings changed.

Concrete access action awaiting approval: enable Email+Password in the production WorkOS environment while retaining Magic Auth and existing security protections; set the exact reviewer password through normal hosted recovery using non-printing vault transport; prove fresh password login, MCP OAuth, application identity and balance. This expands password availability environment-wide, not just for this user. No officially established per-user exception to a disabled method was found. Safari UI is available again, with no established explanation for its earlier inspection failure. Direct authenticated app `/v1/me` readback now confirms user `usr_01m1st773jpxcm4kcqgp4m7dmm`, ClipSubtitles Reviewer, masked email `jo***@appagentic.dev`, workspace `ws_01m1st773n86zwcmbw4d3jgz18` created `2026-09-05T22:14:57.367Z`, session authentication and non-admin status, captions read/write, and 10 available / 0 reserved / 10 total credits. Fixed retention is 30/7 days. This confirms provisioning and balance, but does not establish a usable reviewer password or execution of the eight MCP acceptance cases. Sources: https://workos.com/docs/authkit/email-password ; https://workos.com/docs/authkit/users-organizations .

## Concrete provider decision

The exact ClipSubtitles ElevenLabs account is on Starter and Improve models is ON, per authenticated parent audit. Both ElevenCreative and ElevenAPI subscription views confirmed Starter, and the workspace training control reported checked. Metadata-only receipt and screenshot paths: `/tmp/clipsubtitles-elevenlabs-account-audit.md`. No settings were changed or purchases made. Current ElevenLabs OEM public terms exclude Starter from making a bundled service available; an account-specific contractual permission could change that, but none is established here. The Use Policy addresses13–18 access with prior parental/guardian consent. A paid commercial-use label alone does not establish the required bundled-service entitlement or end-user consent mechanism. Do not change subscription plans, execute new contracts, or disable a setting as if that alone resolves all restrictions without a scoped decision.

Google Gemini Developer API terms separately prohibit API clients directed toward or likely accessed by under18s. Ordinary paid Vertex Gemini has the same relevant restriction in Google Cloud Service Specific Terms20(d). OpenAI's general-audience directory guideline includes13–17. Marking ClipSubtitles as mature/adult content would not honestly resolve this processing eligibility issue.

Three reviewable paths:

1. Establish a compatible ElevenLabs bundled-service entitlement and teen-consent mechanism, remove incompatible Gemini fallback from the directory-accessible chain, then verify behavior and align disclosures. This may entail a plan/contract decision; it is not already done.
2. Implement traditional Google Cloud Speech-to-Text V2 `long`/`short` under the existing Google Cloud account, with explicit supported-language handling. The scoped plan is `/private/tmp/clipsubtitles-provider-remediation/plan.md`. API is currently disabled, worker lacks a direct project speech.client binding, and no adapter/config/IAM changes have been made. Standard price starts at USD0.016/audio minute plus storage. This is a reasoned eligibility alternative under published nongenerative service terms, not a blanket legal certification. Avoid chirp_3 because current official documentation calls it generative. The major product tradeoff is bounded language candidates rather than existing broad no-hint detection; never silently interpret all uploads as English.

3. Optional Whisper preparation is in [draft PR16](https://github.com/AppAgentic/ClipSubtitles/pull/16), branch `feat/whisper-transcription-prep`, commit `ae947c9`. The opt-in `whisper-1` adapter preserves automatic language and word timestamps; no speaker labels/vocabulary biasing. Full checks passed418tests,15optional skipped, lint/types/all builds. Production/default chain is unchanged and Terraform template inactive. No provider calls, credentials, purchases or deployment occurred. Before activation: verify exact AppAgentic project/key authority, model access, billing/rate limits; address parental consent and age-appropriate safeguards, applicable digital-consent/ZDR obligations; verify data settings/disclosures; run bounded English/non-English/noise/silence/max10minute live quality and caption export tests; review secret binding and exclusive selected chain, then CI/release. Do not merge or activate PR16 based on unit tests alone. Detailed report: `docs/directory/whisper-provider-preparation.md` in PR16.

## Independently useful consent release

The separate consent-only patch gates optional browser collection and advertising attribution, remembers separate choices, supports withdrawal/cross-tab changes, and loads Gleap only after deliberate Help. Local desktop/mobile flows passed; original full check passed411tests plus lint/types/build. This release is now verified live: [PR15](https://github.com/AppAgentic/ClipSubtitles/pull/15), source `03abbb7`, merge `aca6ede22ef2b9c55bb4bd20c898d618dee96e97`, revision `clipsubtitles-production-web-consent03abbb7` at 100% traffic. CI33996161485 passed and Cloud Build `52e85c92-8988-47d2-987a-53368a7c19ad` took 80 seconds. Exact image: `sha256:07be087140afdeecd40b9fa9ea633b742358096c09925b521986159fdc8db66b`. Final validation: 413 tests, 18 local browser journeys, 80 HTTP smoke requests and live desktop/mobile consent QA. Receipt `/tmp/clipsubtitles-consent-receipt/release.json`. It excludes unresolved age/Terms wording. Transient CDN-origin MP4 500 responses cleared after exact hero/style-preview invalidations; full/range bytes and repeated browser 206 responses then passed, with the final ERROR window empty from22:47:54UTC. No definitive abort/root-cause explanation was established. Existing ElevenLabs/Gemini processing must remain accurately disclosed until the runtime changes. Improve models ON means no provider no-training assurance is justified.

## What final review still needs

- A chosen and actually implemented provider-entitlement path, with accurate age/language and processor descriptions.
- Working reviewer access and actual5positive/3non-trigger-intent test results. Keep API security rejection tests separate.
- Consent and factual current privacy are live and verified. Final annotation/metadata alignment remains necessary after any provider change.
- Joe's review of binding OpenAI Terms and actual final attestations: terms/guideline and applicable-law compliance; no money/crypto transfers/investments; no display ads; necessary third-party/API rights; not designed/marketed under13. All remain unchecked until the final approval step.

ICO fee/registration is not automatically a proven directory blocker: determine applicable exemptions before asserting a mandatory company action. Retention audit must distinguish fixed media expiry and verified daily03:17UTC enabled scheduler from actual past-run success and complete account erasure. Do not silently change Allow all to UK-only; keep supported availability and assess concrete provider/country restrictions.

## Official sources

- https://developers.openai.com/plugins/app-guidelines#appropriateness
- https://elevenlabs.io/oem-terms (2B bundled-service plan restrictions)
- https://elevenlabs.io/use-policy (13–18 consent provision)
- https://ai.google.dev/gemini-api/terms
- https://cloud.google.com/terms/service-terms (20d)
- https://cloud.google.com/terms (customer app integration)
- https://cloud.google.com/terms/services (nongenerative/generative classification)
- https://docs.cloud.google.com/speech-to-text/docs/transcription-model
- https://cloud.google.com/speech-to-text/pricing

Public terms identify constraints; account metadata identifies current settings. Neither substitutes for live reviewer execution or explicit final submission approval.

Whisper references: https://openai.com/policies/services-agreement/ (downstream apps, minors parental consent); https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance . An adult API account holder alone does not establish compliance for downstream minors.
