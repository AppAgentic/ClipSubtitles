import { describe, expect, it } from 'vitest';
import {
  desiredWhopPlans,
  parseCatalogSyncArguments,
  parseWhopCliVersion,
  syncWhopCatalog,
  WHOP_CATALOG_MANAGER,
  WHOP_CLI_VERSION,
  WhopCatalogSyncError,
  type WhopCommandRunner,
} from '../billing/catalog-sync';

describe('parseWhopCliVersion', () => {
  it('accepts the pinned version when the CLI also reports its API version', () => {
    expect(parseWhopCliVersion('0.16.0\nAPI version: 2026-08-13')).toBe('0.16.0');
    expect(parseWhopCliVersion('whop 0.16.0\r\nAPI version: 2026-08-13')).toBe('0.16.0');
  });
});

describe('one-time plan readback', () => {
  it('accepts Whop canonical renewal_price=0 for a non-renewing plan', async () => {
    const runner = new StatefulRunner();
    await syncWhopCatalog({ apply: true, accountId: 'biz_test', runner });
    const topup = [...runner.plans.values()].find(
      (plan) => (plan.metadata as Resource).catalog_key === 'topup_small',
    );
    expect(topup).toBeDefined();
    topup!.renewal_price = 0;

    const result = await syncWhopCatalog({ apply: false, accountId: 'biz_test', runner });
    expect(result.actions.find((action) => action.key === 'topup_small')?.operation).toBe('unchanged');
  });
});

type Resource = Record<string, unknown>;

function envelope(data: unknown): unknown {
  return { ok: true, data, meta: { command: 'fixture' } };
}

function listEnvelope(data: Resource[]): unknown {
  return envelope({ data, page_info: { has_next_page: false, end_cursor: null } });
}

function valueAfter(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}

class StatefulRunner implements WhopCommandRunner {
  readonly calls: string[][] = [];
  readonly products = new Map<string, Resource>();
  readonly plans = new Map<string, Resource>();
  versionValue = WHOP_CLI_VERSION;

  async version(): Promise<string> {
    this.calls.push(['--version']);
    return this.versionValue;
  }

  async run(readonlyArgs: readonly string[]): Promise<unknown> {
    const args = [...readonlyArgs];
    this.calls.push(args);
    const [resource, command, id] = args;
    if (command === 'list') {
      if (resource === 'products') return listEnvelope([...this.products.values()]);
      if (resource === 'plans') return listEnvelope([...this.plans.values()]);
    }
    if (resource === 'products' && command === 'create') {
      const item = {
        id: 'prod_clipsubtitles',
        title: valueAfter(args, '--title'),
        description: valueAfter(args, '--description'),
        visibility: valueAfter(args, '--visibility'),
        metadata: JSON.parse(valueAfter(args, '--metadata')!),
        company: { id: valueAfter(args, '--account_id') },
      };
      this.products.set(String(item.id), item);
      return envelope(item);
    }
    if (resource === 'products' && command === 'update') {
      const item = this.products.get(id!);
      expect(item).toBeDefined();
      Object.assign(item!, {
        title: valueAfter(args, '--title'),
        description: valueAfter(args, '--description'),
        visibility: valueAfter(args, '--visibility'),
        metadata: JSON.parse(valueAfter(args, '--metadata')!),
      });
      return envelope(item);
    }
    if (resource === 'plans' && command === 'create') {
      const metadata = JSON.parse(valueAfter(args, '--metadata')!) as Resource;
      const sku = String(metadata.catalog_key);
      const planId = `plan_${sku}`;
      const planType = valueAfter(args, '--plan_type');
      const item: Resource = {
        id: planId,
        title: valueAfter(args, '--title'),
        description: valueAfter(args, '--description'),
        visibility: valueAfter(args, '--visibility'),
        metadata,
        company: { id: valueAfter(args, '--account_id') },
        product: { id: valueAfter(args, '--product_id') },
        plan_type: planType,
        release_method: valueAfter(args, '--release_method'),
        currency: valueAfter(args, '--currency'),
        initial_price: Number(valueAfter(args, '--initial_price')),
        unlimited_stock: true,
        adaptive_pricing_enabled: false,
        ...(planType === 'renewal'
          ? {
              billing_period: Number(valueAfter(args, '--billing_period')),
              renewal_price: Number(valueAfter(args, '--renewal_price')),
            }
          : {}),
      };
      this.plans.set(planId, item);
      return envelope(item);
    }
    if (resource === 'plans' && command === 'update') {
      const item = this.plans.get(id!);
      expect(item).toBeDefined();
      Object.assign(item!, {
        title: valueAfter(args, '--title'),
        description: valueAfter(args, '--description'),
        visibility: valueAfter(args, '--visibility'),
        metadata: JSON.parse(valueAfter(args, '--metadata')!),
      });
      return envelope(item);
    }
    throw new Error(`Unexpected fixture command: ${args.join(' ')}`);
  }
}

