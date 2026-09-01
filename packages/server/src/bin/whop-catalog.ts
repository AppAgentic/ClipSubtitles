import {
  createWhopCliRunner,
  createMcVaultPlanBindingSink,
  parseCatalogSyncArguments,
  syncWhopCatalog,
  WhopCatalogSyncError,
} from '../billing/catalog-sync';

async function main(): Promise<void> {
  const { apply } = parseCatalogSyncArguments(process.argv.slice(2));
  const accountId = process.env.WHOP_ACCOUNT_ID;
  if (!accountId) {
    throw new WhopCatalogSyncError(
      'invalid_configuration',
      'WHOP_ACCOUNT_ID must identify the verified AppAgentic Whop business.',
    );
  }
  const result = await syncWhopCatalog({
    apply,
    accountId,
    runner: createWhopCliRunner(),
  });
  if (apply && result.planBindings) {
    const sink = createMcVaultPlanBindingSink();
    for (const [sku, planId] of Object.entries(result.planBindings)) {
      if (planId) await sink.store(sku as keyof typeof result.planBindings, planId);
    }
  }
  const safeResult = {
    status: result.status,
    catalogVersion: result.catalogVersion,
    mutationsApplied: result.mutationsApplied,
    actions: result.actions,
    ...(result.planBindings
      ? { planBindingsVerified: Object.keys(result.planBindings).sort() }
      : {}),
  };
  process.stdout.write(`${JSON.stringify(safeResult, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown Whop catalog error.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
