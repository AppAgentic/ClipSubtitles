'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { captureAttribution, trackPaidFunnelEvent } from '@/lib/attribution';

export function PaidFunnelTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const attribution = captureAttribution();
    if (!attribution) return;
    if (pathname === '/') trackPaidFunnelEvent('landing_captured');
    if (pathname === '/pricing') trackPaidFunnelEvent('pricing_viewed');
    if (pathname === '/sign-in') trackPaidFunnelEvent('signup_screen_viewed');
    if (pathname === '/app') trackPaidFunnelEvent('dashboard_viewed');
  }, [pathname]);
  return null;
}
