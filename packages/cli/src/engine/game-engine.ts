import type {
  Challenge,
  ChallengeResult,
  ElasticBackend,
  LeaderboardEntry,
  SearchResponse,
  ValidationResult,
} from '../types';

export class GameEngine {
  private backend: ElasticBackend;
  private challenges: Challenge[];
  private results: Map<string, ChallengeResult[]> = new Map();
  private currentChallengeIdx = 0;

  constructor(backend: ElasticBackend, challenges: Challenge[]) {
    this.backend = backend;
    this.challenges = challenges;
  }

  getBackend(): ElasticBackend {
    return this.backend;
  }

  getTotalChallenges(): number {
    return this.challenges.length;
  }

  getCurrentChallengeIndex(): number {
    return this.currentChallengeIdx;
  }

  isGameOver(): boolean {
    return this.currentChallengeIdx >= this.challenges.length;
  }

  async setupChallenge(): Promise<Challenge | null> {
    if (this.isGameOver()) return null;

    const challenge = this.challenges[this.currentChallengeIdx];
    await this.backend.reset();

    // Create index with mapping
    if (challenge.mapping) {
      await this.backend.createIndex(challenge.indexName, challenge.mapping);
    } else {
      await this.backend.createIndex(challenge.indexName);
    }

    // Seed data
    if (challenge.seedData.length > 0) {
      await this.backend.bulkIndex(
        challenge.seedData.map((doc) => ({
          index: challenge.indexName,
          id: doc._id,
          doc: doc._source,
        })),
      );
    }

    // Set up pipeline if needed
    if (challenge.pipeline) {
      await this.backend.putPipeline(`${challenge.id}-pipeline`, challenge.pipeline);
    }

    return challenge;
  }

  async submitAnswer(
    agentId: string,
    challengeId: string,
    query: Record<string, unknown>,
    startTime: number,
  ): Promise<ChallengeResult> {
    const challenge = this.challenges.find((c) => c.id === challengeId);
    if (!challenge) {
      throw new Error(`Challenge '${challengeId}' not found`);
    }

    const timeMs = Date.now() - startTime;
    let validation: ValidationResult;

    try {
      // Execute the agent's query
      const response: SearchResponse = await this.backend.search(challenge.indexName, query);

      // Validate the response
      validation = await challenge.validate(response, this.backend);

      // Time bonus: faster answers get bonus points (up to 20% of max score)
      if (validation.correct && timeMs < challenge.timeLimitMs) {
        const timeRatio = 1 - timeMs / challenge.timeLimitMs;
        const timeBonus = Math.floor(challenge.maxScore * 0.2 * timeRatio);
        validation.score = Math.min(validation.score + timeBonus, challenge.maxScore);
        validation.feedback += ` Time bonus: +${timeBonus} points.`;
      }

      // Penalty for exceeding time limit
      if (timeMs > challenge.timeLimitMs) {
        const penalty = Math.floor(validation.score * 0.3);
        validation.score = Math.max(0, validation.score - penalty);
        validation.feedback += ` Time penalty: -${penalty} points (exceeded time limit).`;
      }
    } catch (error) {
      validation = {
        correct: false,
        score: 0,
        maxScore: challenge.maxScore,
        feedback: `Query execution error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const result: ChallengeResult = {
      challengeId,
      agentId,
      correct: validation.correct,
      score: validation.score,
      maxScore: validation.maxScore,
      timeMs,
      feedback: validation.feedback,
      timestamp: Date.now(),
    };

    // Store result
    const agentResults = this.results.get(agentId) ?? [];
    agentResults.push(result);
    this.results.set(agentId, agentResults);

    this.currentChallengeIdx++;

    return result;
  }

  skipChallenge(agentId: string, challengeId: string): ChallengeResult {
    const challenge = this.challenges.find((c) => c.id === challengeId);
    const result: ChallengeResult = {
      challengeId,
      agentId,
      correct: false,
      score: 0,
      maxScore: challenge?.maxScore ?? 100,
      timeMs: 0,
      feedback: 'Challenge skipped.',
      timestamp: Date.now(),
    };

    const agentResults = this.results.get(agentId) ?? [];
    agentResults.push(result);
    this.results.set(agentId, agentResults);

    this.currentChallengeIdx++;
    return result;
  }

  getTotalScore(agentId: string): number {
    const agentResults = this.results.get(agentId) ?? [];
    return agentResults.reduce((sum, r) => sum + r.score, 0);
  }

  getMaxPossibleScore(): number {
    return this.challenges.reduce((sum, c) => sum + c.maxScore, 0);
  }

  getResults(agentId: string): ChallengeResult[] {
    return this.results.get(agentId) ?? [];
  }

  getLeaderboard(): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [];

    for (const [agentId, results] of this.results) {
      entries.push({
        agentId,
        agentName: agentId, // Will be updated with actual name
        totalScore: results.reduce((sum, r) => sum + r.score, 0),
        challengesCompleted: results.length,
        challengesCorrect: results.filter((r) => r.correct).length,
        averageTimeMs: results.length > 0
          ? results.reduce((sum, r) => sum + r.timeMs, 0) / results.length
          : 0,
        timestamp: Date.now(),
      });
    }

    entries.sort((a, b) => b.totalScore - a.totalScore);
    return entries;
  }

  getRank(agentId: string): number {
    const leaderboard = this.getLeaderboard();
    const idx = leaderboard.findIndex((e) => e.agentId === agentId);
    return idx + 1;
  }
}
