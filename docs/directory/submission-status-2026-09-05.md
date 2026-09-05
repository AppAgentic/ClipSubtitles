# OpenAI submission status — 2026-09-05

Prepared, not submitted. Joe authorized adding the demo and reporting remaining work in Slack turn1788635965.663599. This audit supersedes legacy pre-deploy statements and form limits in the earlier packet; it does not claim those drafts are ready to paste unchanged.

## Demo URL to paste

https://clipsubtitles.com/review/caption-workflow-20260905/index.html

Direct MP4: https://clipsubtitles.com/marketing/clipsubtitles-reviewer-punchy-20260905-v3.mp4

Added to capability-manifest.json and submission-checklist.md. The109.7second version covers the fresh ChatGPT upload, transcription, style, visible correction selection/result, explicit3credit approval, render, MP4download, SRTrequest and actual exported result. Retained footage is normal speed. Anonymous page/media, file hashes/range requests and canonical Safari playback/chapters passed. See demo-recording-2026-09-05.md for source limitations and exact hashes.

## Current portal readback

Parent operator's authenticated readback in the AppAgentic Organization on 2026-09-05 confirms the existing ClipSubtitles draft now uses version **1.0.0**. This supersedes the earlier 0.1.0 draft value; source/runtime package versions are unchanged by these listing edits.

Saved: display name ClipSubtitles; short description “Create and edit video captions”; category Creativity; selected verified Business author App Agentic Ltd; website, support, privacy and terms URLs; Demo Recording URL; both existing brand PNG icons; and all three prompts in `starter-prompts.md`. The production tool scan completed with **13 tools**, including the app-only upload helper. This scan is discovery evidence, not execution of every workflow.

- Project: `proj_1XtY6cMajsOV2P94CWKITYxr`
- Draft: `asdk_app_6a9c6c7c3bd481918c6e63e5a7658fe9`
- Version record: `asdk_app_v_6a9c6c7d7e8081918b0209a73989cc3d`

The production domain is now **verified in OpenAI**. A fresh OAuth scan discovered all 13 tools and reflects the updated annotations. The official submission JSON import succeeded: all 39 annotation explanations and the five positive/three negative intent definitions matched readback, with zero missing fields and zero mismatches. Accepted import artifact: `/tmp/clipsubtitles-portal-import/chatgpt-app-submission.json`. The portal required an `apps-sdk` schema identifier despite the published `plugins` constant; preserve the accepted artifact rather than regenerating its identifier blindly.

All three screenshots and the result-led third starter “Create a captioned version of my video that I can download and share.” are saved and verified. Actual reviewer-account test execution remains pending. Joe completed the Cloudflare interaction; secure email verification then succeeded. The subsequent state-less callback error was expected for that entry path; a normal /auth/login returned to the landing page. Authenticated reviewer workspace identity is not yet verified, and the browser inspection tool currently returns title-only state. A successful scan/import does not prove reviewer authentication or end-to-end execution.

The current ElevenLabs account audit identified the exact ClipSubtitles account on **Starter**, with **Improve models ON**. Provider eligibility remains unresolved; the traditional Google Cloud Speech-to-Text alternative is a research/implementation plan only. No new-provider implementation or enabling is claimed. Consent-only website improvements are assigned to the release agent; no deployment is claimed by this document without their receipt. Global defaults remain en-US and Allow all; do not silently restrict availability to the UK based on a parked UK review. No attestations or submission were performed.

During earlier prerequisite inspection, Create plugin → With MCP → Continue unexpectedly created an untitled draft under the previous project. Only that newly created empty draft was removed; the existing AppStoreCopilot draft was verified unchanged. The create-on-Continue behavior is recorded in the owning shared skill.

## Verified available

- Production website and MCP resource deployed; current public protected-resource metadata returns200, WorkOS authorization server, and openid/profile/email/offline_access scopes. Do not paste the historical captions:read/write policy labels as OAuth scopes.
- Privacy, Terms and actual support page https://clipsubtitles.com/help return200. /support is not the support route.
- Real ChatGPT/Safari happy path and completed charged export recorded; current application/infrastructure release gates green in CI33982834577. These do not replace a directory tool scan or reviewer-account acceptance.
- Demo recording and original exported MP4/SRT available without login.

## Remaining before submission

1. Resolve the concrete provider entitlement/age issue in `remaining-decisions-2026-09-05.md`. Do not mark the app as mature content to work around provider age restrictions, or claim a different transcription provider is deployed when it remains a plan.
2. Finish dedicated reviewer access and execute the saved five positive cases and three negative **non-trigger intent** cases. Record actual results and evidence, including explicit quote approval, export/download and cancellation. API security tests remain a separate appendix, not substitutes.
3. Complete the consent-only release and verify anonymous first-visit/reopen/withdrawal behavior against the serving revision. Reconcile policy/processor disclosures with the final active provider chain. The broader adults-only policy draft remains held; publishing consent controls alone does not resolve provider eligibility.
4. Reconcile final listing/release notes, availability, provider disclosures and imported annotation explanations against the actual release. Domain verification, 13-tool OAuth scan, all three screenshots/starters and all 39 justification fields are already saved and read back.
5. Present the reopened final draft and execution evidence to Joe. Binding terms/attestations and final submission remain for his explicit review/approval. No directory submission has been authorized or performed.

Official requirements checked2026-09-05:
https://developers.openai.com/plugins/deploy/submission-errors#final-directory-submission
https://developers.openai.com/plugins/deploy/submission

Domain verification, fresh tool discovery and JSON field persistence are complete; reviewer acceptance and provider eligibility remain distinct unfinished checks.
