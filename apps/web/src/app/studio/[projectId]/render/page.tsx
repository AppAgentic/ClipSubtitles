'use client';

import { useParams } from 'next/navigation';
import { RenderFlow } from '@/components/render/RenderFlow';
import { AppShell } from '@/components/shell/AppShell';

export default function StudioRenderPage() {
  const params = useParams<{ projectId: string }>();
  return <AppShell render={() => <RenderFlow projectId={params.projectId} />} />;
}
