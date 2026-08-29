import type { Metadata } from 'next';
import { TaskLedger } from '@/components/landing-options/TaskLedger';

export const metadata: Metadata = {
  title: 'Video Caption API for High-Volume Workflows',
  description: 'Batch-caption short videos through MCP or REST with tracked jobs, fixed quotes and exactly-once credit handling.',
};

export default function TaskLedgerPage() {
  return <TaskLedger />;
}
