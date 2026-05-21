import * as fs from 'fs';
import * as path from 'path';
import type { BenchmarkResult, LeaderboardRow } from './types';

const RESULTS_DIR = path.join(process.cwd(), '.elastic-quest-results');
const RESULTS_FILE = path.join(RESULTS_DIR, 'results.json');

export class BenchmarkStore {
  private results: BenchmarkResult[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(RESULTS_FILE)) {
        this.results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
      }
    } catch {
      this.results = [];
    }
  }

  private save(): void {
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(this.results, null, 2));
  }

  addResult(result: BenchmarkResult): void {
    this.results.push(result);
    this.save();

    // Also save individual result file
    const filename = `${result.provider}-${result.modelName}-${result.timestamp}.json`
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    fs.writeFileSync(
      path.join(RESULTS_DIR, filename),
      JSON.stringify(result, null, 2),
    );
  }

  getResults(): BenchmarkResult[] {
    return [...this.results];
  }

  private static resultKey(result: BenchmarkResult): string {
    const lang = result.language ?? 'dsl';
    const hints = result.hints !== false ? 'hints' : 'nohints';
    return `${result.modelId}|${lang}|${hints}`;
  }

  getBestPerModel(): Map<string, BenchmarkResult> {
    const best = new Map<string, BenchmarkResult>();
    for (const result of this.results) {
      const key = BenchmarkStore.resultKey(result);
      const existing = best.get(key);
      if (!existing || result.totalScore > existing.totalScore) {
        best.set(key, result);
      }
    }
    return best;
  }

  getLeaderboard(): LeaderboardRow[] {
    const best = this.getBestPerModel();
    const rows: LeaderboardRow[] = [];

    for (const [, result] of best) {
      const domainScores: Record<string, number> = {};
      for (const ds of result.domainScores) {
        domainScores[ds.domain] = ds.percentage;
      }

      rows.push({
        rank: 0, // Will be set after sorting
        modelId: result.modelId,
        modelName: result.modelName,
        provider: result.provider,
        language: result.language ?? 'dsl',
        hints: result.hints !== false,
        totalScore: result.totalScore,
        maxScore: result.maxPossibleScore,
        percentage: result.percentage,
        correct: result.correctChallenges,
        total: result.totalChallenges,
        avgLatencyMs: result.avgLatencyMs,
        timestamp: result.timestamp,
        domainScores,
      });
    }

    rows.sort((a, b) => b.percentage - a.percentage || a.avgLatencyMs - b.avgLatencyMs);
    rows.forEach((r, i) => (r.rank = i + 1));

    return rows;
  }

  getBestForModel(modelId: string): BenchmarkResult | undefined {
    return this.results
      .filter((r) => r.modelId === modelId)
      .reduce<BenchmarkResult | undefined>(
        (best, r) => (!best || r.totalScore > best.totalScore ? r : best),
        undefined,
      );
  }

  getModelComparison(modelA: string, modelB: string): {
    a: BenchmarkResult | undefined;
    b: BenchmarkResult | undefined;
  } {
    return {
      a: this.getBestForModel(modelA),
      b: this.getBestForModel(modelB),
    };
  }
}

// --- Display Helpers ---

export function formatLeaderboard(rows: LeaderboardRow[]): string {
  if (rows.length === 0) return 'No benchmark results yet. Run: elastic-quest benchmark --model <provider:model>\n';

  const lines: string[] = [];
  lines.push('');
  lines.push('╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗');
  lines.push('║                                ELASTICQUEST MODEL LEADERBOARD                                   ║');
  lines.push('╠═══════════════════════════════════════════════════════════════════════════════════════════════════╣');
  lines.push('');

  const hdr = `  ${'#'.padEnd(4)}${'Model'.padEnd(28)}${'Lang'.padEnd(6)}${'Hints'.padEnd(7)}${'Score'.padEnd(12)}${'Pass'.padEnd(8)}${'%'.padEnd(7)}${'Latency'.padEnd(10)}`;
  lines.push(hdr);
  lines.push('  ' + '─'.repeat(hdr.length - 2));

  for (const row of rows) {
    const rank = String(row.rank).padEnd(4);
    const model = row.modelName.substring(0, 26).padEnd(28);
    const lang = (row.language ?? 'dsl').toUpperCase().padEnd(6);
    const hints = (row.hints !== false ? 'yes' : 'no').padEnd(7);
    const score = `${row.totalScore}/${row.maxScore}`.padEnd(12);
    const pass = `${row.correct}/${row.total}`.padEnd(8);
    const pct = `${row.percentage}%`.padEnd(7);
    const latency = `${row.avgLatencyMs}ms`.padEnd(10);
    lines.push(`  ${rank}${model}${lang}${hints}${score}${pass}${pct}${latency}`);
  }

  lines.push('');

  if (rows.length > 0) {
    lines.push('  Domain Breakdown (% correct):');
    lines.push('  ' + '─'.repeat(90));
    const domains = ['full-text-search', 'ingest-indexing', 'aggregations', 'observability', 'security', 'esql'];
    const domainLabels = ['Search', 'Ingest', 'Aggs', 'Obs', 'Security', 'ES|QL'];

    const dHdr = `  ${'Model'.padEnd(22)}${'Mode'.padEnd(14)}${domainLabels.map((d) => d.padEnd(10)).join('')}`;
    lines.push(dHdr);

    for (const row of rows.slice(0, 15)) {
      const model = row.modelName.substring(0, 20).padEnd(22);
      const mode = `${(row.language ?? 'dsl').toUpperCase()}/${row.hints !== false ? 'hints' : 'raw'}`.padEnd(14);
      const domainPcts = domains.map((d) => {
        const pct = row.domainScores[d];
        return pct !== undefined ? `${pct}%`.padEnd(10) : '—'.padEnd(10);
      }).join('');
      lines.push(`  ${model}${mode}${domainPcts}`);
    }
  }

  lines.push('');
  lines.push('╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝');
  lines.push('');

  return lines.join('\n');
}

