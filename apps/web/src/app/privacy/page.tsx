import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalList, LegalPage, LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy | ClipSubtitles',
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This Policy explains how APP AGENTIC LTD uses personal data when you visit or use ClipSubtitles. APP AGENTIC LTD is the controller for the processing described here."
    >
      <LegalSection title="1. Contact and controller">
        <p>
          APP AGENTIC LTD is registered in England and Wales under company number 16428873, with
          registered office at 12 Bramble Way, Stockport, England, SK7 5EE. Contact{' '}
          <a className="text-signal" href="mailto:privacy@clipsubtitles.com">
            privacy@clipsubtitles.com
          </a>{' '}
          about this Policy or your rights.
        </p>
      </LegalSection>
      <LegalSection title="2. Data we process">
        <LegalList>
          <li>
            Account data, including your WorkOS identity, email address, display name, session and
            workspace identifiers.
          </li>
          <li>
            Content you choose to upload, including video, audio, filenames and technical media
            metadata.
          </li>
          <li>
            Derived content, including transcripts, word timings, caption pages, edits, styles,
            quotes, tasks, previews and exported files.
          </li>
          <li>
            Billing data, including plan, credit, transaction, membership, invoice and payment-event
            identifiers. We do not receive full card details.
          </li>
          <li>
            Support data you submit, plus limited account, workspace, page and diagnostic context
            when you open the support service.
          </li>
          <li>
            Security and operations data, including IP address, request metadata, rate-limit, audit,
            error and fraud-prevention records.
          </li>
        </LegalList>
      </LegalSection>
      <LegalSection title="3. Why we use it and our lawful bases">
        <LegalList>
          <li>
            <strong>Contract:</strong> to authenticate you, provide your workspace, process media,
            create captions and exports, administer plans and respond to service requests.
          </li>
          <li>
            <strong>Legitimate interests:</strong> to secure, diagnose and improve the service,
            prevent fraud, maintain audit trails and provide support, where those interests are not
            overridden by your rights.
          </li>
          <li>
            <strong>Legal obligation:</strong> to keep records and respond to lawful requests
            concerning tax, accounting, disputes, security and consumer rights.
          </li>
          <li>
            <strong>Consent:</strong> where the law specifically requires it. You may withdraw
            consent without affecting earlier lawful processing.
          </li>
        </LegalList>
        <p>
          You are not required by law to provide account or media data, but we cannot provide the
          requested service without the data needed for that function. We do not use solely
          automated decisions that produce legal or similarly significant effects.
        </p>
      </LegalSection>
      <LegalSection title="4. Service providers">
        <p>We use vetted providers to perform defined functions on our behalf:</p>
        <LegalList>
          <li>WorkOS for authentication and identity.</li>
          <li>Cloudflare R2 for private media and export storage.</li>
          <li>ElevenLabs for primary speech-to-text processing.</li>
          <li>Google Gemini for fallback speech-to-text when the primary service fails.</li>
          <li>
            Google Cloud for hosting, database, queues, rendering, secrets, security and operational
            logs.
          </li>
          <li>
            Whop for checkout, transaction taxes, payments, subscriptions, invoices, refunds and
            disputes.
          </li>
          <li>Gleap for help-centre and user-requested support interactions.</li>
        </LegalList>
        <p>
          These providers may process data only for the contracted service and their own limited
          legal or security obligations. We do not sell personal data or use customer media to train
          a ClipSubtitles model.
        </p>
      </LegalSection>
      <LegalSection title="5. International transfers">
        <p>
          Some providers process data outside the UK. Where UK transfer rules apply, we rely on
          adequacy regulations or approved contractual safeguards, such as the UK International Data
          Transfer Agreement or UK Addendum, together with risk-based supplementary measures where
          needed. Contact us for more information about the safeguard relevant to a transfer.
        </p>
      </LegalSection>
      <LegalSection title="6. Storage and retention">
        <LegalList>
          <li>Source media: 30 days by default; you may choose 1–365 days.</li>
          <li>Preview exports: 24 hours.</li>
          <li>Final exports: 7 days by default; you may choose 1–90 days.</li>
          <li>
            Upload targets: 1 hour; signed playback/download links: 15 minutes; open render quotes:
            15 minutes; idempotency records: 7 days.
          </li>
          <li>
            Transcript, caption and project metadata remains while the project is active so you can
            continue editing after source media expires.
          </li>
        </LegalList>
        <p>
          Deleting a project immediately starts deletion of its source and output objects and
          removes it from your workspace. Limited audit, security, backup, billing, tax and dispute
          records may remain for the period reasonably required by law or to establish, exercise or
          defend legal claims. Account-deletion requests are normally completed within 30 days after
          identity and scope are verified, subject to those lawful exceptions.
        </p>
      </LegalSection>
      <LegalSection title="7. Cookies and local storage">
        <p>
          We use storage that is necessary for sign-in, security, theme choice and user-requested
          service functions. We do not currently use advertising cookies. The Gleap support service
          is initialized only when you choose to open support. If we introduce non-essential
          analytics or advertising storage, we will ask for any consent required before using it.
        </p>
      </LegalSection>
      <LegalSection title="8. Your rights">
        <p>
          Depending on where you live, you may have rights to access, correct, erase, restrict,
          object to or obtain a portable copy of personal data, and to withdraw consent. Email{' '}
          <a className="text-signal" href="mailto:privacy@clipsubtitles.com">
            privacy@clipsubtitles.com
          </a>{' '}
          from your account address. We may need proportionate information to verify your identity.
          We normally respond within one month.
        </p>
        <p>
          UK users may complain to the{' '}
          <a className="text-signal" href="https://ico.org.uk/make-a-complaint/">
            Information Commissioner’s Office
          </a>
          . Please contact us first if you are comfortable doing so, so we can try to resolve the
          issue.
        </p>
      </LegalSection>
      <LegalSection title="9. Security, children and changes">
        <p>
          We use access controls, encryption in transit, private object storage, short-lived signed
          URLs, logging redaction and least-privilege service identities. No system is completely
          secure, so tell us promptly if you suspect a problem.
        </p>
        <p>
          ClipSubtitles is for people aged 18 or over and is not directed to children. Contact us if
          you believe a child has provided personal data.
        </p>
        <p>
          We will update this Policy when our processing materially changes and will give
          appropriate notice. The effective date above shows the current version.
        </p>
      </LegalSection>
      <LegalSection title="10. Related policies">
        <p>
          See our{' '}
          <Link className="text-signal" href="/terms">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link className="text-signal" href="/refunds">
            Refund and Cancellation Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
