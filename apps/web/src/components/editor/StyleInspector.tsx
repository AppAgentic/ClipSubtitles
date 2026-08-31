'use client';

import type {
  CaptionPosition,
  FontFamily,
  MotionPreset,
  StyleConfig,
  StylePatch,
  StylePresetId,
} from '@clipsubtitles/contracts';
import { STYLE_PRESETS } from '@clipsubtitles/core';
import { Field, Segmented, Slider, Toggle } from '@/components/ui/primitives';

const PRESET_BLURBS: Record<StylePresetId, string> = {
  clean: 'Bold, centred, soft shadow',
  'bold-pop': 'Punchy highlight, lower third',
  'lower-third': 'Left-aligned on a plate',
  karaoke: 'Word-by-word highlight',
  minimal: 'Small, single line, plate',
  'viral-beast': 'Condensed, fast, high-energy',
  'submagic-pop': 'Rounded pop with lime focus',
  'smooth-pill': 'Fluid purple active pill',
  'editorial-serif': 'Warm premium serif',
  'neon-box': 'Cyan monospace glow',
  'kinetic-flow': 'Top-led flowing highlight',
  'retro-arcade': 'Pixel-like green terminal',
  documentary: 'Quiet cinematic lower third',
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
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-mute">
          Preset
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(STYLE_PRESETS) as StylePresetId[]).map((id) => {
            const p = STYLE_PRESETS[id];
            const active = style.preset === id;
            return (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => onPreset(id)}
                aria-pressed={active}
                className={`group overflow-hidden rounded-[20px] border p-1.5 text-left transition-[border,background,transform] active:scale-[0.985] [corner-shape:squircle] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal ${active ? 'border-signal bg-signal/10' : 'border-line-strong hover:border-ink-mute'}`}
              >
                <div
                  className="grid aspect-[16/9] place-items-end overflow-hidden rounded-[15px] bg-[#24211f] p-3 text-center [corner-shape:squircle]"
                  style={{
                    fontFamily: `"${p.fontFamily}", sans-serif`,
                    fontWeight: p.fontWeight,
                    fontSize: 14,
                    textTransform: p.textTransform === 'uppercase' ? 'uppercase' : 'none',
                    color: p.textColor,
                    WebkitTextStroke:
                      p.stroke.widthPct > 0 ? `0.6px ${rgb(p.stroke.color)}` : undefined,
                    paintOrder: 'stroke fill',
                  }}
                >
                  A few steps reset the mind
                </div>
                <div className="flex items-start justify-between gap-2 px-1 pb-1 pt-2">
                  <span>
                    <strong className="block text-[12px] capitalize text-ink">
                      {id.replaceAll('-', ' ')}
                    </strong>
                    <span className="mt-0.5 block text-[10px] text-ink-mute">
                      {PRESET_BLURBS[id]}
                    </span>
                  </span>
                  {active ? (
                    <span className="text-[12px] text-signal" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </div>
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
        <Slider
          value={style.fontSizePct}
          min={0.02}
          max={0.12}
          step={0.002}
          onChange={(v) => onStyle({ fontSizePct: v })}
          format={(v) => `${(v * 100).toFixed(1)}%`}
        />
      </Field>

      <Field label="Font">
        <select
          value={style.fontFamily}
          disabled={busy}
          onChange={(event) => onStyle({ fontFamily: event.target.value as FontFamily })}
          className="h-10 w-full rounded-full border border-line-strong bg-bg-elev px-4 text-[12px] text-ink focus:border-signal"
        >
          {(
            ['Inter', 'Bebas Neue', 'Nunito', 'Playfair Display', 'Space Mono'] as FontFamily[]
          ).map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Weight">
        <Segmented
          value={String(style.fontWeight)}
          onChange={(v) => onStyle({ fontWeight: Number(v) as StyleConfig['fontWeight'] })}
          size="sm"
          options={[400, 500, 600, 700, 800, 900].map((w) => ({
            value: String(w),
            label: String(w),
          }))}
        />
      </Field>

      <Field label="Casing">
        <Segmented
          value={style.textTransform}
          onChange={(textTransform) => onStyle({ textTransform })}
          size="sm"
          options={[
            { value: 'none', label: 'As said' },
            { value: 'uppercase', label: 'ABC' },
            { value: 'lowercase', label: 'abc' },
            { value: 'capitalize', label: 'Title' },
          ]}
        />
      </Field>

      <section className="grid grid-cols-3 gap-2">
        <ColorField
          label="Text"
          value={style.textColor}
          onChange={(v) => onStyle({ textColor: v })}
        />
        <ColorField
          label="Outline"
          value={style.stroke.color}
          onChange={(v) => onStyle({ stroke: { color: v } })}
        />
        <ColorField
          label="Highlight"
          value={style.highlight.color}
          onChange={(v) => onStyle({ highlight: { color: v } })}
        />
      </section>

      <Field label="Outline width">
        <Slider
          value={style.stroke.widthPct}
          min={0}
          max={0.02}
          step={0.001}
          onChange={(v) => onStyle({ stroke: { widthPct: v } })}
          format={(v) => `${(v * 100).toFixed(1)}%`}
        />
      </Field>

      <Toggle
        checked={style.shadow.enabled}
        onChange={(v) => onStyle({ shadow: { enabled: v } })}
        label="Drop shadow"
      />

      <Toggle
        checked={style.background.enabled}
        onChange={(v) => onStyle({ background: { enabled: v } })}
        label="Background plate"
      />
      {style.background.enabled ? (
        <Field label="Plate opacity">
          <Slider
            value={alpha(style.background.color)}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(v) =>
              onStyle({ background: { color: withAlpha(style.background.color, v) } })
            }
            format={(v) => `${Math.round(v * 100)}%`}
          />
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
          <Slider
            value={style.highlight.scale}
            min={1}
            max={1.3}
            step={0.02}
            onChange={(v) => onStyle({ highlight: { scale: v } })}
            format={(v) => `${v.toFixed(2)}×`}
          />
        </Field>
      ) : null}

      <Field label="Motion">
        <Segmented<MotionPreset>
          value={style.motion.preset}
          onChange={(preset) => onStyle({ motion: { preset } })}
          size="sm"
          options={[
            { value: 'none', label: 'Still' },
            { value: 'soft-rise', label: 'Rise' },
            { value: 'spring-pop', label: 'Spring' },
            { value: 'karaoke-slide', label: 'Slide' },
          ]}
        />
      </Field>

      <Toggle
        checked={style.emoji.mode === 'auto'}
        onChange={(enabled) => onStyle({ emoji: { mode: enabled ? 'auto' : 'off' } })}
        label="Auto keyword emojis"
      />
      {style.emoji.mode === 'auto' ? (
        <>
          <Field label="Emoji timing">
            <Segmented
              value={style.emoji.timing}
              onChange={(timing) => onStyle({ emoji: { timing } })}
              size="sm"
              options={[
                { value: 'active-word', label: 'With word' },
                { value: 'keyword-hold', label: 'Then hold' },
                { value: 'page', label: 'Whole caption' },
              ]}
            />
          </Field>
          <Field label="Emoji position">
            <Segmented
              value={style.emoji.position}
              onChange={(position) => onStyle({ emoji: { position } })}
              size="sm"
              options={[
                { value: 'above-word', label: 'Above word' },
                { value: 'above-caption', label: 'Above caption' },
              ]}
            />
          </Field>
          <Field label="Emoji size">
            <Slider
              value={style.emoji.sizeEm}
              min={0.6}
              max={1.8}
              step={0.05}
              onChange={(sizeEm) => onStyle({ emoji: { sizeEm } })}
              format={(value) => `${value.toFixed(2)}×`}
            />
          </Field>
          <Toggle
            checked={style.emoji.animation === 'pop'}
            onChange={(enabled) => onStyle({ emoji: { animation: enabled ? 'pop' : 'none' } })}
            label="Pop emoji on keyword"
          />
        </>
      ) : null}

      <Field
        label="Lines per page"
        hint="Changing line limits re-segments pages (manual splits are kept)."
      >
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
        <Slider
          value={style.maxCharsPerLine}
          min={10}
          max={60}
          step={1}
          onChange={(v) => onStyle({ maxCharsPerLine: v })}
        />
      </Field>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-ink-mute">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={rgb(value)}
          onChange={(e) =>
            onChange(e.target.value.toUpperCase() + (value.length === 9 ? value.slice(7) : ''))
          }
          aria-label={`${label} colour`}
        />
        <span className="mono text-[11px] text-ink-dim">{rgb(value).toUpperCase()}</span>
      </span>
    </label>
  );
}
