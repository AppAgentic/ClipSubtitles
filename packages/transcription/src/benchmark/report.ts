import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BenchmarkRun } from './runner';

function pct(n: number | null): string {
  return n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`;
}

function yesNo(v: boolean | null): string {
  return v === null ? 'n/a' : v ? 'yes' : 'NO';
}

export function renderMarkdown(run: BenchmarkRun): string {
  const lines: string[] = [];
  lines.push('# Transcription benchmark report');
  lines.push('');
  lines.push(`Started: ${run.startedAt}  `);
  lines.push(`Providers: ${run.providerIds.join(', ') || '(none)'}  `);
  lines.push(`Repeats: ${run.repeats}  `);
  lines.push(`Live evidence: **${run.live ? 'yes' : 'no'}**`);
  lines.push('');
  if (!run.live) {
    lines.push(
      '> **No provider winner is claimed.** Only mock providers ran, so this report only demonstrates that the harness, fixtures, and scorer behave as designed. Run with live credentials to produce evidence.',
    );
    lines.push('');
  }
  for (const note of run.notes) lines.push(`- ${note}`);
  if (run.notes.length) lines.push('');

  lines.push('## Provider summary');
  lines.push('');
  lines.push('| Provider | Cases | Failure rate | Mean WER | Median WER | Entity acc. | Mean |drift| ms | Max drift slope ms/min | Break F1 | RTF | Cost (USD) |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const a of run.aggregates) {
    lines.push(
      `| ${a.providerId} | ${a.cases} | ${pct(a.failureRate)} | ${pct(a.meanWer)} | ${pct(a.medianWer)} | ${pct(a.entityAccuracy)} | ${a.meanDriftAbsMs} | ${a.maxDriftSlopeMsPerMin} | ${a.meanBreakF1.toFixed(3)} | ${a.meanRealtimeFactor} | ${a.totalUsd === null ? 'unknown' : a.totalUsd.toFixed(4)} |`,
    );
  }
  lines.push('');

  lines.push('## Acceptance gates');
  lines.push('');
  lines.push(`Baseline for accuracy comparison: \`${run.baselineId}\`.`);
  lines.push('');
  lines.push('| Provider | Live evidence | No cumulative drift | Drift within tolerance | Failure rate ok | Better than baseline | Entity accuracy ok | Passes | Notes |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const g of run.gates) {
    lines.push(
      `| ${g.providerId} | ${yesNo(g.liveEvidence)} | ${yesNo(g.noCumulativeDrift)} | ${yesNo(g.driftWithinTolerance)} | ${yesNo(g.failureRateOk)} | ${yesNo(g.betterThanBaseline)} | ${yesNo(g.entityAccuracyOk)} | ${g.passes ? 'yes' : 'no'} | ${g.reasons.join('; ') || '—'} |`,
    );
  }
  lines.push('');

  lines.push('## Mean WER by category');
  lines.push('');
  const categories = Array.from(new Set(run.scores.map((s) => s.category)));
  lines.push(`| Provider | ${categories.join(' | ')} |`);
  lines.push(`|---|${categories.map(() => '---:').join('|')}|`);
  for (const a of run.aggregates) {
    lines.push(`| ${a.providerId} | ${categories.map((c) => pct(a.byCategory[c]?.meanWer ?? null)).join(' | ')} |`);
  }
  lines.push('');

  lines.push('## Per-case results');
  lines.push('');
  lines.push('| Case | Category | Provider | OK | WER | Entity | |drift| ms | Slope ms/min | Break F1 | Latency ms |');
  lines.push('|---|---|---|---|---:|---:|---:|---:|---:|---:|');
  for (const s of run.scores) {
    lines.push(
      `| ${s.caseId} | ${s.category} | ${s.providerId} | ${s.ok ? 'yes' : `no (${s.errorCode})`} | ${pct(s.wer)} | ${pct(s.entityAccuracy)} | ${s.driftMeanAbsMs} | ${s.driftSlopeMsPerMin} | ${s.breakF1.toFixed(3)} | ${s.latencyMs} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export async function writeReport(run: BenchmarkRun, outDir: string, name = 'latest'): Promise<{ jsonPath: string; mdPath: string }> {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${name}.json`);
  const mdPath = path.join(outDir, `${name}.md`);
  await writeFile(jsonPath, JSON.stringify(run, null, 2));
  await writeFile(mdPath, renderMarkdown(run));
  return { jsonPath, mdPath };
}
