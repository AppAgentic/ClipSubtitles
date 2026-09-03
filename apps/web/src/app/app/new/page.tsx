'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { Button, TextInput } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { UploadZone } from '@/components/upload/UploadZone';
import { trackPaidFunnelEvent, trackPaidFunnelEventOnce } from '@/lib/attribution';
import { api, directUploadRequest, errorMessage, uploadToTarget } from '@/lib/api';
import { clearStagedUpload, takeStagedUpload } from '@/lib/staged-upload';

const SAMPLE_URL = '/marketing/clipsubtitles-sample.mp4';

export default function NewVideoPage() {
  return <AppShell render={() => <NewProject />} />;
}

function NewProject() {
  const router = useRouter();
  const toast = useToast();
  const restored = useRef(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [startingMessage, setStartingMessage] = useState<string | null>(null);

  const onFile = useCallback(
    async (file: File, source: 'picker' | 'landing' | 'sample' = 'picker') => {
      setBusy(true);
      setProgress(0);
      setStartingMessage(source === 'sample' ? 'Preparing the sample…' : null);
      if (source === 'picker' || source === 'sample') {
        trackPaidFunnelEvent('upload_selected', {
          source: source === 'sample' ? 'sample' : 'new_project',
          bytes: file.size,
          mime_type: file.type || 'unknown',
        });
      }
      try {
        const upload = directUploadRequest(file);
        const created = await api.createProject({
          fileName: file.name,
          ...(upload ? { upload } : {}),
        });
        if (!created.uploadTarget) throw new Error('No upload target returned.');
        await uploadToTarget(created.uploadTarget, file, setProgress);
        if (source === 'landing') await clearStagedUpload().catch(() => undefined);
        trackPaidFunnelEvent('upload_completed', {
          source,
          bytes: file.size,
          project_id: created.project.id,
        });
        toast.push('ok', source === 'sample' ? 'Sample ready.' : 'Video uploaded.');
        router.push(`/studio/${created.project.id}?generate=1&onboarding=1`);
      } catch (err) {
        toast.push('error', errorMessage(err));
        setBusy(false);
        setProgress(null);
        setStartingMessage(null);
      }
    },
    [router, toast],
  );

  useEffect(() => {
    trackPaidFunnelEventOnce('signup_completed');
    if (restored.current) return;
    restored.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      setStartingMessage('Preparing the sample…');
      fetch(SAMPLE_URL)
        .then(async (response) => {
          if (!response.ok) throw new Error('The sample is temporarily unavailable.');
          const blob = await response.blob();
          await onFile(
            new File([blob], 'clipsubtitles-sample.mp4', { type: 'video/mp4' }),
            'sample',
          );
        })
        .catch((err) => {
          toast.push('error', errorMessage(err));
          setStartingMessage(null);
        });
      return;
    }
    if (params.get('staged') === '1') {
      setStartingMessage('Restoring your selected clip…');
      takeStagedUpload()
        .then((staged) => {
          if (!staged) {
            setStartingMessage(null);
            toast.push('info', 'Choose your clip again to continue.');
            return;
          }
          return onFile(staged.file, 'landing');
        })
        .catch(() => {
          setStartingMessage(null);
          toast.push('info', 'Choose your clip again to continue.');
        });
    }
  }, [onFile, toast]);

  const importUrl = async () => {
    if (!url) return;
    setBusy(true);
    trackPaidFunnelEvent('upload_selected', { source: 'url' });
    try {
      const created = await api.createProject({ sourceUrl: url });
      trackPaidFunnelEvent('upload_completed', {
        source: 'url',
        project_id: created.project.id,
      });
      toast.push('ok', 'Import started.');
      router.push(`/studio/${created.project.id}?onboarding=1`);
    } catch (err) {
      toast.push('error', errorMessage(err));
      setBusy(false);
    }
  };

  const useSample = () => {
    setBusy(true);
    setStartingMessage('Preparing the sample…');
    fetch(SAMPLE_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error('The sample is temporarily unavailable.');
        const blob = await response.blob();
        await onFile(new File([blob], 'clipsubtitles-sample.mp4', { type: 'video/mp4' }), 'sample');
      })
      .catch((err) => {
        toast.push('error', errorMessage(err));
        setBusy(false);
        setStartingMessage(null);
      });
  };

  return (
    <div className="mx-auto max-w-[760px]">
      <ol
        className="rise mb-8 grid grid-cols-3 border-b border-line pb-4 text-[11px] text-ink-mute"
        aria-label="Captioning steps"
      >
        <li className="font-semibold text-signal">
          <span className="mono mr-2">01</span>Upload
        </li>
        <li className="text-center">
          <span className="mono mr-2">02</span>Review &amp; style
        </li>
        <li className="text-right">
          <span className="mono mr-2">03</span>Export
        </li>
      </ol>
      <div className="rise mb-6">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-signal">
          Your first clip
        </p>
        <h1 className="text-[34px] font-semibold tracking-[-0.04em] sm:text-[42px]">
          Choose a video to caption
        </h1>
        <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-ink-mute">
          We’ll generate the words and apply a polished starting style. You stay in control before
          export.
        </p>
      </div>
      <div className="rise rise-1">
        <UploadZone onFile={(file) => void onFile(file)} progress={progress} busy={busy} />
      </div>
      {startingMessage ? (
        <p className="mono mt-3 text-center text-[11px] text-signal" role="status">
          {startingMessage}
        </p>
      ) : null}
      <div className="rise rise-2 mt-5 flex flex-col items-center gap-3 border-t border-line pt-5 sm:flex-row sm:justify-between">
        <Button onClick={useSample} disabled={busy}>
          <span aria-hidden>▶</span> Try the sample video
        </Button>
        <span className="text-[11px] text-ink-mute">
          No video ready? See the complete flow in under a minute.
        </span>
      </div>
      <details className="rise rise-3 mt-5 border-t border-line pt-5">
        <summary className="cursor-pointer text-[12px] font-medium text-ink-dim hover:text-ink">
          Import from a public video URL
        </summary>
        <div className="mt-3 flex gap-2">
          <TextInput
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…/clip.mp4"
            inputMode="url"
          />
          <Button variant="primary" onClick={() => void importUrl()} disabled={!url || busy}>
            Import
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-ink-mute">
          The link must point directly to a public video file. Private links cannot be imported.
        </p>
      </details>
    </div>
  );
}
