import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalList, LegalPage, LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms | ClipSubtitles',
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These Terms govern your use of ClipSubtitles. Please read them before creating an account or buying a plan or credit top-up."
    >
      <LegalSection title="1. Who we are">
        <p>
          ClipSubtitles is operated by APP AGENTIC LTD, a company registered in England and Wales
          under company number 16428873. Our registered office is 12 Bramble Way, Stockport,
          England, SK7 5EE. In these Terms, “we”, “us” and “ClipSubtitles” refer to APP AGENTIC LTD.
        </p>
        <p>
          Contact us at{' '}
          <a className="text-signal" href="mailto:support@clipsubtitles.com">
            support@clipsubtitles.com
          </a>
          .
        </p>
      </LegalSection>
      <LegalSection title="2. Eligibility and accounts">
        <p>
          You must be at least 18 years old to use ClipSubtitles. If you use the service for an
          organisation, you confirm that you have authority to bind it. Keep your account secure and
          tell us promptly if you suspect unauthorised use.
        </p>
      </LegalSection>
      <LegalSection title="3. The service">
        <p>
          ClipSubtitles transcribes speech, lets you edit and style captions, and creates
          downloadable caption files and rendered media. Automated transcription and rendering can
          contain errors. You are responsible for reviewing outputs before publishing or relying on
          them.
        </p>
        <p>
          We may improve or change features where this does not remove a service you have already
          paid to receive. We do not promise uninterrupted availability, but your statutory rights
          are not affected.
        </p>
      </LegalSection>
      <LegalSection title="4. Your content">
        <p>
          You retain ownership of content you upload and of any rights you hold in the resulting
          output. You give us a limited, worldwide licence to host, copy, transcode, transmit and
          process that content only as needed to operate, secure and support the service.
        </p>
        <p>
          You must have the rights and permissions needed to upload and process each file, including
          copyright, privacy, publicity and data-protection permissions. You must not upload
          unlawful, harmful, deceptive, rights-infringing or malicious content, or use ClipSubtitles
          to violate another person’s rights.
        </p>
      </LegalSection>
      <LegalSection title="5. Prices, credits and payment">
        <LegalList>
          <li>
            Prices are shown in US dollars. Applicable taxes are calculated and added at checkout
            where required.
          </li>
          <li>
            Finished video and overlay renders consume the number of credits shown in the immutable
            quote you approve. Previews, editing, SRT and VTT exports do not consume credits under
            the current catalog.
          </li>
          <li>
            Subscription credits are granted for the relevant billing period and may remain
            available for two additional months after that period ends. Purchased top-up credits do
            not routinely expire while your account remains open.
          </li>
          <li>
            Credits have no cash value, cannot be transferred, and may be used only for
            ClipSubtitles services. We may reverse unused credits attached to a refunded or reversed
            payment.
          </li>
        </LegalList>
        <p>
          Payments and payment details are handled by Whop. Whop may appear on receipts and may
          calculate, collect or remit transaction taxes, but APP AGENTIC LTD remains the supplier of
          ClipSubtitles. Our{' '}
          <Link className="text-signal" href="/refunds">
            Refund and Cancellation Policy
          </Link>{' '}
          forms part of these Terms.
        </p>
      </LegalSection>
      <LegalSection title="6. Subscriptions and cancellation">
        <p>
          Paid plans renew automatically each month or year, according to the option shown at
          checkout, until cancelled. Annual plans are charged for the full year in advance. Before
          purchase, checkout will show the plan, total price, billing interval and applicable taxes.
        </p>
        <p>
          You can turn off renewal through <em>Manage subscription</em> in your account or through
          your Whop order. Cancellation stops the next renewal; access normally continues until the
          end of the period already paid for. We will not charge a cancellation fee.
        </p>
      </LegalSection>
      <LegalSection title="7. Consumer rights and refunds">
        <p>
          Nothing in these Terms excludes rights that cannot lawfully be excluded. UK consumers may
          have a 14-day cancellation right for distance contracts. By asking us to make paid service
          available immediately, you request performance during that period. If you cancel after
          using paid service, any deduction or refund will be handled only as permitted by law. See
          the Refund and Cancellation Policy for the request process.
        </p>
      </LegalSection>
      <LegalSection title="8. Suspension and termination">
        <p>
          You may stop using the service at any time. We may suspend or terminate access where
          reasonably necessary for security, non-payment, material breach, unlawful use or
          protection of other users or the service. Where practical, we will give notice and an
          opportunity to remedy the issue.
        </p>
      </LegalSection>
      <LegalSection title="9. Our intellectual property">
        <p>
          We and our licensors own the service, software, branding and materials we provide,
          excluding your content. These Terms give you no right to copy, resell, reverse engineer or
          misuse them except where applicable law permits.
        </p>
      </LegalSection>
      <LegalSection title="10. Liability">
        <p>
          We do not exclude liability where doing so would be unlawful, including liability for
          death or personal injury caused by negligence, fraud or fraudulent misrepresentation. For
          consumers, we are responsible for foreseeable loss caused by our breach, but not business
          losses. If you use ClipSubtitles for business purposes, our total liability arising from
          the service is limited to the amount you paid us in the 12 months before the event giving
          rise to the claim, except where that limit is unlawful.
        </p>
      </LegalSection>
      <LegalSection title="11. Privacy, changes and law">
        <p>
          Our{' '}
          <Link className="text-signal" href="/privacy">
            Privacy Policy
          </Link>{' '}
          explains how we process personal data. We may update these Terms for legal, security or
          service changes. We will give reasonable notice of material changes; changes will not
          retrospectively remove accrued rights.
        </p>
        <p>
          These Terms are governed by the laws of England and Wales. The courts of England and Wales
          have jurisdiction, except that consumers retain any mandatory right to bring proceedings
          in their home courts or rely on mandatory local law.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
