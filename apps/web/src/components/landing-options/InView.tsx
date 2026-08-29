'use client';

import { createElement, useEffect, useRef, type ReactNode } from 'react';

/**
 * Marks its element with data-inview="true" once it enters the viewport so
 * scoped CSS can run an entrance once. Server-rendered markup is complete
 * without JS; the attribute only gates motion.
 */
export function InView({
  as = 'div',
  className,
  children,
  threshold = 0.25,
  once = true,
  id,
}: {
  as?: 'div' | 'section' | 'li' | 'article' | 'figure' | 'ol' | 'ul';
  className?: string;
  children: ReactNode;
  threshold?: number;
  once?: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.setAttribute('data-inview', 'true');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.setAttribute('data-inview', 'true');
            if (once) io.disconnect();
          } else if (!once) {
            el.setAttribute('data-inview', 'false');
          }
        }
      },
      { threshold, rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);

  const props: Record<string, unknown> = { ref, className, id, 'data-inview': 'false' };
  return createElement(as as string, props, children);
}
