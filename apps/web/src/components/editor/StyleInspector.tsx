'use client';

import type { CaptionPosition, StyleConfig, StylePatch, StylePresetId } from '@clipsubtitles/contracts';
import { STYLE_PRESETS } from '@clipsubtitles/core';
import { Field, Segmented, Slider, Toggle } from '@/components/ui/primitives';

const PRESET_BLURBS: Record<StylePresetId, string> = {
  clean: 'Bold, centred, soft shadow',
  'bold-pop': 'Uppercase, word highlight',
  'lower-third': 'Left-aligned on a plate',
  karaoke: 'Word-by-word highlight',
  minimal: 'Small, single line, plate',
};

function rgb(hex: string): string {
  return hex.slice(0, 7);
}

function alpha(hex: string): number {
  return hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
}

function withAlpha(hex: string, a: number): string {
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `${rgb(hex).toUpperCase()}${v}`;
}

export function StyleInspector({
  style,
  onStyle,
  onPreset,
  onPosition,
  busy,
}: {
  style: StyleConfig;
  onStyle: (patch: StylePatch) => void;
  onPreset: (preset: StylePresetId) => void;
  onPosition: (position: CaptionPosition) => void;
  busy: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
      <section>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-mute">Preset</div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(STYLE_PRESETS) as StylePresetId[]).map((id) => {
            const p = STYLE_PRESETS[id];
            const active = style.preset === id;
            return (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => onPreset(id)}
                className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${active ? 'border-signal bg-signal/10' : 'border-line-strong hover:border-ink-mute'}`}
              >
                <div
                  className="truncate"
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: p.fontWeight,
                    fontSize: 13,
                    textTransform: p.textTransform === 'uppercase' ? 'uppercase' : 'none',
                    color: p.textColor,
                    WebkitTextStroke: p.stroke.widthPct > 0 ? `0.6px ${rgb(p.stroke.color)}` : undefined,
                    paintOrder: 'stroke fill',
                  }}
                >
                  {id.replace('-', ' ')}
                </div>
                <div className="mt-0.5 text-[10px] text-ink-mute">{PRESET_BLURBS[id]}</div>
              </button>
            );
          })}
        </div>
      </section>

      <Field label="Position">
        <Segmented<CaptionPosition>
          value={style.position}
          onChange={onPosition}
          size="sm"
          options={[
            { value: 'top', label: 'Top' },
            { value: 'center', label: 'Centre' },
            { value: 'lower-third', label: 'Lower ⅓' },
            { value: 'bottom', label: 'Bottom' },
          ]}
        />
      </Field>

      <Field label="Size">
        <Slider value={style.fontSizePct} min={0.02} max={0.12} step={0.002} onChange={(v) => onStyle({ fontSizePct: v })} format={(v) => `${(v * 100).toFixed(1)}%`} />
      </Field>

      <Field label="Weight">
        <Segmented
          value={String(style.fontWeight)}
          onChange={(v) => onStyle({ fontWeight: Number(v) as StyleConfig['fontWeight'] })}
          size="sm"
          options={[400, 500, 600, 700, 800, 900].map((w) => ({ value: String(w), label: String(w) }))}
        />
      </Field>

      <Toggle checked={style.textTransform === 'uppercase'} onChange={(v) => onStyle({ textTransform: v ? 'uppercase' : 'none' })} label="Uppercase" />

      <section className="grid grid-cols-3 gap-2">
        <ColorField label="Text" value={style.textColor} onChange={(v) => onStyle({ textColor: v })} />
        <ColorField label="Outline" value={style.stroke.color} onChange={(v) => onStyle({ stroke: { color: v } })} />
        <ColorField label="Highlight" value={style.highlight.color} onChange={(v) => onStyle({ highlight: { color: v } })} />
      </section>

      <Field label="Outline width">
        <Slider value={style.stroke.widthPct} min={0} max={0.02} step={0.001} onChange={(v) => onStyle({ stroke: { widthPct: v } })} format={(v) => `${(v * 100).toFixed(1)}%`} />
      </Field>

      <Toggle checked={style.shadow.enabled} onChange={(v) => onStyle({ shadow: { enabled: v } })} label="Drop shadow" />

      <Toggle checked={style.background.enabled} onChange={(v) => onStyle({ background: { enabled: v } })} label="Background plate" />
      {style.background.enabled ? (
        <Field label="Plate opacity">
          <Slider value={alpha(style.background.color)} min={0.1} max={1} step={0.05} onChange={(v) => onStyle({ background: { color: withAlpha(style.background.color, v) } })} format={(v) => `${Math.round(v * 100)}%`} />
        </Field>
      ) : null}

      <Field label="Word highlight">
        <Segmented
          value={style.highlight.mode}
          onChange={(v) => onStyle({ highlight: { mode: v as 'none' | 'word' } })}
          size="sm"
          options={[
            { value: 'none', label: 'Off' },
            { value: 'word', label: 'Active word' },
          ]}
        />
      </Field>
      {style.highlight.mode === 'word' ? (
        <Field label="Highlight scale">
          <Slider value={style.highlight.scale} min={1} max={1.3} step={0.02} onChange={(v) => onStyle({ highlight: { scale: v } })} format={(v) => `${v.toFixed(2)}×`} />
        </Field>
      ) : null}

      <Field label="Lines per page" hint="Changing line limits re-segments pages (manual splits are kept).">
        <Segmented
          value={String(style.maxLines)}
          onChange={(v) => onStyle({ maxLines: Number(v) as 1 | 2 | 3 })}
          size="sm"
          options={[
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
          ]}
        />
      </Field>
      <Field label="Characters per line">
        <Slider value={style.maxCharsPerLine} min={10} max={60} step={1} onChange={(v) => onStyle({ maxCharsPerLine: v })} />
      </Field>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-ink-mute">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={rgb(value)} onChange={(e) => onChange(e.target.value.toUpperCase() + (value.length === 9 ? value.slice(7) : ''))} aria-label={`${label} colour`} />
        <span className="mono text-[11px] text-ink-dim">{rgb(value).toUpperCase()}</span>
      </span>
    </label>
  );
}
