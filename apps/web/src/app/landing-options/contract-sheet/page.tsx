import type { Metadata } from 'next';
import { ContractSheet } from '@/components/landing-options/ContractSheet';

export const metadata: Metadata = {
  title: '02 · Contract Sheet',
  description: 'Captions your agent can run, under terms you can read.',
};

export default function ContractSheetPage() {
  return <ContractSheet />;
}
