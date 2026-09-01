import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  BILLING_CATALOG,
  type BillingSku,
} from '@clipsubtitles/contracts';

const execFileAsync = promisify(execFile);

export const WHOP_CLI_VERSION = '0.16.0';
export const WHOP_CATALOG_MANAGER = 'clipsubtitles.sync-whop-catalog';

type JsonRecord = Record<string, unknown>;

export interface WhopCommandRunner {
  version(): Promise<string>;
  run(args: readonly string[]): Promise<unknown>;
}

export interface WhopPlanBindingSink {
  store(sku: BillingSku, planId: string): Promise<void>;
}

export interface CatalogSyncAction {
  resource: 'product' | 'plan';
  key: string;
  operation: 'create' | 'update' | 'unchanged';
  drift: string[];
}

export interface CatalogSyncResult {
  status: 'dry_run' | 'verified';
  catalogVersion: string;
  actions: CatalogSyncAction[];
  mutationsApplied: boolean;
  planBindings?: Partial<Record<BillingSku, string>>;
}

export class WhopCatalogSyncError extends Error {
  constructor(
    readonly code:
      | 'invalid_configuration'
      | 'unsupported_cli_version'
      | 'cli_command_failed'
      | 'invalid_cli_response'
      | 'catalog_collision'
      | 'immutable_drift'
      | 'readback_failed',
    message: string,
  ) {
    super(message);
    this.name = 'WhopCatalogSyncError';
  }
}

interface DesiredPlan {
  sku: BillingSku;
  title: string;
  description: string;
  planType: 'renewal' | 'one_time';
  billingPeriod?: 30 | 365;
  price: number;
  metadata: Record<string, string>;
}

function planMetadata(sku: BillingSku): Record<string, string> {
  return {
    managed_by: WHOP_CATALOG_MANAGER,
    app_slug: 'clipsubtitles',
    catalog_version: BILLING_CATALOG.version,
    catalog_key: sku,
  };
}

function planDescription(name: string, credits: number, cadence?: string): string {
  const allowance = credits.toLocaleString('en-US');
  return cadence
    ? `${name} ${cadence} subscription with ${allowance} caption credits and agent/API access.`
    : `${allowance} non-expiring caption credit top-up.`;
}

export function desiredWhopPlans(): DesiredPlan[] {
  const recurring = BILLING_CATALOG.plans.flatMap((plan) => {
    if (!('sku' in plan)) {
      return [];
    }
    return [
      {
        sku: plan.sku,
        title: `${plan.name} Monthly`,
        description: planDescription(plan.name, plan.monthlyCredits, 'monthly'),
        planType: 'renewal' as const,
        billingPeriod: 30 as const,
        price: plan.monthlyPriceCents / 100,
        metadata: planMetadata(plan.sku),
      },
      {
        sku: plan.annualSku,
        title: `${plan.name} Annual`,
        description: planDescription(plan.name, plan.annualCredits, 'annual'),
        planType: 'renewal' as const,
        billingPeriod: 365 as const,
        price: plan.annualPriceCents / 100,
        metadata: planMetadata(plan.annualSku),
      },
    ];
  });
  const topUps = BILLING_CATALOG.topUps.map((topUp) => ({
    sku: topUp.sku,
    title: `${topUp.credits.toLocaleString('en-US')} credits`,
    description: planDescription(topUp.name, topUp.credits),
    planType: 'one_time' as const,
    price: topUp.priceCents / 100,
    metadata: planMetadata(topUp.sku),
  }));
  return [...recurring, ...topUps];
}

export function parseCatalogSyncArguments(args: readonly string[]): { apply: boolean } {
  if (args.length === 0) return { apply: false };
  if (args.length === 1 && args[0] === '--apply') return { apply: true };
  throw new WhopCatalogSyncError(
    'invalid_configuration',
    'The only supported mutation flag is --apply; dry-run is the default.',
  );
}

