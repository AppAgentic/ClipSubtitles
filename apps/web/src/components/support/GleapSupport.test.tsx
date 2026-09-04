// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GleapSupportProvider, identifySupportUser } from './GleapSupport';

const gleap = vi.hoisted(() => ({
  initialize: vi.fn(),
  showFeedbackButton: vi.fn(),
  hideAiChatbar: vi.fn(),
  setNetworkLogsBlacklist: vi.fn(),
  setNetworkLogPropsToIgnore: vi.fn(),
  identify: vi.fn(),
  attachCustomData: vi.fn(),
  trackEvent: vi.fn(),
  clearIdentity: vi.fn(),
  open: vi.fn(),
}));

vi.mock('gleap', () => ({ default: gleap }));
vi.mock('next/navigation', () => ({ usePathname: () => '/app' }));

afterEach(() => {
  cleanup();
  delete process.env.NEXT_PUBLIC_GLEAP_SDK_TOKEN;
  vi.clearAllMocks();
});

describe('Gleap support', () => {
  it('initializes privately and applies queued signed-in user context', async () => {
    process.env.NEXT_PUBLIC_GLEAP_SDK_TOKEN = 'public_sdk_token';
    identifySupportUser({
      user: { id: 'user_test', displayName: 'Test User', emailMasked: 't***@example.com' },
      workspace: {
        id: 'ws_test',
        name: 'Test workspace',
        retention: { sourceDays: 30, exportDays: 7 },
        createdAt: '2026-09-01T00:00:00.000Z',
      },
      scopes: ['captions:read', 'captions:write'],
      authKind: 'session',
      isAdmin: false,
      credits: { available: 10, reserved: 0, total: 10, priceVersion: 'test' },
    });

    render(
      <GleapSupportProvider>
        <div>App</div>
      </GleapSupportProvider>,
    );

    await waitFor(() => expect(gleap.initialize).toHaveBeenCalledWith('public_sdk_token'));
    expect(gleap.showFeedbackButton).toHaveBeenCalledWith(false);
    expect(gleap.hideAiChatbar).toHaveBeenCalled();
    expect(gleap.setNetworkLogsBlacklist).toHaveBeenCalledWith(
      expect.arrayContaining(['/auth/', '/v1/billing/', '/v1/uploads/']),
    );
    expect(gleap.setNetworkLogPropsToIgnore).toHaveBeenCalledWith(
      expect.arrayContaining(['authorization', 'cookie', 'token', 'secret']),
    );
    expect(gleap.identify).toHaveBeenCalledWith(
      'user_test',
      expect.objectContaining({
        name: 'Test User',
        customData: expect.objectContaining({ workspaceId: 'ws_test', availableCredits: 10 }),
      }),
    );
  });
});
