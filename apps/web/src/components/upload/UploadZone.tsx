'use client';

import { useCallback, useRef, useState } from 'react';
import { SUPPORTED_SOURCE_EXTENSIONS } from '@clipsubtitles/contracts';
import { Progress } from '@/components/ui/primitives';
import { bytes } from '@/lib/format';

export function UploadZone({ onFile, progress, busy, maxBytes }: { onFile: (file: File) => void; progress: number | null; busy: boolean; maxBytes?: number }) {
  const [over, setOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const pick = useCallback(
    (f: File | undefined) => {
      if (!f) return;
      setFile(f);
      onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files[0]);
      }}
      onClick={() => !busy && input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') input.current?.click();
      }}
      className={`relative grid min-h-[260px] cursor-pointer place-items-center overflow-hidden rounded-[18px] border transition-colors ${over ? 'border-signal bg-signal/5' : 'border-line-strong bg-panel/60 hover:border-ink-mute'}`}
    >
      <svg className={`ants pointer-events-none absolute inset-0 h-full w-full ${over ? 'opacity-100' : 'opacity-0'}`} aria-hidden>
        <rect x="6" y="6" width="calc(100% - 12px)" height="calc(100% - 12px)" rx="14" fill="none" stroke="#ff7a1a" strokeWidth="1.5" strokeDasharray="8 8" />
      </svg>
      <input
        ref={input}
        type="file"
        accept={SUPPORTED_SOURCE_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <div className="flex max-w-[420px] flex-col items-center gap-3 px-6 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line-strong bg-bg-elev text-[20px] text-signal">↑</div>
        {file ? (
          <>
            <div className="text-[15px] font-medium text-ink">{file.name}</div>
            <div className="mono text-[11px] text-ink-mute">
              {bytes(file.size)} · {file.type || 'unknown type'}
            </div>
            {progress !== null ? (
              <div className="w-full">
                <Progress value={progress * 100} />
                <div className="mono mt-1 text-[11px] text-ink-mute">{progress >= 1 ? 'Probing media…' : `${Math.round(progress * 100)}% uploaded`}</div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="text-[17px] font-semibold tracking-[-0.02em]">Drop a clip here, or click to choose</div>
            <div className="text-[12px] text-ink-mute">
              MP4, MOV, WEBM, MKV, or audio · up to {maxBytes ? bytes(maxBytes) : '500 MB'} and 10 minutes
            </div>
          </>
        )}
      </div>
    </div>
  );
}