describe('Whop catalog sync', () => {
  it('derives all six subscriptions and three top-ups from the shared catalog', () => {
    const desired = desiredWhopPlans();
    expect(desired).toHaveLength(9);
    expect(desired.filter((plan) => plan.planType === 'renewal')).toHaveLength(6);
    expect(desired.filter((plan) => plan.planType === 'one_time')).toHaveLength(3);
    expect(desired.every((plan) => plan.title.length <= 30)).toBe(true);
    expect(desired.every((plan) => plan.metadata.managed_by === WHOP_CATALOG_MANAGER)).toBe(true);
  });

  it('defaults to dry-run and rejects every other mutation flag', () => {
    expect(parseCatalogSyncArguments([])).toEqual({ apply: false });
    expect(parseCatalogSyncArguments(['--apply'])).toEqual({ apply: true });
    expect(() => parseCatalogSyncArguments(['--force'])).toThrow(WhopCatalogSyncError);
    expect(() => parseCatalogSyncArguments(['--apply', '--apply'])).toThrow();
  });

  it('plans a missing catalog without issuing any mutation', async () => {
    const runner = new StatefulRunner();
    const result = await syncWhopCatalog({
      apply: false,
      accountId: 'biz_clipsubtitlestest',
      runner,
    });
    expect(result.status).toBe('dry_run');
    expect(result.actions).toHaveLength(10);
    expect(result.actions.every((action) => action.operation === 'create')).toBe(true);
    expect(runner.calls.some((args) => args.includes('create'))).toBe(false);
  });

  it('applies, verifies, and becomes idempotent', async () => {
    const runner = new StatefulRunner();
    const applied = await syncWhopCatalog({
      apply: true,
      accountId: 'biz_clipsubtitlestest',
      runner,
    });
    expect(applied.status).toBe('verified');
    expect(Object.keys(applied.planBindings ?? {})).toHaveLength(9);
    const mutationsAfterApply = runner.calls.filter((args) =>
      args.some((arg) => arg === 'create' || arg === 'update'),
    ).length;
    expect(mutationsAfterApply).toBe(10);

    const second = await syncWhopCatalog({
      apply: true,
      accountId: 'biz_clipsubtitlestest',
      runner,
    });
    expect(second.actions.every((action) => action.operation === 'unchanged')).toBe(true);
    expect(second.mutationsApplied).toBe(false);
    expect(
      runner.calls.filter((args) => args.some((arg) => arg === 'create' || arg === 'update')),
    ).toHaveLength(mutationsAfterApply);
  });

  it('fails closed when a sold price differs from code', async () => {
    const runner = new StatefulRunner();
    await syncWhopCatalog({
      apply: true,
      accountId: 'biz_clipsubtitlestest',
      runner,
    });
    runner.plans.get('plan_plan_creator_monthly')!.initial_price = 1;
    await expect(
      syncWhopCatalog({
        apply: false,
        accountId: 'biz_clipsubtitlestest',
        runner,
      }),
    ).rejects.toMatchObject({ code: 'immutable_drift' });
  });

  it('rejects an orphaned managed plan even when the product is missing', async () => {
    const runner = new StatefulRunner();
    runner.plans.set('plan_orphan', {
      id: 'plan_orphan',
      metadata: {
        managed_by: WHOP_CATALOG_MANAGER,
        app_slug: 'clipsubtitles',
        catalog_key: 'topup_small',
      },
      company: { id: 'biz_clipsubtitlestest' },
      product: { id: 'prod_missing' },
    });
    await expect(
      syncWhopCatalog({
        apply: false,
        accountId: 'biz_clipsubtitlestest',
        runner,
      }),
    ).rejects.toMatchObject({ code: 'catalog_collision' });
  });

  it('follows provider pagination before planning changes', async () => {
    const calls: string[][] = [];
    const runner: WhopCommandRunner = {
      async version() {
        return WHOP_CLI_VERSION;
      },
      async run(readonlyArgs) {
        const args = [...readonlyArgs];
        calls.push(args);
        const resource = args[0];
        const after = valueAfter(args, '--after');
        if (resource === 'products' && !after) {
          return envelope({
            data: [],
            page_info: { has_next_page: true, end_cursor: 'next_products' },
          });
        }
        return listEnvelope([]);
      },
    };
    const result = await syncWhopCatalog({
      apply: false,
      accountId: 'biz_clipsubtitlestest',
      runner,
    });
    expect(result.status).toBe('dry_run');
    expect(calls.some((args) => valueAfter(args, '--after') === 'next_products')).toBe(true);
  });

  it('treats stock and adaptive-pricing changes as immutable drift', async () => {
    const runner = new StatefulRunner();
    await syncWhopCatalog({
      apply: true,
      accountId: 'biz_clipsubtitlestest',
      runner,
    });
    const plan = runner.plans.get('plan_plan_creator_monthly')!;
    plan.unlimited_stock = false;
    plan.adaptive_pricing_enabled = true;
    await expect(
      syncWhopCatalog({
        apply: false,
        accountId: 'biz_clipsubtitlestest',
        runner,
      }),
    ).rejects.toMatchObject({ code: 'immutable_drift' });
  });

  it('requires the pinned CLI and a syntactically valid account', async () => {
    const runner = new StatefulRunner();
    runner.versionValue = 'whop 0.99.0';
    await expect(
      syncWhopCatalog({ apply: false, accountId: 'biz_clipsubtitlestest', runner }),
    ).rejects.toMatchObject({ code: 'unsupported_cli_version' });
    await expect(
      syncWhopCatalog({ apply: false, accountId: 'wrong', runner }),
    ).rejects.toMatchObject({ code: 'invalid_configuration' });
  });
});
