import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Privacy | ClipSubtitles', robots: { index: true, follow: true } };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-20">
      <Link href="/" className="text-sm text-ink-dim">← ClipSubtitles</Link>
      <h1 className="mt-12 text-5xl font-semibold tracking-tight">Privacy</h1>
      <div className="mt-8 space-y-5 text-[15px] leading-7 text-ink-dim">
        <p>Updated 5 September 2026.</p>
        <p>ClipSubtitles uses account information to provide your workspace and process the videos you choose to upload. Essential sign-in, security and server-side account, project and task records continue independently of optional measurement.</p>
        <p>Source media expires after 30 days and completed exports after 7 days under our fixed application policy. A daily cleanup job removes expired media; failed deletions remain eligible for retry, so physical deletion may occur later. Deleting a project attempts to remove its source and output files and removes it from your active workspace when successful. Project metadata is soft-deleted, and transcript, security, billing, audit and backup records may remain. Contact us for an account-level deletion request and the scope of any retained records. We do not sell your personal information.</p>
        <p>To create captions, we send extracted audio to ElevenLabs, our primary transcription provider. Google Gemini is the configured fallback if the primary provider cannot complete transcription. These providers receive the audio needed to produce transcript words and timestamps. ElevenLabs model improvement is currently enabled for our workspace, so submitted data may also be used to improve its models under its applicable terms. See <a className="text-signal" href="https://elevenlabs.io/privacy-policy">ElevenLabs privacy information</a> and <a className="text-signal" href="https://ai.google.dev/gemini-api/terms">Google Gemini API terms</a> for their processing conditions.</p>
        <p>Optional browser usage analytics and advertising measurement are off until you choose to enable them. You can enable them separately or choose Essential only. Reopen Privacy choices on any page to change or withdraw your choice. The choice is remembered for up to 180 days. Attribution data is accepted for up to 90 days after capture. Withdrawal clears stored attribution identifiers and stops the corresponding future collection; it does not undo processing already completed.</p>
        <p>Browser usage analytics records feature events in our application. Advertising measurement stores campaign and click identifiers and associates eligible purchases with those campaigns through AppRefer. It does not send video or transcript content to AppRefer.</p>
        <p>Gleap support loads only when you choose to open Help or Contact support; automatic support page tracking is disabled. When you are signed in, support receives your user and workspace identifiers, display name, workspace name, available credits, authentication type and masked email so we can help with your account. Information you choose to send in a support conversation is processed by Gleap.</p>
        <p>Other service providers support authentication, storage, rendering and billing. Contact <a className="text-signal" href="mailto:privacy@clipsubtitles.com">privacy@clipsubtitles.com</a> for access or deletion requests.</p>
      </div>
    </main>
  );
}
