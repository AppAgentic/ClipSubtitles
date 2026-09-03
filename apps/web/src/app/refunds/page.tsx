import type { Metadata } from 'next';
import { LegalList, LegalPage, LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Refunds and cancellation | ClipSubtitles',
  robots: { index: true, follow: true },
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund and Cancellation Policy"
      intro="This Policy explains how to cancel a ClipSubtitles subscription or request a refund. It does not limit rights that applicable law gives you."
    >
      <LegalSection title="Subscriptions">
        <p>
          Monthly and annual subscriptions renew automatically until cancelled. Annual subscriptions
          are charged in full for the year. You may turn off renewal at any time through{' '}
          <em>Manage subscription</em> in ClipSubtitles or through your Whop order. Cancellation
          stops the next charge and access normally continues until the current paid period ends.
        </p>
      </LegalSection>
      <LegalSection title="14-day consumer cancellation period">
        <p>
          If you are a UK consumer, you may cancel an initial online purchase within 14 days without
          giving a reason. We make the service available immediately at your request. If you use
          paid service during the cancellation period, we may deduct a proportionate amount for
          service already supplied only where the law permits. We will not reduce your statutory
          rights.
        </p>
      </LegalSection>
      <LegalSection title="Other refund requests">
        <LegalList>
          <li>Duplicate or demonstrably erroneous charges will be refunded.</li>
          <li>
            If a paid function is materially defective and we cannot repair or reperform it within a
            reasonable time, you may be entitled to a repeat performance, price reduction or refund.
          </li>
          <li>
            Outside statutory rights, completed billing periods and consumed credits are normally
            non-refundable. We will consider exceptional requests fairly.
          </li>
          <li>
            Unused credits attached to a refunded or reversed payment may be removed. Credits have
            no cash value and cannot be redeemed for cash.
          </li>
        </LegalList>
      </LegalSection>
      <LegalSection title="How to request cancellation or a refund">
        <p>
          Cancel renewal through your account or Whop order. To request a refund, use Whop’s
          Resolution Center from the relevant order or email{' '}
          <a className="text-signal" href="mailto:support@clipsubtitles.com">
            support@clipsubtitles.com
          </a>{' '}
          from the purchase email with the order date and reason. Do not send card details. We aim
          to acknowledge requests promptly; Whop states that Resolution Center decisions are made
          within a maximum of one week.
        </p>
      </LegalSection>
      <LegalSection title="Refund timing">
        <p>
          Approved refunds are returned through the original payment method. Bank and
          payment-network processing times are outside our control. Cancellation and refund
          confirmation will be provided in writing by email or through Whop.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
