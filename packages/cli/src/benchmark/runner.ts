import type {
  ModelAdapter,
  BenchmarkConfig,
  BenchmarkResult,
  ChallengeScore,
  DomainScore,
  DifficultyScore,
} from './types';
import type {
  Challenge,
  Domain,
  Difficulty,
  SearchResponse,
  ElasticBackend,
} from '../types';
import { SimulatedBackend } from '../elastic/simulated-backend';
import { RealBackend } from '../elastic/real-backend';
import { getAllChallenges } from '../challenges';

const SYSTEM_PROMPT = `You are being evaluated on your ability to write Elasticsearch queries.

For each challenge, you'll receive:
- A description of what to search for
- The index name and its mapping
- Sample documents from the index

Respond with ONLY a valid JSON object — the body to send to the Elasticsearch _search API.
No markdown fences, no explanation, no commentary. Just the raw JSON object.

Example response:
{"query":{"match":{"title":"elasticsearch"}},"size":10}`;

export class BenchmarkRunner {
  private model: ModelAdapter;
  private config: BenchmarkConfig;
  private backend: ElasticBackend;

  constructor(model: ModelAdapter, config: BenchmarkConfig) {
    this.model = model;
    this.config = config;

    if (config.backendMode === 'real' && config.esNode) {
      this.backend = new RealBackend({
        node: config.esNode,
        username: config.esUsername,
        password: config.esPassword,
      });
    } else {
      this.backend = new SimulatedBackend();
    }
  }

  async run(): Promise<BenchmarkResult> {
    let challenges = getAllChallenges();

    // Filter by domain if specified
    if (this.config.domains && this.config.domains.length > 0) {
      challenges = challenges.filter((c) => this.config.domains!.includes(c.domain));
    }

    // Filter by difficulty if specified
    if (this.config.difficulties && this.config.difficulties.length > 0) {
      challenges = challenges.filter((c) => this.config.difficulties!.includes(c.difficulty));
    }

    const challengeScores: ChallengeScore[] = [];
    const total = challenges.length;

    for (let i = 0; i < total; i++) {
      const challenge = challenges[i];
      const progress = `[${i + 1}/${total}]`;
      process.stderr.write(
        `${progress} ${challenge.domain} | ${challenge.difficulty} | ${challenge.title}...`,
      );

      const score = await this.runChallenge(challenge);
      challengeScores.push(score);

      const mark = score.correct ? 'PASS' : 'FAIL';
      process.stderr.write(
        ` ${mark} ${score.score}/${score.maxScore} (${score.latencyMs}ms)\n`,
      );

      if (this.config.verbose && !score.correct) {
        process.stderr.write(`  Feedback: ${score.feedback}\n`);
        if (score.error) process.stderr.write(`  Error: ${score.error}\n`);
      }
    }

    return this.buildResult(challengeScores);
  }

  private async runChallenge(challenge: Challenge): Promise<ChallengeScore> {
    // Set up the index with seed data
    await this.backend.reset();
    if (challenge.mapping) {
      await this.backend.createIndex(challenge.indexName, challenge.mapping);
    } else {
      await this.backend.createIndex(challenge.indexName);
    }
    if (challenge.seedData.length > 0) {
      await this.backend.bulkIndex(
        challenge.seedData.map((doc) => ({
          index: challenge.indexName,
          id: doc._id,
          doc: doc._source,
        })),
      );
    }
    if (challenge.pipeline) {
      await this.backend.putPipeline(`${challenge.id}-pipeline`, challenge.pipeline);
    }

    // Build prompt for the model
    const prompt = this.buildPrompt(challenge);

    let rawResponse = '';
    let parsedQuery: Record<string, unknown> | null = null;
    let latencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let error: string | null = null;

    try {
      const response = await this.model.complete(prompt);
      rawResponse = response.content;
      latencyMs = response.latencyMs;
      inputTokens = response.inputTokens ?? 0;
      outputTokens = response.outputTokens ?? 0;

      // Parse the query from model response
      parsedQuery = this.extractJson(rawResponse);

      if (!parsedQuery) {
        return {
          challengeId: challenge.id,
          domain: challenge.domain,
          difficulty: challenge.difficulty,
          title: challenge.title,
          score: 0,
          maxScore: challenge.maxScore,
          correct: false,
          feedback: 'Failed to parse JSON query from model response.',
          latencyMs,
          inputTokens,
          outputTokens,
          rawModelResponse: rawResponse,
          parsedQuery: null,
          error: 'JSON parse error',
        };
      }

      // Execute the query and validate
      const searchResponse: SearchResponse = await this.backend.search(
        challenge.indexName,
        parsedQuery,
      );
      const validation = await challenge.validate(searchResponse, this.backend);

      // Apply speed multiplier to the score
      const speedMultiplier = this.getSpeedMultiplier(latencyMs);
      const adjustedScore = Math.min(
        validation.maxScore,
        Math.round(validation.score * speedMultiplier),
      );
      const speedNote = speedMultiplier > 1
        ? ` Speed bonus: x${speedMultiplier} (${latencyMs}ms).`
        : speedMultiplier < 1
          ? ` Speed penalty: x${speedMultiplier} (${latencyMs}ms).`
          : '';

      return {
        challengeId: challenge.id,
        domain: challenge.domain,
        difficulty: challenge.difficulty,
        title: challenge.title,
        score: adjustedScore,
        maxScore: validation.maxScore,
        correct: validation.correct,
        feedback: validation.feedback + speedNote,
        latencyMs,
        inputTokens,
        outputTokens,
        rawModelResponse: rawResponse,
        parsedQuery,
        error: null,
      };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      return {
        challengeId: challenge.id,
        domain: challenge.domain,
        difficulty: challenge.difficulty,
        title: challenge.title,
        score: 0,
        maxScore: challenge.maxScore,
        correct: false,
        feedback: `Error: ${error}`,
        latencyMs,
        inputTokens,
        outputTokens,
        rawModelResponse: rawResponse,
        parsedQuery,
        error,
      };
    }
  }

