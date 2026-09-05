'use client';

import type { ReactNode } from 'react';
import type GleapType from 'gleap';
type GleapClient = typeof GleapType;
let Gleap: GleapClient | undefined;
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
let initializing: Promise<boolean> | null = null;

function applyIdentity(me: Me): void {
  if (!initialized || !Gleap) {
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
  if (initialized) Gleap?.clearIdentity();
}

async function initializeSupport(): Promise<boolean> {
  if (initialized) return true;
  if (initializing) return initializing;
  const sdkToken = process.env.NEXT_PUBLIC_GLEAP_SDK_TOKEN?.trim();
  if (!sdkToken) return false;

  initializing = Promise.resolve().then(async () => {
    try {
      Gleap = (await import('gleap')).default;
      Gleap.setDisablePageTracking(true);
      Gleap.disableConsoleLogOverwrite();
      Gleap.setMaxNetworkRequests(0);
      Gleap.initialize(sdkToken, true);
      Gleap.showFeedbackButton(false);
      Gleap.hideAiChatbar();
      Gleap.setNetworkLogsBlacklist(NETWORK_LOG_BLOCKLIST);
      Gleap.setNetworkLogPropsToIgnore(NETWORK_PROP_BLOCKLIST);
      initialized = true;
      if (pendingIdentity) applyIdentity(pendingIdentity);
      return true;
    } catch {
      initialized = false;
      return false;
    } finally {
      initializing = null;
    }
  });
  return initializing;
}

export async function openSupport(): Promise<void> {
  if (initialized) {
    Gleap?.open();
    return;
  }
  if (await initializeSupport()) Gleap?.open();
  else window.location.assign(`mailto:${SUPPORT_EMAIL}?subject=ClipSubtitles%20support`);
}

export function GleapSupportProvider({ children }: { children: ReactNode }) {
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
    <button type="button" className={className} onClick={() => void openSupport()}>
      {children}
    </button>
  );
}
