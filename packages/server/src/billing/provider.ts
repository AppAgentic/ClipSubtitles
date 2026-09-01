import { WhopClient } from '@whop/sdk';
import { unwrapWebhook } from '@whop/sdk/helpers';
import { BILLING_CATALOG, type BillingSku, type CheckoutSession, type CheckoutSource } from '@clipsubtitles/contracts';
import type { AppConfig } from '../config';
import { ApiError } from '../errors';

export interface BillingWebhook {
  id: string;
  type: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

export interface BillingProvider {
  readonly name: 'none' | 'whop';
  createCheckout(input: {
    workspaceId: string;
    sku: BillingSku;
    source: CheckoutSource;
    redirectUrl: string;
    resume?: string;
    idempotencyKey: string;
  }): Promise<CheckoutSession>;
  managementUrl(providerSubscriptionId: string): Promise<string>;
  verifyWebhook(rawBody: string, headers: Record<string, string>): BillingWebhook;
}

class DisabledBillingProvider implements BillingProvider {
  readonly name = 'none' as const;
  async createCheckout(): Promise<CheckoutSession> {
    throw new ApiError('PROVIDER_UNAVAILABLE', 'Checkout is not configured yet.');
  }
  async managementUrl(): Promise<string> {
    throw new ApiError('PROVIDER_UNAVAILABLE', 'Subscription management is not configured yet.');
  }
  verifyWebhook(): BillingWebhook {
    throw new ApiError('NOT_FOUND');
  }
}

class WhopBillingProvider implements BillingProvider {
  readonly name = 'whop' as const;
  private readonly client: WhopClient;

  constructor(private readonly config: Extract<AppConfig['billing'], { provider: 'whop' }>) {
    this.client = new WhopClient({ token: config.apiKey, maxRetries: 2, timeoutInSeconds: 15 });
  }

  async createCheckout(input: {
    workspaceId: string;
    sku: BillingSku;
    source: CheckoutSource;
    redirectUrl: string;
    resume?: string;
    idempotencyKey: string;
  }): Promise<CheckoutSession> {
    const result = await this.client.checkoutConfigurations.create(
      {
        account_id: this.config.accountId,
        plan_id: this.config.planIds[input.sku],
        redirect_url: input.redirectUrl,
        metadata: {
          workspace_id: input.workspaceId,
          sku: input.sku,
          source: input.source,
          catalog_version: BILLING_CATALOG.version,
          ...(input.resume ? { resume: input.resume } : {}),
        },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!result.purchase_url) throw new ApiError('PROVIDER_UNAVAILABLE', 'Checkout could not be created.');
    return { id: result.id, url: result.purchase_url, sku: input.sku };
  }

  async managementUrl(providerSubscriptionId: string): Promise<string> {
    const memberships = await this.client.memberships.list({ account_id: this.config.accountId, first: 100 });
    let manageUrl: string | null = null;
    for await (const membership of memberships) {
      if (membership.id === providerSubscriptionId) {
        const raw = membership as unknown;
        manageUrl = isRecord(raw) && typeof raw.manage_url === 'string' ? raw.manage_url : null;
        break;
      }
    }
    if (!manageUrl) {
      throw new ApiError('PROVIDER_UNAVAILABLE', 'Subscription management is not available yet.');
    }
    const url = new URL(manageUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'whop.com') {
      throw new ApiError('PROVIDER_UNAVAILABLE', 'Subscription management returned an invalid destination.');
    }
    return url.toString();
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): BillingWebhook {
    const payload = unwrapWebhook<Record<string, unknown>>(rawBody, {
      headers,
      key: this.config.webhookSecret,
    });
    const data = isRecord(payload.data) ? payload.data : {};
    return {
      id: headers['webhook-id'] ?? '',
      type: String(payload.type ?? payload.action ?? 'unknown'),
      occurredAt: webhookTimestamp(payload.created_at) ?? new Date().toISOString(),
      data,
    };
  }
}

function webhookTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createBillingProvider(config: AppConfig['billing']): BillingProvider {
  return config.provider === 'whop' ? new WhopBillingProvider(config) : new DisabledBillingProvider();
}
