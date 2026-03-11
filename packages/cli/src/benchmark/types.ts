import type { Domain, Difficulty } from '../types';

// --- Model Adapter ---

export interface ModelAdapter {
  name: string;        // e.g. "gpt-4o", "claude-sonnet-4"
  provider: string;    // e.g. "openai", "anthropic", "ollama"

  /**
   * Send a prompt to the model and get a response.
   * The prompt contains the challenge description and context.
   * The model should return a JSON Elasticsearch query.
   */
  complete(prompt: string): Promise<ModelResponse>;
}

export interface ModelResponse {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

// --- Benchmark Results ---

export interface BenchmarkConfig {
  modelId: string;           // e.g. "openai:gpt-4o"
  runs?: number;             // number of runs to average (default 1)
  domains?: Domain[];        // filter to specific domains
  difficulties?: Difficulty[]; // filter to specific difficulties
  verbose?: boolean;
  backendMode?: 'simulated' | 'real'; // default: simulated
  esNode?: string;           // ES URL for real mode
  esUsername?: string;       // ES username
  esPassword?: string;       // ES password
}

export interface ChallengeScore {
  challengeId: string;
  domain: Domain;
  difficulty: Difficulty;
  title: string;
  score: number;
  maxScore: number;
  correct: boolean;
  feedback: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  rawModelResponse: string;
  parsedQuery: Record<string, unknown> | null;
  error: string | null;
}

export interface DomainScore {
  domain: Domain;
  score: number;
  maxScore: number;
  percentage: number;
  challengeCount: number;
  correctCount: number;
}

export interface DifficultyScore {
  difficulty: Difficulty;
  score: number;
  maxScore: number;
  percentage: number;
  challengeCount: number;
  correctCount: number;
}

export interface BenchmarkResult {
  modelId: string;
  modelName: string;
  provider: string;
  timestamp: number;
  totalScore: number;
  maxPossibleScore: number;
  percentage: number;
  totalChallenges: number;
  correctChallenges: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  costUsd?: number;
  domainScores: DomainScore[];
  difficultyScores: DifficultyScore[];
  challengeScores: ChallengeScore[];
}

export interface LeaderboardRow {
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
  timestamp: number;
  domainScores: Record<string, number>; // domain -> percentage
}
