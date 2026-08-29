'use client';

import { useEffect, useRef, useState } from 'react';
import type { CaptionPosition, GenerateCaptionsRequest, StylePresetId } from '@clipsubtitles/contracts';
import { STYLE_PRESETS } from '@clipsubtitles/core';
import { Dialog } from '@/components/ui/Dialog';
import { Button, Field, Segmented, TextInput } from '@/components/ui/primitives';

function newKey(): string {
  return `web-gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function GenerateDialog({ open, hasTranscript, onClose, onSubmit, busy }: { open: boolean; hasTranscript: boolean; onClose: () => void; onSubmit: (req: GenerateCaptionsRequest) => Promise<void> | void; busy: boolean }) {
  const [preset, setPreset] = useState<StylePresetId>('clean');
  const [position, setPosition] = useState<CaptionPosition>('bottom');
  const [language, setLanguage] = useState('');
  const [vocabulary, setVocabulary] = useState('');
  // One idempotency key per opened dialog: a retry after a network blip replays instead of duplicating the task.
  const keyRef = useRef(newKey());
  const submitting = useRef(false);
  useEffect(() => {
    if (open) keyRef.current = newKey();
  }, [open]);

  const submit = async () => {
    if (submitting.current || busy) return;
    submitting.current = true;
    try {
      const vocab = vocabulary.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
      await onSubmit({
        preset,
        position,
        ...(language.trim() ? { language: language.trim() } : {}),
        ...(vocab.length ? { vocabulary: vocab } : {}),
        idempotencyKey: keyRef.current,
      });
    } finally {
      submitting.current = false;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={hasTranscript ? 'Regenerate captions' : 'Generate captions'}
      description={`Transcription runs as a durable task. Words are transcribed verbatim — the vocabulary list only biases recognition of names and terms.${hasTranscript ? ' Regenerating replaces the current transcript with a new revision (history is kept).' : ''}`}
    >
      <div className="mt-4 flex flex-col gap-4">
        <Field label="Style preset">
          <Segmented<StylePresetId> value={preset} onChange={setPreset} size="sm" options={(Object.keys(STYLE_PRESETS) as StylePresetId[]).map((id) => ({ value: id, label: id.replace('-', ' ') }))} />
        </Field>
        <Field label="Position">
          <Segmented<CaptionPosition>
            value={position}
            onChange={setPosition}
            size="sm"
            options={[
              { value: 'top', label: 'Top' },
              { value: 'center', label: 'Centre' },
              { value: 'lower-third', label: 'Lower ⅓' },
              { value: 'bottom', label: 'Bottom' },
            ]}
          />
        </Field>
        <Field label="Spoken language (optional)" hint="BCP-47 tag such as en, en-US, pt-BR. Leave blank to auto-detect.">
          <TextInput value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="auto" maxLength={35} disabled={busy} />
        </Field>
        <Field label="Vocabulary (optional)" hint="Comma-separated names and terms.">
          <TextInput value={vocabulary} onChange={(e) => setVocabulary(e.target.value)} placeholder="ClipSubtitles, Lisbon, Pocket 3" disabled={busy} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" loading={busy} disabled={busy} onClick={() => void submit()}>
          {hasTranscript ? 'Regenerate' : 'Generate'}
        </Button>
      </div>
    </Dialog>
  );
}
