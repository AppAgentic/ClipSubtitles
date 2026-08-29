'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Accessible modal: labelled by its title, closes on Escape and backdrop
 * click, traps initial focus, and restores focus to the opener on close.
 */
export function Dialog({ open, title, description, onClose, children, width = 460 }: { open: boolean; title: ReactNode; description?: ReactNode; onClose: () => void; children: ReactNode; width?: number }) {
  const titleId = useId();
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const first = panel.current?.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
    (first ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && panel.current) {
        const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>('input, button, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')).filter((n) => !n.hasAttribute('disabled'));
        if (nodes.length === 0) return;
        const firstNode = nodes[0];
        const lastNode = nodes[nodes.length - 1];
        if (!firstNode || !lastNode) return;
        if (e.shiftKey && document.activeElement === firstNode) {
          e.preventDefault();
          lastNode.focus();
        } else if (!e.shiftKey && document.activeElement === lastNode) {
          e.preventDefault();
          firstNode.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-bg/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} tabIndex={-1} className="rise max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-line-strong bg-panel p-5 shadow-2xl outline-none" style={{ maxWidth: width }}>
        <h2 id={titleId} className="text-[18px] font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="mt-1 text-[12px] text-ink-mute">
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
