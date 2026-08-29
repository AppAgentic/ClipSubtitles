import type { Metadata } from 'next';
import { TaskLedger } from '@/components/landing-options/TaskLedger';

export const metadata: Metadata = {
  title: '04 · Task Ledger',
  description: 'Let agents run the queue. Keep the ledger.',
};

export default function TaskLedgerPage() {
  return <TaskLedger />;
}
