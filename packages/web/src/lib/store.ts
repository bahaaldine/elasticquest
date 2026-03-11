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
  submittedAt?: string;
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
}

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
 * Get the best submission for a model (the one shown on leaderboard).
 */
export async function getBestModelScore(modelId: string): Promise<ScoreSubmission | null> {
  const scores = await getModelScores(modelId);
  if (scores.length === 0) return null;
  return scores.reduce((best, s) => s.percentage > best.percentage ? s : best);
}
