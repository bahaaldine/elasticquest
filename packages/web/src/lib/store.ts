import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// Types shared between CLI and web
export interface ScoreSubmission {
  modelId: string;
  modelName: string;
  provider: string;
  totalScore: number;
  maxPossibleScore: number;
  percentage: number;
  totalChallenges: number;
  correctChallenges: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  domainScores: {
    domain: string;
    score: number;
    maxScore: number;
    percentage: number;
    challengeCount: number;
    correctCount: number;
  }[];
  difficultyScores: {
    difficulty: string;
    score: number;
    maxScore: number;
    percentage: number;
    challengeCount: number;
    correctCount: number;
  }[];
  challengeScores?: ChallengeDetail[];
  costUsd?: number;
  submittedAt?: string;

  // Scenario-specific fields (v2)
  skillsEnabled?: boolean;
  backendType?: 'simulated' | 'cloud' | 'start-local';
}

export interface ChallengeDetail {
  challengeId: string;
  domain: string;
  difficulty: string;
  title: string;
  score: number;
  maxScore: number;
  correct: boolean;
  feedback: string;
  latencyMs: number;
}

export interface LeaderboardEntry {
  rank: number;
  modelId: string;
  modelName: string;
  provider: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  correct: number;
  total: number;
  avgLatencyMs: number;
  domainScores: Record<string, number>;
  submittedAt: string;
  runCount: number;
  costUsd?: number;
  scorePerDollar?: number;
  skillsEnabled?: boolean;
  backendType?: string;
}

/** Grade tier based on score percentage (inspired by canirun.ai) */
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export function computeGrade(percentage: number): Grade {
  if (percentage >= 95) return 'S';
  if (percentage >= 80) return 'A';
  if (percentage >= 65) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 30) return 'D';
  return 'F';
}

export const GRADE_COLORS: Record<Grade, string> = {
  S: '#facc15',   // gold
  A: '#22c55e',   // green
  B: '#3b82f6',   // blue
  C: '#f97316',   // orange
  D: '#a855f7',   // purple
  F: '#ef4444',   // red
};

// --- Firestore ---

const COLLECTION = 'scores';
const DATABASE_ID = process.env.FIRESTORE_DATABASE ?? 'elastic-quest';

let _db: Firestore | null = null;

function getDb(): Firestore {
  if (_db) return _db;

  let app: App;
  if (getApps().length === 0) {
    app = initializeApp({
      projectId: process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'elastic-customer-eng',
    });
  } else {
    app = getApps()[0];
  }
  _db = getFirestore(app, DATABASE_ID);
  return _db;
}

export async function addScore(submission: ScoreSubmission): Promise<void> {
  const db = getDb();
  submission.submittedAt = submission.submittedAt ?? new Date().toISOString();
  await db.collection(COLLECTION).add(submission);
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const db = getDb();
  const snapshot = await db.collection(COLLECTION).get();

  const scores: ScoreSubmission[] = [];
  snapshot.forEach((doc) => {
    scores.push(doc.data() as ScoreSubmission);
  });

  // Group by modelId, keep best run per model
  const bestByModel = new Map<string, { best: ScoreSubmission; runCount: number }>();
  for (const score of scores) {
    const existing = bestByModel.get(score.modelId);
    if (!existing) {
      bestByModel.set(score.modelId, { best: score, runCount: 1 });
    } else {
      existing.runCount++;
      if (score.percentage > existing.best.percentage) {
        existing.best = score;
      }
    }
  }

  const entries: LeaderboardEntry[] = [];
  for (const [modelId, { best, runCount }] of bestByModel) {
    const domainScores: Record<string, number> = {};
    for (const ds of best.domainScores) {
      domainScores[ds.domain] = ds.percentage;
    }

    entries.push({
      rank: 0,
      modelId,
      modelName: best.modelName,
      provider: best.provider,
      totalScore: best.totalScore,
      maxScore: best.maxPossibleScore,
      percentage: best.percentage,
      correct: best.correctChallenges,
      total: best.totalChallenges,
      avgLatencyMs: best.avgLatencyMs,
      domainScores,
      submittedAt: best.submittedAt ?? new Date().toISOString(),
      runCount,
      costUsd: best.costUsd,
      scorePerDollar: best.costUsd && best.costUsd > 0
        ? Math.round(best.percentage / best.costUsd)
        : undefined,
      skillsEnabled: best.skillsEnabled,
      backendType: best.backendType,
    });
  }

  entries.sort((a, b) => b.percentage - a.percentage || a.avgLatencyMs - b.avgLatencyMs);
  entries.forEach((e, i) => (e.rank = i + 1));

  return entries;
}

export async function getModelScores(modelId: string): Promise<ScoreSubmission[]> {
  const db = getDb();
  const snapshot = await db
    .collection(COLLECTION)
    .where('modelId', '==', modelId)
    .get();

  const scores: ScoreSubmission[] = [];
  snapshot.forEach((doc) => {
    scores.push(doc.data() as ScoreSubmission);
  });
  return scores;
}

/**
 * Get all runs for a model, sorted by date descending.
 */
