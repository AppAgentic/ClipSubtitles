'use client';

import Link from 'next/link';
import {
  createContext,
  useContext,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

/**
 * A Field never wraps its control in a <label>: groups (radiogroups, sliders)
 * would inherit the whole caption as the first control's accessible name.
 * Instead the label element gets an id that descendants reference via
 * aria-labelledby through this context.
 */
const FieldLabelContext = createContext<string | undefined>(undefined);

export function useFieldLabelId(): string | undefined {
  return useContext(FieldLabelContext);
}

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-[var(--color-signal-fill)] text-signal-ink hover:brightness-110',
  ghost: 'bg-transparent text-ink border border-line-strong hover:border-ink-mute hover:bg-panel-2',
  subtle: 'bg-panel-2 text-ink-dim hover:text-ink hover:bg-line',
  danger: 'bg-transparent text-danger border border-danger/40 hover:bg-danger/10',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12px] rounded-full gap-1.5',
  md: 'h-10 px-4 text-[13px] rounded-full gap-2',
  lg: 'h-12 px-6 text-[14px] rounded-full gap-2',
};

export function Button({
  variant = 'ghost',
  size = 'md',
  className = '',
  loading = false,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center font-medium tracking-[-0.01em] transition-[background,border,color,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'ghost',
  size = 'md',
  className = '',
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center font-medium tracking-[-0.01em] transition-colors ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const CHIP: Record<string, string> = {
  neutral: 'border-line-strong text-ink-dim',
  signal: 'border-signal/50 text-signal',
  ok: 'border-phosphor/40 text-phosphor',
  warn: 'border-warn/40 text-warn',
  danger: 'border-danger/40 text-danger',
  info: 'border-info/40 text-info',
};

export function Chip({
  tone = 'neutral',
  children,
  className = '',
  dot = false,
}: {
  tone?: keyof typeof CHIP;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[11px] font-medium uppercase tracking-[0.08em] ${CHIP[tone]} ${className}`}
    >
      {dot ? (
        <span
          className={`h-1.5 w-1.5 rounded-full bg-current ${tone === 'signal' ? 'record-dot' : ''}`}
        />
      ) : null}
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof CHIP {
  switch (status) {
    case 'captioned':
    case 'succeeded':
    case 'ready':
    case 'available':
      return 'ok';
    case 'transcribing':
    case 'running':
    case 'importing':
    case 'queued':
      return 'signal';
    case 'failed':
    case 'purged':
      return 'danger';
    case 'cancelled':
      return 'warn';
    default:
      return 'neutral';
  }
}

export function Panel({
  children,
  className = '',
  title,
  aside,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className={`squircle border border-line bg-panel/80 backdrop-blur-sm ${className}`}>
      {title !== undefined ? (
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
            {title}
          </h2>
          {aside}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  inline = false,
  presentation = 'default',
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  inline?: boolean;
  presentation?: 'default' | 'settings';
}) {
  const labelId = useId();
  const hintId = useId();
  return (
    <FieldLabelContext.Provider value={labelId}>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        className={`flex ${inline ? 'items-center justify-between gap-3' : 'flex-col gap-1.5'}`}
      >
        <span
          id={labelId}
          className={
            presentation === 'settings'
              ? 'text-[13px] font-medium text-ink-dim'
              : 'text-[11px] font-medium uppercase tracking-[0.12em] text-ink-mute'
          }
        >
          {label}
        </span>
        {children}
        {hint ? (
          <span
            id={hintId}
            className={
              presentation === 'settings'
                ? 'text-[12px] leading-5 text-ink-mute'
                : 'text-[11px] text-ink-mute'
            }
          >
            {hint}
          </span>
        ) : null}
      </div>
    </FieldLabelContext.Provider>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const labelId = useFieldLabelId();
  const labelled =
    props['aria-label'] || props['aria-labelledby']
      ? {}
      : labelId
        ? { 'aria-labelledby': labelId }
        : {};
  return (
    <input
      {...labelled}
      {...props}
      className={`h-10 w-full rounded-full border border-line-strong bg-bg-elev px-4 text-[13px] text-ink placeholder:text-ink-mute focus:border-signal ${props.className ?? ''}`}
    />
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  label?: string;
}) {
  const labelId = useFieldLabelId();
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as string]: fill }}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format ? format(value) : undefined}
        {...(label ? { 'aria-label': label } : labelId ? { 'aria-labelledby': labelId } : {})}
      />
      <span className="mono w-14 shrink-0 text-right text-[12px] text-ink-dim" aria-hidden>
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  label,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const labelId = useFieldLabelId();
  return (
    <div
      role="radiogroup"
      {...(label ? { 'aria-label': label } : labelId ? { 'aria-labelledby': labelId } : {})}
      className="inline-flex w-full rounded-full border border-line-strong bg-bg-elev p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-full ${size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-[12px]'} font-medium transition-colors disabled:cursor-not-allowed ${
            o.value === value
              ? 'bg-bg-elev text-ink shadow-[var(--shadow-card)]'
              : 'text-ink-mute hover:text-ink-dim'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 py-1 text-left"
    >
      <span className="text-[12px] text-ink-dim">{label}</span>
      <span
        className={`relative h-[18px] w-8 shrink-0 rounded-full border transition-colors ${checked ? 'border-signal bg-signal/30' : 'border-line-strong bg-bg-elev'}`}
      >
        <span
          className={`absolute top-[2px] h-3 w-3 rounded-full transition-[left,background] ${checked ? 'left-[15px] bg-signal' : 'left-[2px] bg-ink-mute'}`}
        />
      </span>
    </button>
  );
}

export function Progress({
  value,
  tone = 'signal',
  className = '',
}: {
  value: number;
  tone?: 'signal' | 'ok' | 'danger';
  className?: string;
}) {
  const color = tone === 'ok' ? 'bg-phosphor' : tone === 'danger' ? 'bg-danger' : 'bg-signal';
  return (
    <div
      className={`h-1 w-full overflow-hidden rounded-full bg-line ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${color} transition-[width] duration-300`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  body,
  actions,
}: {
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="squircle flex flex-col items-start gap-3 border border-dashed border-line-strong p-8">
      <h3 className="text-[18px] font-semibold tracking-[-0.02em]">{title}</h3>
      {body ? <p className="max-w-prose text-[13px] text-ink-dim">{body}</p> : null}
      {actions ? <div className="mt-1 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Key/value row. The value may be a long identifier: it wraps (mono values
 * break anywhere) instead of clipping, so nothing is hidden on narrow screens.
 */
export function KV({ k, v, mono = false }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 last:border-b-0">
      <span className="shrink-0 text-[12px] text-ink-mute">{k}</span>
      <span
        data-kv-value
        className={`min-w-0 text-right text-[13px] text-ink ${mono ? 'mono break-all' : 'break-words'}`}
      >
        {v}
      </span>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mono rounded-full border border-line-strong bg-bg-elev px-2 py-0.5 text-[10px] text-ink-dim">
      {children}
    </kbd>
  );
}