  /**
   * Speed multiplier for scoring.
   * Rewards fast responses, penalizes very slow ones.
   *
   *   < 2s  -> 1.15x (15% bonus)
   *   2-5s  -> 1.00x (neutral)
   *   5-10s -> 0.95x (5% penalty)
   *   10-30s -> 0.90x (10% penalty)
   *   > 30s -> 0.80x (20% penalty)
   */
  private getSpeedMultiplier(latencyMs: number): number {
    if (latencyMs < 2000) return 1.15;
    if (latencyMs < 5000) return 1.0;
    if (latencyMs < 10000) return 0.95;
    if (latencyMs < 30000) return 0.90;
    return 0.80;
  }

  private buildPrompt(challenge: Challenge): string {
    const sampleDocs = challenge.seedData
      .slice(0, 3)
      .map((d) => JSON.stringify(d._source, null, 2))
      .join('\n');

    const mappingStr = challenge.mapping
      ? JSON.stringify(challenge.mapping, null, 2)
      : 'No explicit mapping';

    return `${SYSTEM_PROMPT}

---

CHALLENGE: ${challenge.title}
DOMAIN: ${challenge.domain}
DIFFICULTY: ${challenge.difficulty}

DESCRIPTION:
${challenge.description}

INDEX: ${challenge.indexName}

MAPPING:
${mappingStr}

SAMPLE DOCUMENTS (first 3 of ${challenge.seedData.length}):
${sampleDocs}

HINTS:
${challenge.hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}

Respond with ONLY the JSON query body for the _search API:`;
  }

  private extractJson(text: string): Record<string, unknown> | null {
    // Try direct parse first
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      // Continue to try extracting JSON
    }

    // Try extracting from markdown code block
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // Continue
      }
    }

    // Try finding first { ... } block
    const braceMatch = trimmed.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        // Give up
      }
    }

    return null;
  }

  private buildResult(scores: ChallengeScore[]): BenchmarkResult {
    const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
    const maxPossibleScore = scores.reduce((sum, s) => sum + s.maxScore, 0);
    const correctChallenges = scores.filter((s) => s.correct).length;
    const avgLatencyMs =
      scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s.latencyMs, 0) / scores.length)
        : 0;

    // Domain breakdown
    const domainMap = new Map<Domain, ChallengeScore[]>();
    for (const s of scores) {
      const arr = domainMap.get(s.domain) ?? [];
      arr.push(s);
      domainMap.set(s.domain, arr);
    }
    const domainScores: DomainScore[] = Array.from(domainMap.entries()).map(
      ([domain, ds]) => {
        const dscore = ds.reduce((sum, s) => sum + s.score, 0);
        const dmax = ds.reduce((sum, s) => sum + s.maxScore, 0);
        return {
          domain,
          score: dscore,
          maxScore: dmax,
          percentage: dmax > 0 ? Math.round((dscore / dmax) * 100) : 0,
          challengeCount: ds.length,
          correctCount: ds.filter((s) => s.correct).length,
        };
      },
    );

    // Difficulty breakdown
    const diffMap = new Map<Difficulty, ChallengeScore[]>();
    for (const s of scores) {
      const arr = diffMap.get(s.difficulty) ?? [];
      arr.push(s);
      diffMap.set(s.difficulty, arr);
    }
    const difficultyScores: DifficultyScore[] = Array.from(diffMap.entries()).map(
      ([difficulty, ds]) => {
        const dscore = ds.reduce((sum, s) => sum + s.score, 0);
        const dmax = ds.reduce((sum, s) => sum + s.maxScore, 0);
        return {
          difficulty,
          score: dscore,
          maxScore: dmax,
          percentage: dmax > 0 ? Math.round((dscore / dmax) * 100) : 0,
          challengeCount: ds.length,
          correctCount: ds.filter((s) => s.correct).length,
        };
      },
    );

    return {
      modelId: this.config.modelId,
      modelName: this.model.name,
      provider: this.model.provider,
      timestamp: Date.now(),
      totalScore,
      maxPossibleScore,
      percentage: maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0,
      totalChallenges: scores.length,
      correctChallenges,
      avgLatencyMs,
      totalInputTokens: scores.reduce((sum, s) => sum + s.inputTokens, 0),
      totalOutputTokens: scores.reduce((sum, s) => sum + s.outputTokens, 0),
      domainScores,
      difficultyScores,
      challengeScores: scores,
    };
  }
}
