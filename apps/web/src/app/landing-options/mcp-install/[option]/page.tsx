import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { McpInstallOptions, type McpDesignSlug } from '@/components/landing-options/McpInstallOptions';

export const dynamicParams = false;

const DESIGNS = [
  { slug: 'prompt-bar', name: 'Prompt Bar' },
  { slug: 'client-board', name: 'Client Board' },
  { slug: 'one-line-menu', name: 'One Line + Menu' },
  { slug: 'proof-dock', name: 'Docked to Proof' },
  { slug: 'three-step', name: 'Three-Step' },
] as const;

export function generateStaticParams() {
  return DESIGNS.map(({ slug }) => ({ option: slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ option: string }> }): Promise<Metadata> {
  const { option } = await params;
  const design = DESIGNS.find(({ slug }) => slug === option);
  return { title: design ? `${design.name} MCP install UI` : 'MCP install UI', robots: { index: false, follow: false } };
}

export default async function McpInstallOptionPage({ params }: { params: Promise<{ option: string }> }) {
  const { option } = await params;
  if (!DESIGNS.some(({ slug }) => slug === option)) notFound();
  return <McpInstallOptions variant={option as McpDesignSlug} />;
}
