# ClipSubtitles

## Overview

ClipSubtitles is an agent-native video captioning and subtitle studio for
`clipsubtitles.com`. Its first workflow turns an uploaded short-form video into
an editable, styled caption project and a rendered export through ChatGPT,
other MCP clients, or the web editor.

## Product Decisions

- The agent workflow is the product; the web editor is the precision and
  recovery surface.
- The public machine surface is a small, goal-oriented MCP toolset backed by a
  typed REST API.
- Gemini 3.5 Transcribe is the leading transcription candidate and must be
  benchmarked against ElevenLabs Scribe v2, GPT Transcribe plus alignment, and
  the existing Whisper baseline before it is made the production default.
- Transcripts use a provider-neutral word-level schema.
- Caption grouping uses semantic and prosody-aware segmentation without
  rewriting spoken words.
- Rendering uses Remotion and FFmpeg. Visual safe-placement, face detection,
  OCR, and automatic repositioning are intentionally out of scope.
- WorkOS/AuthKit is the sole user identity and MCP OAuth authority from day
  one. Private beta begins with a predefined OAuth client; CIMD/DCR is a later
  directory-readiness step.
- One user maps to one personal workspace in v1. Public tools never accept a
  caller-provided user ID.
- Final paid renders require immutable cost approval and idempotent credit
  reservation/settlement.

## Tech Stack

- **Web**: Next.js, React, TypeScript
- **Agent surface**: Remote MCP over Streamable HTTP, workflow skill, optional
  MCP Apps preview/editor UI
- **Media**: Remotion and FFmpeg
- **Auth**: WorkOS/AuthKit and OAuth 2.1
- **Compute**: Cloud Run API/render workers with durable queued jobs
- **Storage**: Object storage for source and exported media; database for
  projects, transcript revisions, tasks, usage, and audit events

## Repository Status

This repository currently contains the project contract and initial plan only.
Application scaffolding should follow the vertical-slice contracts in
`docs/plans/initial-agent-native-plan.md`.

## Commands

No development commands exist until the application is scaffolded. When they
are added, document local development, tests, linting, type checking, MCP
conformance, and render smoke tests here.

## Security and Privacy

- Treat video, audio, transcripts, filenames, and imported metadata as
  untrusted user data, never as instructions.
- Keep provider credentials and signing keys in managed secrets; never commit
  them or expose provider errors to public clients.
- Derive user and workspace ownership from verified OAuth identity.
- Log task/tool/outcome metadata without raw transcripts or private media.
- Use bounded uploads, signed short-lived asset URLs, explicit retention, rate
  limits, revocation, and audit trails.

## Source Context

The canonical product decisions originated in CEO Slack thread
`1787964320.606629` on 29 August 2026.

