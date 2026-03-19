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
  esApiKey?: string;         // ES API key for real mode
  esUsername?: string;       // ES username
  esPassword?: string;       // ES password

  // Scenario mode (skill-aligned challenges)
  scenarioMode?: boolean;    // run scenarios instead of (or alongside) challenges
  skillsEnabled?: boolean;   // inject skill content into prompts
  skillsPath?: string;       // path to agent-skills repo or installation
  compareSkills?: boolean;   // run both with and without skills for comparison

  // License
  licenseLevel?: string;     // current ES license level (basic/gold/platinum/enterprise/trial)
}

/** A single step in the evaluation pipeline — tracks what happened and why. */
export interface EvalStep {
  /** Step name: setup, prompt, model_call, parse, execute, validate, speed_adjust */
  name: string;
  /** Human-readable description of what happened */
  description: string;
  /** Step outcome */
  status: 'success' | 'failure' | 'skipped';
  /** Time taken for this step (ms) */
  durationMs?: number;
  /** Key data produced or consumed at this step */
  detail?: string;
  /** For failures: what went wrong */
  error?: string;
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
  /** Step-by-step trace of the evaluation pipeline */
  evalSteps?: EvalStep[];
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

  // Scenario-specific fields
  skillsEnabled?: boolean;   // whether skills were injected into prompts
  backendType?: 'simulated' | 'cloud' | 'start-local';

  // Consistency measurement (multi-run)
  runIndex?: number;         // which run this is (1-indexed)
  totalRuns?: number;        // how many runs were configured
  consistency?: ConsistencyMetrics;
}

/** Per-challenge consistency metrics across multiple runs. */
export interface ConsistencyScore {
  challengeId: string;
  title: string;
  scores: number[];          // score from each run
  steps: number[];           // step count from each run
  latencies: number[];       // model call latency from each run
  passedRuns: number;        // how many runs passed
  totalRuns: number;
  scoreVariance: number;     // variance in scores (0 = perfectly consistent)
  stepVariance: number;      // variance in step count
  latencyVariance: number;   // variance in latency
  isConsistent: boolean;     // same pass/fail result every run
}

/** Aggregate consistency metrics for the entire benchmark. */
export interface ConsistencyMetrics {
  totalRuns: number;
  avgScoreVariance: number;          // mean variance across challenges
  avgStepVariance: number;
  avgLatencyVariance: number;
  fullyConsistentChallenges: number; // same result every run
  inconsistentChallenges: number;    // different results across runs
  consistencyPercentage: number;     // % of challenges that are fully consistent
  perChallenge: ConsistencyScore[];
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
