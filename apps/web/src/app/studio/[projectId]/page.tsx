'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { EditorView } from '@/components/editor/EditorView';
import { AppShell } from '@/components/shell/AppShell';

export default function StudioProjectPage() {
  const params = useParams<{ projectId: string }>();
  return (
    <AppShell wide>
      <Suspense>
        <EditorView projectId={params.projectId} />
      </Suspense>
    </AppShell>
  );
}
