'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  CaptionPosition,
  GenerateCaptionsRequest,
  StylePresetId,
} from '@clipsubtitles/contracts';
import { STYLE_PRESETS } from '@clipsubtitles/core';
import { Dialog } from '@/components/ui/Dialog';
import { Button, Field, Segmented, TextInput } from '@/components/ui/primitives';
import { PRESET_BLURBS, StylePresetVideo } from './StylePresetVideo';

function newKey(): string {
  return `web-gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function GenerateDialog({
  open,
  hasTranscript,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  hasTranscript: boolean;
  onClose: () => void;
  onSubmit: (req: GenerateCaptionsRequest) => Promise<void> | void;
  busy: boolean;
}) {
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
      const vocab = vocabulary
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 100);
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

  const choosePreset = (next: StylePresetId) => {
    setPreset(next);
    setPosition(STYLE_PRESETS[next].position);
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={hasTranscript ? 'Regenerate captions' : 'Generate captions'}
      description={`ClipSubtitles creates timed captions from the speech in your video. Add names or specialist terms below to help recognition.${hasTranscript ? ' Creating them again replaces the current captions while keeping the earlier version available for recovery.' : ''}`}
      width={660}
    >
      <div className="mt-4 flex flex-col gap-4">
        <Field label="Style preset">
          <div className="flex snap-x gap-2 overflow-x-auto pb-2">
            {(Object.keys(STYLE_PRESETS) as StylePresetId[]).map((id) => {
              const active = preset === id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={busy}
                  aria-pressed={active}
                  onClick={() => choosePreset(id)}
                  className={`w-40 shrink-0 snap-start overflow-hidden rounded-[18px] border p-1.5 text-left [corner-shape:squircle] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal ${active ? 'border-signal bg-signal/10' : 'border-line-strong hover:border-ink-mute'}`}
                >
                  <StylePresetVideo
                    preset={id}
                    active={active}
                    className="aspect-video rounded-[13px] [corner-shape:squircle]"
                  />
                  <strong className="mt-2 block px-1 text-[12px] capitalize text-ink">
                    {id.replaceAll('-', ' ')}
                  </strong>
                  <span className="block px-1 pb-1 text-[10px] text-ink-mute">
                    {PRESET_BLURBS[id]}
                  </span>
                </button>
              );
            })}
          </div>
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
        <Field
          label="Spoken language (optional)"
          hint="Enter a language such as English or en-US, or leave blank to detect it automatically."
        >
          <TextInput
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="Detect automatically"
            maxLength={35}
            disabled={busy}
          />
        </Field>
        <Field
          label="Names and terms (optional)"
          hint="Separate names, places or specialist words with commas."
        >
          <TextInput
            value={vocabulary}
            onChange={(e) => setVocabulary(e.target.value)}
            placeholder="ClipSubtitles, Lisbon, Pocket 3"
            disabled={busy}
          />
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
