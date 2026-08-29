import type { Metadata } from 'next';
import { ThreeGates } from '@/components/landing-options/ThreeGates';

export const metadata: Metadata = {
  title: '05 · Three Gates',
  description: 'Agents do the work. Three decisions stay yours.',
};

export default function ThreeGatesPage() {
  return <ThreeGates />;
}
