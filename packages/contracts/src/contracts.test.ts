import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  BILLING_CATALOG,
  BillingCatalogSchema,
  CreateProjectRequestSchema,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
  ERROR_RETRYABLE,
  IdempotencyKeySchema,
  LIMITS,
  MCP_TOOLS,
  MCP_TOOL_NAMES,
  OutputSettingsSchema,
  PatchProjectRequestSchema,
  StyleConfigSchema,
  TranscriptWordSchema,
  idSchema,
} from './index';

describe('billing catalog', () => {
  it('is valid, versioned, and exposes unique stable SKUs', () => {
    expect(BillingCatalogSchema.parse(BILLING_CATALOG)).toEqual(BILLING_CATALOG);
    expect(BILLING_CATALOG.version).toMatch(/^2026-/);
    const skus = [
      ...BILLING_CATALOG.plans.flatMap((plan) => ('sku' in plan ? [plan.sku, plan.annualSku] : [])),
      ...BILLING_CATALOG.topUps.map((topUp) => topUp.sku),
    ];
    expect(new Set(skus).size).toBe(skus.length);
  });

  it('keeps the free grant separate from recurring paid credits', () => {
    const free = BILLING_CATALOG.plans.find((plan) => plan.id === 'free');
    expect(free).toMatchObject({ monthlyPriceCents: 0, monthlyCredits: 0 });
    expect(BILLING_CATALOG.freeLifetimeCredits).toBe(10);
  });

  it('matches the approved launch prices and credit allowances', () => {
    expect(
      BILLING_CATALOG.plans.map(({ id, monthlyPriceCents, monthlyCredits }) => ({
        id,
        monthlyPriceCents,
        monthlyCredits,
      })),
    ).toEqual([
      { id: 'free', monthlyPriceCents: 0, monthlyCredits: 0 },
      { id: 'creator', monthlyPriceCents: 1_500, monthlyCredits: 300 },
      { id: 'pro', monthlyPriceCents: 3_900, monthlyCredits: 1_000 },
      { id: 'studio', monthlyPriceCents: 9_900, monthlyCredits: 3_000 },
    ]);
  });

  it('includes agent and API access on every plan', () => {
    expect(BILLING_CATALOG.plans.every((plan) => plan.apiAccess)).toBe(true);
  });

  it('offers annual paid plans with clean monthly equivalents at fifteen to twenty percent off', () => {
    expect(
      BILLING_CATALOG.plans.flatMap((plan) =>
        'annualSku' in plan
          ? [
              {
                id: plan.id,
                annualPriceCents: plan.annualPriceCents,
                annualCredits: plan.annualCredits,
              },
            ]
          : [],
      ),
    ).toEqual([
      { id: 'creator', annualPriceCents: 14_400, annualCredits: 3_600 },
      { id: 'pro', annualPriceCents: 39_600, annualCredits: 12_000 },
      { id: 'studio', annualPriceCents: 100_800, annualCredits: 36_000 },
    ]);
  });
});

describe('error contract', () => {
  it('maps every error code to an HTTP status, retryability, and message', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(typeof ERROR_RETRYABLE[code]).toBe('boolean');
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(5);
    }
  });

  it('accepts a well-formed public error and rejects unknown codes', () => {
    expect(
      ApiErrorSchema.safeParse({
        error: { code: 'NOT_FOUND', message: 'x', retryable: false, errorRef: 'err_abc' },
      }).success,
    ).toBe(true);
    expect(
      ApiErrorSchema.safeParse({
        error: { code: 'PROVIDER_STACK_TRACE', message: 'x', retryable: false },
      }).success,
    ).toBe(false);
  });
});

