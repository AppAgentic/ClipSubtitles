# OpenAI submission status — 2026-09-05

Prepared, not submitted. Joe authorized adding the demo and reporting remaining work in Slack turn1788635965.663599. This audit supersedes legacy pre-deploy statements and form limits in the earlier packet; it does not claim those drafts are ready to paste unchanged.

## Demo URL to paste

https://clipsubtitles.com/review/caption-workflow-20260905/index.html

Direct MP4: https://clipsubtitles.com/marketing/clipsubtitles-reviewer-punchy-20260905-v3.mp4

Added to capability-manifest.json and submission-checklist.md. The109.7second version covers the fresh ChatGPT upload, transcription, style, visible correction selection/result, explicit3credit approval, render, MP4download, SRTrequest and actual exported result. Retained footage is normal speed. Anonymous page/media, file hashes/range requests and canonical Safari playback/chapters passed. See demo-recording-2026-09-05.md for source limitations and exact hashes.

## Current portal readback

Authenticated in AppAgentic Organization. Created the correctly named ClipSubtitles project and ClipSubtitles0.1.0draft under the operator's request to add the video. Name, version and Demo Recording URL persisted after Exit and reopen, verified in the exact ClipSubtitles project/draft. Evidence: local screenshot `submission-demo-persisted.png`. No attestations or submission were performed.

- Project: `proj_1XtY6cMajsOV2P94CWKITYxr`
- Draft: `asdk_app_6a9c6c7c3bd481918c6e63e5a7658fe9`
- Version: `asdk_app_v_6a9c6c7d7e8081918b0209a73989cc3d`

During prerequisite inspection, Create plugin → With MCP → Continue unexpectedly created an untitled draft under the previous project. Only that newly created empty draft was removed; the existing AppStoreCopilot draft was verified unchanged. The create-on-Continue behavior is recorded in the owning shared skill.

## Verified available

- Production website and MCP resource deployed; current public protected-resource metadata returns200, WorkOS authorization server, and openid/profile/email/offline_access scopes. Do not paste the historical captions:read/write policy labels as OAuth scopes.
- Privacy, Terms and actual support page https://clipsubtitles.com/help return200. /support is not the support route.
- Real ChatGPT/Safari happy path and completed charged export recorded; current application/infrastructure release gates green in CI33982834577. These do not replace a directory tool scan or reviewer-account acceptance.
- Demo recording and original exported MP4/SRT available without login.

## Remaining before submission

1. Confirm the developer identity verification state in the new ClipSubtitles draft. The project/draft and demo URL are now prepared.
2. Complete OpenAI domain verification and a current production MCP tool scan in that draft, including OAuth reviewer access, per-tool annotation justifications and UI frame-domain explanations. The existing ChatGPT developer connection is not proof of saved directory verification/scan.
3. Finalize listing fields to current limits: display name/short description30characters, long description4000, up to3unique starter prompts128characters each; select a supported category, final logos, countries and languages. The old60/160character headings and ten-prompt library are not current portal-ready fields.
4. Prepare exactly5positive and3negative reviewer test cases plus release notes. The technical fixture is a useful source but is not this required form packet. Confirm a dedicated reviewer identity with sufficient demo credits and no MFA/email-code obstruction; Joe's recorded account is not evidence that those credentials exist.
5. For the custom UI, provide onePNG/JPEG per selected starter prompt, exactly706px wide and400–860px tall. Existing1440×900/390×844 engineering screenshots are not the final listing set.
6. Complete policy/owner review and required attestations. Current Privacy/Terms remain early-access text and explicitly promise dated jurisdiction-reviewed versions before live payments; reconcile data handling, controller/contact details, retention and processor terms before making attestations. Live Whop enablement and paid-traffic alert delivery are separate launch gates, not assumed mandatory just to upload a demo URL.
7. Recheck final draft and explicitly approve Submit. No directory submission has been authorized or performed.

Official requirements checked2026-09-05:
https://developers.openai.com/plugins/deploy/submission-errors#final-directory-submission
https://developers.openai.com/plugins/deploy/submission

A successful portal scan/identity verification readback may close items1–2; until then they remain unverified, not asserted failures.
