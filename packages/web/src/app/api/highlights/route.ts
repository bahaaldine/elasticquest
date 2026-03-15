import { NextResponse } from 'next/server';
import {
  getLeaderboard,
  getScenarioLeaderboard,
  getChallengePassRates,
} from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [leaderboard, scenarios, passRates] = await Promise.all([
    getLeaderboard(),
    getScenarioLeaderboard(),
    getChallengePassRates(),
  ]);

  if (leaderboard.length === 0) {
    return NextResponse.json({ empty: true });
  }

  // --- The Numbers ---
  const totalModels = leaderboard.length;
  const totalRuns = leaderboard.reduce((sum, e) => sum + e.runCount, 0);
  const avgScore = Math.round(
    leaderboard.reduce((sum, e) => sum + e.percentage, 0) / totalModels,
  );

  // --- Champion ---
  const champion = leaderboard[0];

  // --- Podium ---
  const podium = leaderboard.slice(0, 3);

  // --- Domain Champions ---
  const allDomains = [
    ...new Set(leaderboard.flatMap((e) => Object.keys(e.domainScores))),
  ];
  const domainChampions: Array<{
    domain: string;
    modelName: string;
    provider: string;
    score: number;
    modelId: string;
  }> = [];
  for (const domain of allDomains) {
    let best = { modelName: '', provider: '', score: 0, modelId: '' };
    for (const e of leaderboard) {
      const score = e.domainScores[domain] ?? 0;
      if (score > best.score) {
        best = { modelName: e.modelName, provider: e.provider, score, modelId: e.modelId };
      }
    }
    if (best.score > 0) {
      domainChampions.push({ domain, ...best });
    }
  }
  domainChampions.sort((a, b) => b.score - a.score);

  // --- Speed Demon ---
  const speedDemon = [...leaderboard].sort(
    (a, b) => a.avgLatencyMs - b.avgLatencyMs,
  )[0];

  // --- Best Bang for Buck ---
  const withCost = leaderboard.filter((e) => e.costUsd && e.costUsd > 0);
  const bestValue = withCost.length > 0
    ? [...withCost].sort(
        (a, b) => (b.scorePerDollar ?? 0) - (a.scorePerDollar ?? 0),
      )[0]
    : null;

  // --- Hardest Challenge ---
  const challengeEntries = Object.entries(passRates);
  let hardest: { id: string; passRate: number; total: number } | null = null;
  let easiest: { id: string; passRate: number; total: number } | null = null;
  if (challengeEntries.length > 0) {
    const sorted = challengeEntries
      .filter(([, v]) => v.total >= 2) // need at least 2 attempts
      .map(([id, v]) => ({
        id,
        passRate: Math.round((v.passed / v.total) * 100),
        total: v.total,
      }))
      .sort((a, b) => a.passRate - b.passRate);
    hardest = sorted[0] ?? null;
    easiest = sorted[sorted.length - 1] ?? null;
  }

  // --- Skill Uplift ---
  const withUplift = scenarios.filter((s) => s.skillUplift !== undefined);
  let biggestUplift: {
    modelName: string;
    provider: string;
    uplift: number;
    baseline: number;
    withSkills: number;
  } | null = null;
  if (withUplift.length > 0) {
    const best = [...withUplift].sort(
      (a, b) => (b.skillUplift ?? 0) - (a.skillUplift ?? 0),
    )[0];
    biggestUplift = {
      modelName: best.modelName,
      provider: best.provider,
      uplift: best.skillUplift!,
      baseline: best.baselinePercentage ?? 0,
      withSkills: best.skillsPercentage ?? 0,
    };
  }

  // --- Grade Distribution ---
  const gradeDistribution: Record<string, number> = {
    S: 0, A: 0, B: 0, C: 0, D: 0, F: 0,
  };
  for (const e of leaderboard) {
    const g = e.percentage >= 95 ? 'S'
      : e.percentage >= 80 ? 'A'
      : e.percentage >= 65 ? 'B'
      : e.percentage >= 50 ? 'C'
      : e.percentage >= 30 ? 'D'
      : 'F';
    gradeDistribution[g]++;
  }

  // --- Provider breakdown ---
  const providerCounts: Record<string, number> = {};
  for (const e of leaderboard) {
    providerCounts[e.provider] = (providerCounts[e.provider] ?? 0) + 1;
  }

  return NextResponse.json({
    empty: false,
    totalModels,
    totalRuns,
    avgScore,
    champion: {
      modelName: champion.modelName,
      provider: champion.provider,
      percentage: champion.percentage,
      correct: champion.correct,
      total: champion.total,
      avgLatencyMs: champion.avgLatencyMs,
      domainScores: champion.domainScores,
      modelId: champion.modelId,
    },
    podium: podium.map((e) => ({
      modelName: e.modelName,
      provider: e.provider,
      percentage: e.percentage,
      modelId: e.modelId,
    })),
    domainChampions,
    speedDemon: speedDemon
      ? {
          modelName: speedDemon.modelName,
          provider: speedDemon.provider,
          avgLatencyMs: speedDemon.avgLatencyMs,
          percentage: speedDemon.percentage,
        }
      : null,
    bestValue: bestValue
      ? {
          modelName: bestValue.modelName,
          provider: bestValue.provider,
          costUsd: bestValue.costUsd,
          scorePerDollar: bestValue.scorePerDollar,
          percentage: bestValue.percentage,
        }
      : null,
    hardestChallenge: hardest,
    easiestChallenge: easiest,
    biggestUplift,
    gradeDistribution,
    providerCounts,
    scenarioCount: scenarios.length,
  });
}
