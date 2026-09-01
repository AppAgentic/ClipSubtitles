// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BillingOverview, Me } from '@clipsubtitles/contracts';
import { ToastProvider } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { Settings } from './page';

const me: Me = {
  user: { id: 'user_test', displayName: 'Test User', emailMasked: 't***@example.com' },
  workspace: {
    id: 'ws_test',
    name: 'Test workspace',
    retention: { sourceDays: 30, exportDays: 7 },
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  scopes: ['captions:read', 'captions:write'],
  authKind: 'session',
  credits: { available: 10, reserved: 0, total: 10, priceVersion: 'test' },
};

const freeBilling: BillingOverview = {
  catalogVersion: 'test',
  planId: 'free',
  status: 'free',
  cancelAtPeriodEnd: false,
  credits: me.credits,
  pools: [],
  entitlements: { activeRenderLimit: 1, apiAccess: true, teamControls: false },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderSettings(billing: BillingOverview) {
  vi.spyOn(api, 'ledger').mockResolvedValue({ entries: [] });
  vi.spyOn(api, 'billing').mockResolvedValue(billing);
  return render(<ToastProvider><Settings me={me} /></ToastProvider>);
}

describe('dashboard billing controls', () => {
  it('defaults a free workspace upgrade chooser to annual pricing', async () => {
    renderSettings(freeBilling);
    const annual = await screen.findByRole('button', { name: 'Annual · save up to 20%' });
    expect(annual.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Monthly' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Creator · $12/mo billed annually' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pro · $33/mo billed annually' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Studio · $84/mo billed annually' })).toBeTruthy();
  });

  it('gives a paid workspace one safe management path for plan and billing changes', async () => {
    renderSettings({
      ...freeBilling,
      planId: 'pro',
      status: 'active',
      currentPeriodEnd: '2027-09-01T00:00:00.000Z',
      credits: { ...me.credits, available: 12_000, total: 12_000 },
    });
    expect(await screen.findByRole('button', { name: 'Manage subscription' })).toBeTruthy();
    expect(screen.getByText(/Upgrade, downgrade, change payment method, view invoices, or cancel/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Annual · save up to 20%' })).toBeNull();
  });
});