export function createWhopCliRunner(binary = 'whop'): WhopCommandRunner {
  const execute = async (args: readonly string[]): Promise<string> => {
    try {
      const { stdout } = await execFileAsync(binary, [...args], {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, WHOP_CLI_AUDIT_LOG: '0' },
      });
      return stdout.trim();
    } catch {
      throw new WhopCatalogSyncError(
        'cli_command_failed',
        'The Whop CLI command failed. Provider output was suppressed.',
      );
    }
  };
  return {
    version: () => execute(['--version']),
    async run(args) {
      const output = await execute([...args, '--format', 'json', '--full-output']);
      try {
        return JSON.parse(output) as unknown;
      } catch {
        throw new WhopCatalogSyncError(
          'invalid_cli_response',
          'The Whop CLI did not return structured JSON.',
        );
      }
    },
  };
}

const PLAN_VAULT_LABELS: Record<BillingSku, string> = {
  plan_creator_monthly: 'clipsubtitles-whop-plan-creator-monthly',
  plan_creator_annual: 'clipsubtitles-whop-plan-creator-annual',
  plan_pro_monthly: 'clipsubtitles-whop-plan-pro-monthly',
  plan_pro_annual: 'clipsubtitles-whop-plan-pro-annual',
  plan_studio_monthly: 'clipsubtitles-whop-plan-studio-monthly',
  plan_studio_annual: 'clipsubtitles-whop-plan-studio-annual',
  topup_small: 'clipsubtitles-whop-plan-topup-small',
  topup_medium: 'clipsubtitles-whop-plan-topup-medium',
  topup_large: 'clipsubtitles-whop-plan-topup-large',
};

export function createMcVaultPlanBindingSink(): WhopPlanBindingSink {
  return {
    store(sku, planId) {
      return new Promise<void>((resolve, reject) => {
        const child = spawn(
          'mc',
          ['auth', 'add', PLAN_VAULT_LABELS[sku], '--username', 'clipsubtitles'],
          { stdio: ['pipe', 'ignore', 'ignore'] },
        );
        child.once('error', () => {
          reject(
            new WhopCatalogSyncError(
              'cli_command_failed',
              `The verified ${sku} binding could not be stored in mc-vault.`,
            ),
          );
        });
        child.once('close', (code) => {
          if (code === 0) resolve();
          else {
            reject(
              new WhopCatalogSyncError(
                'cli_command_failed',
                `The verified ${sku} binding could not be stored in mc-vault.`,
              ),
            );
          }
        });
        child.stdin.on('error', () => undefined);
        child.stdin.end(planId);
      });
    },
  };
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function unwrap(value: unknown): unknown {
  const envelope = record(value);
  if (!envelope || envelope.ok !== true) {
    throw new WhopCatalogSyncError(
      'invalid_cli_response',
      'The Whop CLI response did not use a successful full-output envelope.',
    );
  }
  return envelope.data;
}

function extractEntity(value: unknown, prefix: string): JsonRecord {
  let candidate = unwrap(value);
  const outer = record(candidate);
  if (outer && record(outer.data)) candidate = outer.data;
  const entity = record(candidate);
  if (!entity || typeof entity.id !== 'string' || !entity.id.startsWith(prefix)) {
    throw new WhopCatalogSyncError('invalid_cli_response', 'Whop returned an invalid resource.');
  }
  return entity;
}

function extractItems(value: unknown): JsonRecord[] {
  const payload = record(unwrap(value));
  const data = payload?.data;
  if (!Array.isArray(data)) {
    throw new WhopCatalogSyncError('invalid_cli_response', 'Whop returned an invalid collection.');
  }
  return data.map((item) => {
    const parsed = record(item);
    if (!parsed) {
      throw new WhopCatalogSyncError('invalid_cli_response', 'Whop returned an invalid item.');
    }
    return parsed;
  });
}

function metadataOf(value: JsonRecord): JsonRecord {
  return record(value.metadata) ?? {};
}

function nestedId(value: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const direct = value[key];
    if (typeof direct === 'string') return direct;
    const nested = record(direct);
    if (nested && typeof nested.id === 'string') return nested.id;
  }
  return null;
}

function metadataMatches(actual: JsonRecord, expected: Record<string, string>): boolean {
  const actualEntries = Object.entries(actual);
  const expectedEntries = Object.entries(expected);
  return (
    actualEntries.length === expectedEntries.length &&
    expectedEntries.every(([key, value]) => actual[key] === value)
  );
}

