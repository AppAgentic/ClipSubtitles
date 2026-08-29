import type { Metadata } from 'next';
import { ContractSheet } from '@/components/landing-options/ContractSheet';

export const metadata: Metadata = {
  title: 'Video Caption API with Human Approval',
  description: 'A video caption API for agents with human approval of exact words, render cost and output formats.',
};

export default function ContractSheetPage() {
  return <ContractSheet />;
}