export async function getAllModelRuns(modelId: string): Promise<ScoreSubmission[]> {
  const db = getDb();
  const snapshot = await db
    .collection(COLLECTION)
    .where('modelId', '==', modelId)
    .get();

  const scores: ScoreSubmission[] = [];
  snapshot.forEach((doc) => {
    scores.push(doc.data() as ScoreSubmission);
  });
  scores.sort((a, b) => {
    const dateA = new Date(a.submittedAt ?? 0).getTime();
    const dateB = new Date(b.submittedAt ?? 0).getTime();
    return dateB - dateA;
  });
  return scores;
}

/**
 * Get challenge pass rates across all models.
 */
export async function getChallengePassRates(): Promise<Record<string, { passed: number; total: number; models: string[] }>> {
  const db = getDb();
  const snapshot = await db.collection(COLLECTION).get();
  const rates: Record<string, { passed: number; total: number; models: string[] }> = {};

  // Use best run per model
  const bestByModel = new Map<string, ScoreSubmission>();
  snapshot.forEach((doc) => {
    const s = doc.data() as ScoreSubmission;
    const existing = bestByModel.get(s.modelId);
    if (!existing || s.percentage > existing.percentage) {
      bestByModel.set(s.modelId, s);
    }
  });

  for (const [modelId, submission] of bestByModel) {
    if (!submission.challengeScores) continue;
    for (const cs of submission.challengeScores) {
      if (!rates[cs.challengeId]) {
        rates[cs.challengeId] = { passed: 0, total: 0, models: [] };
      }
      rates[cs.challengeId].total++;
      if (cs.correct) {
        rates[cs.challengeId].passed++;
        rates[cs.challengeId].models.push(modelId);
      }
    }
  }

  return rates;
}

/**
 * Get the best submission for a model (the one shown on leaderboard).
 */
export async function getBestModelScore(modelId: string): Promise<ScoreSubmission | null> {
  const scores = await getModelScores(modelId);
  if (scores.length === 0) return null;
  return scores.reduce((best, s) => s.percentage > best.percentage ? s : best);
}

/**
 * Get scenario-specific leaderboard.
 * Groups results that have scenario domains (esql, observability, security with skillsEnabled metadata).
 * Returns pairs: baseline (no skills) and skill-augmented per model.
 */
export interface ScenarioLeaderboardEntry extends LeaderboardEntry {
  baselinePercentage?: number;
  skillsPercentage?: number;
  skillUplift?: number;
}

export async function getScenarioLeaderboard(): Promise<ScenarioLeaderboardEntry[]> {
  const db = getDb();
  const snapshot = await db.collection(COLLECTION).get();

  const scores: ScoreSubmission[] = [];
  snapshot.forEach((doc) => {
    scores.push(doc.data() as ScoreSubmission);
  });

  // Filter to scenario submissions (those with esql domain scores or skillsEnabled field)
  const scenarioScores = scores.filter((s) =>
    s.skillsEnabled !== undefined ||
    s.backendType !== undefined ||
    s.domainScores.some((ds) => ds.domain === 'esql'),
  );

  // Group by modelId, separate by skillsEnabled
  const byModel = new Map<string, { baseline?: ScoreSubmission; withSkills?: ScoreSubmission; runCount: number }>();

  for (const score of scenarioScores) {
    const existing = byModel.get(score.modelId) ?? { runCount: 0 };
    existing.runCount++;

    if (score.skillsEnabled) {
      if (!existing.withSkills || score.percentage > existing.withSkills.percentage) {
        existing.withSkills = score;
      }
    } else {
      if (!existing.baseline || score.percentage > existing.baseline.percentage) {
        existing.baseline = score;
      }
    }

    byModel.set(score.modelId, existing);
  }

  const entries: ScenarioLeaderboardEntry[] = [];
  for (const [modelId, { baseline, withSkills, runCount }] of byModel) {
    const best = withSkills ?? baseline;
    if (!best) continue;

    const domainScores: Record<string, number> = {};
    for (const ds of best.domainScores) {
      domainScores[ds.domain] = ds.percentage;
    }

    entries.push({
      rank: 0,
      modelId,
      modelName: best.modelName,
      provider: best.provider,
      totalScore: best.totalScore,
      maxScore: best.maxPossibleScore,
      percentage: best.percentage,
      correct: best.correctChallenges,
      total: best.totalChallenges,
      avgLatencyMs: best.avgLatencyMs,
      domainScores,
      submittedAt: best.submittedAt ?? new Date().toISOString(),
      runCount,
      costUsd: best.costUsd,
      skillsEnabled: best.skillsEnabled,
      backendType: best.backendType,
      baselinePercentage: baseline?.percentage,
      skillsPercentage: withSkills?.percentage,
      skillUplift: baseline && withSkills
        ? withSkills.percentage - baseline.percentage
        : undefined,
    });
  }

  entries.sort((a, b) => b.percentage - a.percentage || a.avgLatencyMs - b.avgLatencyMs);
  entries.forEach((e, i) => (e.rank = i + 1));

  return entries;
}