function productMetadata(): Record<string, string> {
  return {
    managed_by: WHOP_CATALOG_MANAGER,
    app_slug: 'clipsubtitles',
    catalog_version: BILLING_CATALOG.version,
  };
}

function option(name: string, value: string | number): string[] {
  return [`--${name}`, String(value)];
}

function recurringCreateArgs(desired: DesiredPlan): string[] {
  if (desired.planType !== 'renewal') return [];
  if (!desired.billingPeriod) {
    throw new WhopCatalogSyncError(
      'invalid_configuration',
      `${desired.sku} is missing its billing period.`,
    );
  }
  return [
    ...option('billing_period', desired.billingPeriod),
    ...option('renewal_price', desired.price),
  ];
}

function productWriteArgs(
  command: 'create' | 'update',
  accountId: string,
  productId?: string,
): string[] {
  return [
    'products',
    command,
    ...(productId ? [productId] : []),
    ...option('title', 'ClipSubtitles Plans'),
    ...option('description', 'Caption credits for ClipSubtitles web, API and agent workflows.'),
    ...option('visibility', 'hidden'),
    ...option('metadata', JSON.stringify(productMetadata())),
    ...(command === 'create'
      ? [
          ...option('account_id', accountId),
          ...option('idempotency-key', `clipsubtitles-${BILLING_CATALOG.version}-product`),
        ]
      : []),
  ];
}

function planWriteArgs(
  command: 'create' | 'update',
  desired: DesiredPlan,
  accountId: string,
  productId: string,
  planId?: string,
): string[] {
  return [
    'plans',
    command,
    ...(planId ? [planId] : []),
    ...option('title', desired.title),
    ...option('description', desired.description),
    ...option('visibility', 'hidden'),
    ...option('metadata', JSON.stringify(desired.metadata)),
    ...(command === 'create'
      ? [
          ...option('currency', 'usd'),
          ...option('initial_price', desired.price),
          ...option('release_method', 'buy_now'),
          '--adaptive_pricing_enabled=false',
          '--unlimited_stock',
          ...option('account_id', accountId),
          ...option('product_id', productId),
          ...option('plan_type', desired.planType),
          ...recurringCreateArgs(desired),
          ...option('idempotency-key', `clipsubtitles-${BILLING_CATALOG.version}-${desired.sku}`),
        ]
      : []),
  ];
}

function findManagedProduct(products: JsonRecord[], accountId: string): JsonRecord | null {
  const managed = products.filter((product) => {
    const metadata = metadataOf(product);
    return metadata.managed_by === WHOP_CATALOG_MANAGER || metadata.app_slug === 'clipsubtitles';
  });
  const titleCollisions = products.filter((product) => product.title === 'ClipSubtitles Plans');
  if (
    managed.length > 1 ||
    titleCollisions.some((product) => !managed.includes(product))
  ) {
    throw new WhopCatalogSyncError('catalog_collision', 'Multiple ClipSubtitles products exist.');
  }
  const product = managed[0] ?? null;
  if (product && nestedId(product, 'company', 'account', 'account_id') !== accountId) {
    throw new WhopCatalogSyncError('catalog_collision', 'The product belongs to another account.');
  }
  return product;
}

function indexManagedPlans(
  plans: JsonRecord[],
  productId: string | null,
  accountId: string,
): Map<BillingSku, JsonRecord> {
  const expected = new Set(desiredWhopPlans().map((plan) => plan.sku));
  const indexed = new Map<BillingSku, JsonRecord>();
  for (const plan of plans) {
    const metadata = metadataOf(plan);
    const key = metadata.catalog_key;
    const claimsApp =
      metadata.managed_by === WHOP_CATALOG_MANAGER || metadata.app_slug === 'clipsubtitles';
    const attached = productId !== null && nestedId(plan, 'product', 'product_id') === productId;
    if (!claimsApp && !attached) continue;
    if (typeof key !== 'string' || !expected.has(key as BillingSku) || indexed.has(key as BillingSku)) {
      throw new WhopCatalogSyncError('catalog_collision', 'A colliding or duplicate plan exists.');
    }
    if (!attached || nestedId(plan, 'company', 'account', 'account_id') !== accountId) {
      throw new WhopCatalogSyncError('catalog_collision', 'A managed plan has invalid ownership.');
    }
    indexed.set(key as BillingSku, plan);
  }
  return indexed;
}

