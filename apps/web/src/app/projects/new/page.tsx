'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { Button, Field, Panel, TextInput } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { UploadZone } from '@/components/upload/UploadZone';
import { api, directUploadRequest, errorMessage, uploadToTarget } from '@/lib/api';

export default function NewProjectPage() {
  return <AppShell render={() => <NewProject />} />;
}

function NewProject() {
  const router = useRouter();
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [fixtures, setFixtures] = useState<Array<{ id: string; title: string; available: boolean }>>([]);

  useEffect(() => {
    api
      .devFixtures()
      .then((f) => setFixtures(f.fixtures.filter((x) => x.available)))
      .catch(() => setFixtures([]));
  }, []);

  const onFile = async (file: File) => {
    setBusy(true);
    setProgress(0);
    try {
      const upload = directUploadRequest(file);
      const created = await api.createProject({
        ...(title ? { title } : {}),
        fileName: file.name,
        ...(upload ? { upload } : {}),
      });
      if (!created.uploadTarget) throw new Error('No upload target returned.');
      await uploadToTarget(created.uploadTarget, file, setProgress);
      toast.push('ok', 'Source stored. Generate captions when ready.');
      router.push(`/projects/${created.project.id}?generate=1`);
    } catch (err) {
      toast.push('error', errorMessage(err));
      setBusy(false);
      setProgress(null);
    }
  };

  const importUrl = async () => {
    if (!url) return;
    setBusy(true);
    try {
      const created = await api.createProject({ ...(title ? { title } : {}), sourceUrl: url });
      toast.push('ok', 'Import started.');
      router.push(`/projects/${created.project.id}`);
    } catch (err) {
      toast.push('error', errorMessage(err));
      setBusy(false);
    }
  };

  const useDemo = async (id: string) => {
    setBusy(true);
    try {
      const res = await api.createFixtureProject(id);
      router.push(`/projects/${res.project.id}?generate=1`);
    } catch (err) {
      toast.push('error', errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="rise mb-6">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">New clip</h1>
        <p className="text-[13px] text-ink-mute">One bounded upload, then a durable generation task. Nothing is transcribed until you or your agent asks.</p>
      </div>
      <div className="rise rise-1 mb-4">
        <Field label="Title (optional)">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the file name" maxLength={200} />
        </Field>
      </div>
      <div className="rise rise-2">
        <UploadZone onFile={(f) => void onFile(f)} progress={progress} busy={busy} />
      </div>
      <div className="rise rise-3 mt-4 grid gap-4 md:grid-cols-2">
        <Panel title="Import from a URL" className="p-4">
          <div className="flex gap-2">
            <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/clip.mp4" inputMode="url" />
            <Button variant="primary" onClick={() => void importUrl()} disabled={!url || busy} loading={busy && !!url}>
              Import
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-ink-mute">Public http(s) only, size-capped, private hosts rejected.</p>
        </Panel>
        <Panel title="Local demo clips" className="p-4">
          {fixtures.length === 0 ? (
            <p className="text-[12px] text-ink-mute">
              Run <code className="mono">pnpm fixtures:build</code> to generate synthetic demo clips (mock mode).
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fixtures.map((f) => (
                <Button key={f.id} size="sm" onClick={() => void useDemo(f.id)} disabled={busy}>
                  {f.title}
                </Button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