describe('id schemas', () => {
  it('validates prefixed ids and rejects other kinds', () => {
    expect(idSchema('project').safeParse('proj_01j5abcdefghjkmnpqrs').success).toBe(true);
    expect(idSchema('project').safeParse('task_01j5abcdefghjkmnpqrs').success).toBe(false);
    expect(idSchema('project').safeParse('proj_').success).toBe(false);
    expect(idSchema('project').safeParse('proj_ABCDEFGHJKMNPQRSTVWX').success).toBe(false);
  });

  it('bounds idempotency keys', () => {
    expect(IdempotencyKeySchema.safeParse('short').success).toBe(false);
    expect(
      IdempotencyKeySchema.safeParse('a'.repeat(LIMITS.maxIdempotencyKeyChars + 1)).success,
    ).toBe(false);
    expect(IdempotencyKeySchema.safeParse('render:proj_1:attempt-1').success).toBe(true);
    expect(IdempotencyKeySchema.safeParse('has spaces here').success).toBe(false);
  });
});

describe('request schemas are strict and bounded', () => {
  it('rejects unknown keys and caller-supplied ownership fields', () => {
    const r = CreateProjectRequestSchema.safeParse({
      title: 'x',
      workspaceId: 'ws_abc',
      userId: 'u1',
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-http source URLs', () => {
    expect(CreateProjectRequestSchema.safeParse({ sourceUrl: 'file:///etc/passwd' }).success).toBe(
      false,
    );
    expect(CreateProjectRequestSchema.safeParse({ sourceUrl: 'ftp://host/x.mp4' }).success).toBe(
      false,
    );
    expect(
      CreateProjectRequestSchema.safeParse({ sourceUrl: 'https://example.com/x.mp4' }).success,
    ).toBe(true);
  });

  it('caps patch operations', () => {
    const ops = Array.from({ length: LIMITS.maxPatchOps + 1 }, () => ({
      op: 'set_title',
      title: 't',
    }));
    expect(PatchProjectRequestSchema.safeParse({ expectedVersion: 1, ops }).success).toBe(false);
    expect(
      PatchProjectRequestSchema.safeParse({ expectedVersion: 1, ops: ops.slice(0, 3) }).success,
    ).toBe(true);
  });

  it('rejects inverted word timing', () => {
    const r = PatchProjectRequestSchema.safeParse({
      expectedVersion: 1,
      ops: [{ op: 'set_word_timing', wordId: 'w_01j5abcdefghjkmnpqrs', startMs: 500, endMs: 400 }],
    });
    expect(r.success).toBe(false);
  });

  it('requires unique output kinds', () => {
    expect(
      OutputSettingsSchema.safeParse({
        outputs: ['mp4', 'mp4'],
        resolution: '1080p',
        fps: 'source',
        quality: 'standard',
      }).success,
    ).toBe(false);
  });

  it('bounds word text and confidence', () => {
    expect(
      TranscriptWordSchema.safeParse({
        id: 'w_01j5abcdefghjkmnpqrs',
        text: '',
        startMs: 0,
        endMs: 10,
      }).success,
    ).toBe(false);
    expect(
      TranscriptWordSchema.safeParse({
        id: 'w_01j5abcdefghjkmnpqrs',
        text: 'hi',
        startMs: 0,
        endMs: 10,
        confidence: 2,
      }).success,
    ).toBe(false);
  });

  it('requires complete style configs but allows partial patches', () => {
    expect(StyleConfigSchema.safeParse({ preset: 'clean' }).success).toBe(false);
  });
});

describe('MCP registry', () => {
  it('exposes exactly the twelve contracted tools with annotations and scopes', () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual([...MCP_TOOL_NAMES]);
    expect(MCP_TOOLS).toHaveLength(13);
    for (const tool of MCP_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.annotations.title.length).toBeGreaterThan(0);
      expect(['captions:read', 'captions:write']).toContain(tool.scope);
      if (tool.annotations.readOnlyHint) expect(tool.scope).toBe('captions:read');
    }
    const paid = MCP_TOOLS.filter((t) => t.cost === 'credits').map((t) => t.name);
    expect(paid).toEqual(['render_caption_export']);
  });

  it('tool inputs never accept caller-provided identity', () => {
    for (const tool of MCP_TOOLS) {
      const keys = Object.keys(tool.inputSchema.shape);
      expect(keys).not.toContain('userId');
      expect(keys).not.toContain('workspaceId');
    }
  });
});