function immutableDrift(
  actual: JsonRecord,
  desired: DesiredPlan,
  accountId: string,
  productId: string,
): string[] {
  const drift: string[] = [];
  if (actual.plan_type !== desired.planType) drift.push('plan_type');
  if (String(actual.currency).toLowerCase() !== 'usd') drift.push('currency');
  if (Number(actual.initial_price) !== desired.price) drift.push('initial_price');
  if (actual.release_method !== 'buy_now') drift.push('release_method');
  if (actual.adaptive_pricing_enabled !== false) drift.push('adaptive_pricing_enabled');
  if (actual.unlimited_stock !== true) drift.push('unlimited_stock');
  if (actual.expiration_days !== null && actual.expiration_days !== undefined) {
    drift.push('expiration_days');
  }
  if (actual.trial_period_days !== null && actual.trial_period_days !== undefined) {
    drift.push('trial_period_days');
  }
  if (nestedId(actual, 'company', 'account', 'account_id') !== accountId) drift.push('account_id');
  if (nestedId(actual, 'product', 'product_id') !== productId) drift.push('product_id');
  if (desired.planType === 'renewal') {
    if (Number(actual.billing_period) !== desired.billingPeriod) drift.push('billing_period');
    if (Number(actual.renewal_price) !== desired.price) drift.push('renewal_price');
  } else {
    if (actual.billing_period !== null && actual.billing_period !== undefined) {
      drift.push('billing_period');
    }
    if (actual.renewal_price !== null && actual.renewal_price !== undefined) {
      drift.push('renewal_price');
    }
  }
  return drift;
}

function mutableDrift(actual: JsonRecord, desired: DesiredPlan): string[] {
  const drift: string[] = [];
  if (actual.title !== desired.title) drift.push('title');
  if (actual.description !== desired.description) drift.push('description');
  if (actual.visibility !== 'hidden') drift.push('visibility');
  if (!metadataMatches(metadataOf(actual), desired.metadata)) drift.push('metadata');
  return drift;
}

async function listResources(
  runner: WhopCommandRunner,
  resource: 'products' | 'plans',
  accountId: string,
): Promise<JsonRecord[]> {
  const items: JsonRecord[] = [];
  let after: string | null = null;
  const observedCursors = new Set<string>();
  for (let page = 0; page < 100; page += 1) {
    const response = await runner.run([
      resource,
      'list',
      '--account_id',
      accountId,
      '--first',
      '100',
      ...(after ? ['--after', after] : []),
    ]);
    const payload = record(unwrap(response));
    items.push(...extractItems(response));
    const pageInfo = record(payload?.page_info);
    if (!pageInfo || typeof pageInfo.has_next_page !== 'boolean') {
      throw new WhopCatalogSyncError('invalid_cli_response', 'Whop omitted pagination metadata.');
    }
    if (!pageInfo.has_next_page) return items;
    const cursor = pageInfo.end_cursor;
    if (typeof cursor !== 'string' || cursor.length === 0 || observedCursors.has(cursor)) {
      throw new WhopCatalogSyncError('invalid_cli_response', 'Whop returned invalid pagination.');
    }
    observedCursors.add(cursor);
    after = cursor;
  }
  throw new WhopCatalogSyncError('invalid_cli_response', 'Whop pagination exceeded 100 pages.');
}

