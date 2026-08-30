import path from 'node:path';
import { createProviderRegistry } from '../registry';
import { BENCHMARK_CASES } from './corpus';
import { buildFixtures, defaultFixturesDir, resolveRepoRoot } from './fixtures';
import { renderMarkdown, writeReport } from './report';
import { runBenchmark } from './runner';

interface CliArgs {
  providers: string[];
  repeats: number;
  out: string;
  fixtures: string;
  cases: string[] | null;
  baseline: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    providers: ['mock', 'mock-noisy', 'mock-drifty', 'mock-flaky'],
    repeats: 1,
    out: path.join(resolveRepoRoot(), 'fixtures', 'benchmark', 'reports'),
    fixtures: defaultFixturesDir(),
    cases: null,
    baseline: 'gemini',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)] ?? '';
    if (a === '--providers')
      args.providers = next()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === '--repeats') args.repeats = Math.max(1, Number(next()) || 1);
    else if (a === '--out') args.out = path.resolve(next());
    else if (a === '--fixtures') args.fixtures = path.resolve(next());
    else if (a === '--cases')
      args.cases = next()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === '--baseline') args.baseline = next();
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: pnpm benchmark [--providers mock,mock-noisy,elevenlabs,gemini] [--repeats N] [--cases id,id] [--baseline gemini] [--out DIR] [--fixtures DIR]',
      );
      process.exit(0);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await buildFixtures({ outDir: args.fixtures, skipVideo: true });
  const registry = createProviderRegistry(process.env);
  const cases = args.cases
    ? BENCHMARK_CASES.filter((c) => args.cases?.includes(c.id))
    : BENCHMARK_CASES;
  const run = await runBenchmark({
    registry,
    providerIds: args.providers,
    fixturesDir: args.fixtures,
    cases,
    repeats: args.repeats,
    baselineId: args.baseline,
    onProgress: (m) => console.log(m),
  });
  const stamp = run.startedAt.replace(/[:.]/g, '-');
  await writeReport(run, args.out, `benchmark-${stamp}`);
  const { mdPath } = await writeReport(run, args.out, 'latest');
  console.log('');
  console.log(renderMarkdown(run));
  console.log(`Report written to ${mdPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
