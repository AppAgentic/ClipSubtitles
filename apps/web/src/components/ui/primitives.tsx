'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-signal text-signal-ink hover:bg-signal-soft shadow-[0_0_0_1px_rgb(255_122_26/0.4),0_8px_30px_-10px_rgb(255_122_26/0.6)]',
  ghost: 'bg-transparent text-ink border border-line-strong hover:border-ink-mute hover:bg-panel-2',
  subtle: 'bg-panel-2 text-ink-dim hover:text-ink hover:bg-line',
  danger: 'bg-transparent text-danger border border-danger/40 hover:bg-danger/10',
};

const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12px] rounded-md gap-1.5',
  md: 'h-9 px-3.5 text-[13px] rounded-lg gap-2',
  lg: 'h-11 px-5 text-[14px] rounded-xl gap-2',
};

export function Button({
  variant = 'ghost',
  size = 'md',
  className = '',
  loading = false,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
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

export function LinkButton({ href, variant = 'ghost', size = 'md', className = '', children }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={`inline-flex items-center justify-center font-medium tracking-[-0.01em] transition-colors ${VARIANT[variant]} ${SIZE[size]} ${className}`}>
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

export function Chip({ tone = 'neutral', children, className = '', dot = false }: { tone?: keyof typeof CHIP; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[11px] font-medium uppercase tracking-[0.08em] ${CHIP[tone]} ${className}`}>
      {dot ? <span className={`h-1.5 w-1.5 rounded-full bg-current ${tone === 'signal' ? 'record-dot' : ''}`} /> : null}
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

export function Panel({ children, className = '', title, aside }: { children: ReactNode; className?: string; title?: ReactNode; aside?: ReactNode }) {
  return (
    <section className={`rounded-[14px] border border-line bg-panel/80 backdrop-blur-sm ${className}`}>
      {title !== undefined ? (
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute">{title}</h2>
          {aside}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Field({ label, hint, children, inline = false }: { label: ReactNode; hint?: ReactNode; children: ReactNode; inline?: boolean }) {
  return (
    <label className={`flex ${inline ? 'items-center justify-between gap-3' : 'flex-col gap-1.5'}`}>
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-mute">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-ink-mute">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-9 w-full rounded-lg border border-line-strong bg-bg-elev px-3 text-[13px] text-ink placeholder:text-ink-mute focus:border-signal ${props.className ?? ''}`}
    />
  );
}

export function Slider({ value, min, max, step = 1, onChange, format }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} style={{ ['--fill' as string]: fill }} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="mono w-14 shrink-0 text-right text-[12px] text-ink-dim">{format ? format(value) : value}</span>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" className="inline-flex w-full rounded-lg border border-line-strong bg-bg-elev p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md ${size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-[12px]'} font-medium transition-colors ${
            o.value === value ? 'bg-panel-2 text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]' : 'text-ink-mute hover:text-ink-dim'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 py-1 text-left">
      <span className="text-[12px] text-ink-dim">{label}</span>
      <span className={`relative h-[18px] w-8 shrink-0 rounded-full border transition-colors ${checked ? 'border-signal bg-signal/30' : 'border-line-strong bg-bg-elev'}`}>
        <span className={`absolute top-[2px] h-3 w-3 rounded-full transition-[left,background] ${checked ? 'left-[15px] bg-signal' : 'left-[2px] bg-ink-mute'}`} />
      </span>
    </button>
  );
}

export function Progress({ value, tone = 'signal', className = '' }: { value: number; tone?: 'signal' | 'ok' | 'danger'; className?: string }) {
  const color = tone === 'ok' ? 'bg-phosphor' : tone === 'danger' ? 'bg-danger' : 'bg-signal';
  return (
    <div className={`h-1 w-full overflow-hidden rounded-full bg-line ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${color} transition-[width] duration-300`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function EmptyState({ title, body, actions }: { title: ReactNode; body?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[14px] border border-dashed border-line-strong p-8">
      <h3 className="text-[18px] font-semibold tracking-[-0.02em]">{title}</h3>
      {body ? <p className="max-w-prose text-[13px] text-ink-dim">{body}</p> : null}
      {actions ? <div className="mt-1 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function KV({ k, v, mono = false }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 last:border-b-0">
      <span className="text-[12px] text-ink-mute">{k}</span>
      <span className={`text-right text-[13px] text-ink ${mono ? 'mono' : ''}`}>{v}</span>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mono rounded border border-line-strong bg-bg-elev px-1.5 py-0.5 text-[10px] text-ink-dim">{children}</kbd>;
}
