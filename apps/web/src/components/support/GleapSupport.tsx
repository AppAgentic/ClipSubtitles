'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Gleap from 'gleap';
import type { Me } from '@clipsubtitles/contracts';

const SUPPORT_EMAIL = 'support@clipsubtitles.com';
const NETWORK_LOG_BLOCKLIST = [
  '/auth/',
  '/v1/billing/',
  '/v1/uploads/',
  '/v1/projects/',
  '/v1/webhooks/',
];
const NETWORK_PROP_BLOCKLIST = [
  'authorization',
  'cookie',
  'password',
  'token',
  'secret',
  'session',
  'sourceUrl',
  'uploadUrl',
];

let initialized = false;
let pendingIdentity: Me | null = null;

function applyIdentity(me: Me): void {
  if (!initialized) {
    pendingIdentity = me;
    return;
  }

  Gleap.identify(me.user.id, {
    name: me.user.displayName ?? null,
    customData: {
      workspaceId: me.workspace.id,
      workspaceName: me.workspace.name,
      availableCredits: me.credits.available,
      authKind: me.authKind,
      emailMasked: me.user.emailMasked ?? '',
    },
  });
}

export function identifySupportUser(me: Me): void {
  pendingIdentity = me;
  applyIdentity(me);
}

export function clearSupportUser(): void {
  pendingIdentity = null;
  if (initialized) Gleap.clearIdentity();
}

export function openSupport(): void {
  if (initialized) {
    Gleap.open();
    return;
  }
  window.location.assign(`mailto:${SUPPORT_EMAIL}?subject=ClipSubtitles%20support`);
}

export function GleapSupportProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const initializedRef = useRef(false);

  useEffect(() => {
    const sdkToken = process.env.NEXT_PUBLIC_GLEAP_SDK_TOKEN?.trim();
    if (!sdkToken || initializedRef.current) return;

    initializedRef.current = true;
    try {
      Gleap.initialize(sdkToken);
      Gleap.showFeedbackButton(false);
      Gleap.hideAiChatbar();
      Gleap.setNetworkLogsBlacklist(NETWORK_LOG_BLOCKLIST);
      Gleap.setNetworkLogPropsToIgnore(NETWORK_PROP_BLOCKLIST);
      initialized = true;

      if (pendingIdentity) applyIdentity(pendingIdentity);
    } catch {
      initializedRef.current = false;
      initialized = false;
    }
  }, []);

  useEffect(() => {
    if (!initialized || !pathname) return;
    Gleap.attachCustomData({ currentPage: pathname });
    Gleap.trackEvent('page_view', { page: pathname });
  }, [pathname]);

  return children;
}

export function SupportButton({
  children = 'Contact support',
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <button type="button" className={className} onClick={openSupport}>
      {children}
    </button>
  );
}