export function formatResult(result: BenchmarkResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`═══ Benchmark Complete: ${result.provider}:${result.modelName} ═══`);
  lines.push('');
  lines.push(`  Total Score:  ${result.totalScore}/${result.maxPossibleScore} (${result.percentage}%)`);
  lines.push(`  Correct:      ${result.correctChallenges}/${result.totalChallenges}`);
  lines.push(`  Avg Latency:  ${result.avgLatencyMs}ms`);
  lines.push(`  Tokens:       ${result.totalInputTokens} in / ${result.totalOutputTokens} out`);
  lines.push('');

  // Domain breakdown
  lines.push('  By Domain:');
  for (const ds of result.domainScores) {
    const bar = makeBar(ds.percentage, 20);
    lines.push(`    ${ds.domain.padEnd(20)} ${bar} ${ds.percentage}% (${ds.correctCount}/${ds.challengeCount})`);
  }
  lines.push('');

  // Difficulty breakdown
  lines.push('  By Difficulty:');
  for (const ds of result.difficultyScores) {
    const bar = makeBar(ds.percentage, 20);
    lines.push(`    ${ds.difficulty.padEnd(20)} ${bar} ${ds.percentage}% (${ds.correctCount}/${ds.challengeCount})`);
  }
  lines.push('');

  // Per-challenge results
  lines.push('  Challenges:');
  for (const cs of result.challengeScores) {
    const mark = cs.correct ? 'PASS' : 'FAIL';
    const symbol = cs.correct ? '✓' : '✗';
    lines.push(`    ${symbol} [${mark}] ${cs.title.padEnd(35)} ${cs.score}/${cs.maxScore}  (${cs.latencyMs}ms)`);
  }

  lines.push('');

  return lines.join('\n');
}

export function formatComparison(
  a: BenchmarkResult,
  b: BenchmarkResult,
): string {
  const lines: string[] = [];
  const nameA = `${a.provider}:${a.modelName}`;
  const nameB = `${b.provider}:${b.modelName}`;

  lines.push('');
  lines.push(`═══ Model Comparison ═══`);
  lines.push('');
  lines.push(`  ${''.padEnd(22)} ${nameA.padEnd(25)} ${nameB.padEnd(25)}`);
  lines.push(`  ${'─'.repeat(72)}`);
  lines.push(`  ${'Score'.padEnd(22)} ${`${a.totalScore}/${a.maxPossibleScore} (${a.percentage}%)`.padEnd(25)} ${`${b.totalScore}/${b.maxPossibleScore} (${b.percentage}%)`.padEnd(25)}`);
  lines.push(`  ${'Correct'.padEnd(22)} ${`${a.correctChallenges}/${a.totalChallenges}`.padEnd(25)} ${`${b.correctChallenges}/${b.totalChallenges}`.padEnd(25)}`);
  lines.push(`  ${'Avg Latency'.padEnd(22)} ${`${a.avgLatencyMs}ms`.padEnd(25)} ${`${b.avgLatencyMs}ms`.padEnd(25)}`);
  lines.push('');

  lines.push('  By Domain:');
  const allDomains = new Set([
    ...a.domainScores.map((d) => d.domain),
    ...b.domainScores.map((d) => d.domain),
  ]);
  for (const domain of allDomains) {
    const aDs = a.domainScores.find((d) => d.domain === domain);
    const bDs = b.domainScores.find((d) => d.domain === domain);
    const aPct = aDs ? `${aDs.percentage}%` : '—';
    const bPct = bDs ? `${bDs.percentage}%` : '—';
    const winner = (aDs?.percentage ?? 0) > (bDs?.percentage ?? 0) ? '◀' : (bDs?.percentage ?? 0) > (aDs?.percentage ?? 0) ? '▶' : '=';
    lines.push(`    ${domain.padEnd(20)} ${aPct.padEnd(25)} ${bPct.padEnd(20)} ${winner}`);
  }

  lines.push('');
  return lines.join('\n');
}

function makeBar(percentage: number, width: number): string {
  const filled = Math.round((percentage / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