export async function syncWhopCatalog(input: {
  apply: boolean;
  accountId: string;
  runner: WhopCommandRunner;
}): Promise<CatalogSyncResult> {
  if (!/^biz_[A-Za-z0-9]+$/.test(input.accountId)) {
    throw new WhopCatalogSyncError('invalid_configuration', 'WHOP_ACCOUNT_ID is invalid.');
  }
  const version = await input.runner.version();
  if (version.trim() !== WHOP_CLI_VERSION) {
    throw new WhopCatalogSyncError(
      'unsupported_cli_version',
      `Whop CLI ${WHOP_CLI_VERSION} is required.`,
    );
  }

  const products = await listResources(input.runner, 'products', input.accountId);
  const existingProduct = findManagedProduct(products, input.accountId);
  const productMutableDrift = existingProduct
    ? [
        ...(existingProduct.title === 'ClipSubtitles Plans' ? [] : ['title']),
        ...(existingProduct.description ===
        'Caption credits for ClipSubtitles web, API and agent workflows.'
          ? []
          : ['description']),
        ...(existingProduct.visibility === 'hidden' ? [] : ['visibility']),
        ...(metadataMatches(metadataOf(existingProduct), productMetadata()) ? [] : ['metadata']),
      ]
    : ['missing'];

  const productAction: CatalogSyncAction = {
    resource: 'product',
    key: 'clipsubtitles',
    operation: !existingProduct
      ? 'create'
      : productMutableDrift.length === 0
        ? 'unchanged'
        : 'update',
    drift: productMutableDrift,
  };

  let productId = existingProduct ? String(existingProduct.id) : null;
  if (input.apply && productAction.operation !== 'unchanged') {
    const response = await input.runner.run(
      productWriteArgs(productAction.operation, input.accountId, productId ?? undefined),
    );
    productId = String(extractEntity(response, 'prod_').id);
  }

  const plans = await listResources(input.runner, 'plans', input.accountId);
  const existingPlans = indexManagedPlans(plans, productId, input.accountId);
  const actions: CatalogSyncAction[] = [productAction];

  for (const desired of desiredWhopPlans()) {
    const actual = existingPlans.get(desired.sku) ?? null;
    const immutable = actual && productId
      ? immutableDrift(actual, desired, input.accountId, productId)
      : [];
    if (immutable.length > 0) {
      throw new WhopCatalogSyncError(
        'immutable_drift',
        `${desired.sku} has immutable provider drift: ${immutable.join(', ')}. Create a new catalog version instead of rewriting a sold plan.`,
      );
    }
    const drift = actual ? mutableDrift(actual, desired) : ['missing'];
    const operation = !actual ? 'create' : drift.length === 0 ? 'unchanged' : 'update';
    actions.push({ resource: 'plan', key: desired.sku, operation, drift });
    if (input.apply) {
      if (!productId) {
        throw new WhopCatalogSyncError('readback_failed', 'The managed product has no ID.');
      }
      if (operation !== 'unchanged') {
        await input.runner.run(
          planWriteArgs(operation, desired, input.accountId, productId, actual ? String(actual.id) : undefined),
        );
      }
    }
  }

  if (!input.apply) {
    return {
      status: 'dry_run',
      catalogVersion: BILLING_CATALOG.version,
      actions,
      mutationsApplied: false,
    };
  }

  const verifiedProducts = await listResources(input.runner, 'products', input.accountId);
  const verifiedProduct = findManagedProduct(verifiedProducts, input.accountId);
  if (!verifiedProduct) {
    throw new WhopCatalogSyncError('readback_failed', 'Product readback failed.');
  }
  const verifiedProductId = String(verifiedProduct.id);
  const verifiedPlans = indexManagedPlans(
    await listResources(input.runner, 'plans', input.accountId),
    verifiedProductId,
    input.accountId,
  );
  const bindings: Partial<Record<BillingSku, string>> = {};
  for (const desired of desiredWhopPlans()) {
    const actual = verifiedPlans.get(desired.sku);
    if (
      !actual ||
      immutableDrift(actual, desired, input.accountId, verifiedProductId).length > 0 ||
      mutableDrift(actual, desired).length > 0
    ) {
      throw new WhopCatalogSyncError('readback_failed', `${desired.sku} failed exact readback.`);
    }
    bindings[desired.sku] = String(actual.id);
  }
  return {
    status: 'verified',
    catalogVersion: BILLING_CATALOG.version,
    actions,
    mutationsApplied: actions.some((action) => action.operation !== 'unchanged'),
    planBindings: bindings,
  };
}
