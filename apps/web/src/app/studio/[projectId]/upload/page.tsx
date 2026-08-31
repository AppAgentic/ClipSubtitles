'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CaptionProject } from '@clipsubtitles/contracts';
import { AppShell } from '@/components/shell/AppShell';
import { Chip, LinkButton, statusTone } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { UploadZone } from '@/components/upload/UploadZone';
import { api, bestUploadTarget, errorMessage, uploadToTarget } from '@/lib/api';
import { titleCase } from '@/lib/format';

export default function StudioUploadPage() {
  return <AppShell render={() => <Upload />} />;
}

function Upload() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const toast = useToast();
  const [project, setProject] = useState<CaptionProject | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getProject(params.projectId)
      .then(setProject)
      .catch((err) => toast.push('error', errorMessage(err)));
  }, [params.projectId, toast]);

  const onFile = async (file: File) => {
    setBusy(true);
    setProgress(0);
    try {
      const target = await bestUploadTarget(params.projectId, file);
      await uploadToTarget(target, file, setProgress);
      toast.push('ok', 'Video uploaded. You can create captions now.');
      router.push(`/studio/${params.projectId}?generate=1`);
    } catch (err) {
      toast.push('error', errorMessage(err));
      setBusy(false);
      setProgress(null);
    }
  };

  if (!project) return <div className="text-[13px] text-ink-mute">Loading project…</div>;
  const needsSource = project.status === 'awaiting_source' || project.status === 'failed';

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="rise mb-6">
        <div className="mb-2 flex items-center gap-2">
          <Chip tone={statusTone(project.status)}>{titleCase(project.status)}</Chip>
        </div>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">{project.title}</h1>
        <p className="text-[13px] text-ink-mute">
          {needsSource ? 'Choose the video you want to caption.' : 'This video is ready to open.'}
        </p>
      </div>
      {needsSource ? (
        <div className="rise rise-1">
          <UploadZone onFile={(f) => void onFile(f)} progress={progress} busy={busy} />
        </div>
      ) : (
        <LinkButton href={`/studio/${project.id}`} variant="primary">
          Open in editor
        </LinkButton>
      )}
    </div>
  );
}
