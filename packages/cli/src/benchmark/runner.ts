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
  Scenario,
  Domain,
  Difficulty,
  SearchResponse,
  EsqlResponse,
  ElasticBackend,
} from '../types';
import { SimulatedBackend } from '../elastic/simulated-backend';
import { RealBackend } from '../elastic/real-backend';
import { getAllChallenges } from '../challenges';
import { getAllScenarios } from '../scenarios';
import { loadSkill, formatSkillForPrompt } from '../skills';
import { fetchOpenRouterModels } from './openrouter';

const SYSTEM_PROMPT = `You are being evaluated on your ability to write Elasticsearch queries.

For each challenge, you'll receive:
- A description of what to search for
- The index name and its mapping
- Sample documents from the index

Respond with ONLY a valid JSON object — the body to send to the Elasticsearch _search API.
No markdown fences, no explanation, no commentary. Just the raw JSON object.

Example response:
{"query":{"match":{"title":"elasticsearch"}},"size":10}`;

const ESQL_SYSTEM_PROMPT = `You are being evaluated on your ability to write ES|QL (Elasticsearch Query Language) queries.

For each challenge, you'll receive:
- A description of what to query
- The index name and its mapping
- Sample documents from the index

Respond with ONLY a valid ES|QL query string — no markdown fences, no explanation, no commentary.
Just the raw ES|QL query starting with FROM (or TS for time series).

Example response:
FROM my-index | WHERE status == "active" | STATS count = COUNT(*) BY category | SORT count DESC | LIMIT 10`;

export class BenchmarkRunner {
  private model: ModelAdapter;
  private config: BenchmarkConfig;
  private backend: ElasticBackend;

  constructor(model: ModelAdapter, config: BenchmarkConfig, backend?: ElasticBackend) {
    this.model = model;
    this.config = config;

    if (backend) {
      this.backend = backend;
    } else if (config.backendMode === 'real' && config.esNode) {
      this.backend = new RealBackend({
        node: config.esNode,
        apiKey: config.esApiKey,
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

    return await this.buildResult(challengeScores);
  }

  /**
   * Run skill-aligned scenarios. Requires a real Elasticsearch backend.
   * Can be run with or without skill content injection.
   */
  async runScenarios(): Promise<BenchmarkResult> {
    if (this.backend.mode !== 'real' || !this.backend.esql) {
      throw new Error(
        'Scenarios require a real Elasticsearch backend with ES|QL support.\n' +
          'Use --start-local (Docker) or --real-es (Elastic Cloud).',
      );
    }

    let scenarios = getAllScenarios();

    // Filter by domain if specified
    if (this.config.domains && this.config.domains.length > 0) {
      scenarios = scenarios.filter((s) => this.config.domains!.includes(s.domain));
    }

    // Filter by difficulty if specified
    if (this.config.difficulties && this.config.difficulties.length > 0) {
      scenarios = scenarios.filter((s) =>
        this.config.difficulties!.includes(s.difficulty),
      );
    }

    const skillsLabel = this.config.skillsEnabled ? ' [+skills]' : ' [baseline]';
    const challengeScores: ChallengeScore[] = [];
    const total = scenarios.length;

    for (let i = 0; i < total; i++) {
      const scenario = scenarios[i];
      const progress = `[${i + 1}/${total}]`;
      process.stderr.write(
        `${progress}${skillsLabel} ${scenario.domain} | ${scenario.difficulty} | ${scenario.title}...`,
      );

      const score = await this.runScenario(scenario);
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

    const result = await this.buildResult(challengeScores);
    result.skillsEnabled = this.config.skillsEnabled;
    return result;
  }

  private async runScenario(scenario: Scenario): Promise<ChallengeScore> {
    // Set up the index with seed data
    await this.backend.reset();
    if (scenario.mapping) {
      await this.backend.createIndex(scenario.indexName, scenario.mapping);
    } else {
      await this.backend.createIndex(scenario.indexName);
    }
    if (scenario.seedData.length > 0) {
      await this.backend.bulkIndex(
        scenario.seedData.map((doc) => ({
          index: scenario.indexName,
          id: doc._id,
          doc: doc._source,
        })),
      );
    }
    if (scenario.pipeline) {
      await this.backend.putPipeline(
        `${scenario.id}-pipeline`,
        scenario.pipeline,
      );
    }

    let rawResponse = '';
    let latencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let error: string | null = null;

    try {
      // Multi-turn: discovery first, then query
      if (scenario.multiTurn && scenario.discoveryPrompt) {
        const discoveryResponse = await this.model.complete(
          scenario.discoveryPrompt +
            `\n\nINDEX: ${scenario.indexName}\n\nMAPPING:\n` +
            JSON.stringify(scenario.mapping ?? {}, null, 2) +
            `\n\nSAMPLE DOCUMENTS (first 2):\n` +
            scenario.seedData
              .slice(0, 2)
              .map((d) => JSON.stringify(d._source, null, 2))
              .join('\n'),
        );
        latencyMs += discoveryResponse.latencyMs;
        inputTokens += discoveryResponse.inputTokens ?? 0;
        outputTokens += discoveryResponse.outputTokens ?? 0;

        const queryPrompt =
          this.buildScenarioPrompt(scenario) +
          `\n\nYour earlier analysis of the data:\n${discoveryResponse.content}\n\n` +
          `Now respond with ONLY the ${scenario.responseFormat === 'esql' ? 'ES|QL query' : 'JSON query body'}:`;

        const response = await this.model.complete(queryPrompt);
        rawResponse = response.content;
        latencyMs += response.latencyMs;
        inputTokens += response.inputTokens ?? 0;
        outputTokens += response.outputTokens ?? 0;
      } else {
        const prompt = this.buildScenarioPrompt(scenario);
        const response = await this.model.complete(prompt);
        rawResponse = response.content;
        latencyMs = response.latencyMs;
        inputTokens = response.inputTokens ?? 0;
        outputTokens = response.outputTokens ?? 0;
      }

      // Execute based on response format
      let validationResponse: SearchResponse | EsqlResponse;
      let parsedContent: Record<string, unknown> | null = null;

      if (scenario.responseFormat === 'esql') {
        const esqlQuery = this.extractEsql(rawResponse);
        if (!esqlQuery) {
          return this.failScore(
            scenario,
            'Failed to extract ES|QL query from model response.',
            'ES|QL parse error',
            rawResponse,
            latencyMs,
            inputTokens,
            outputTokens,
          );
        }
        parsedContent = { query: esqlQuery };
        validationResponse = await this.backend.esql!(esqlQuery);
      } else {
        parsedContent = this.extractJson(rawResponse);
        if (!parsedContent) {
          return this.failScore(
            scenario,
            'Failed to parse JSON query from model response.',
            'JSON parse error',
            rawResponse,
            latencyMs,
            inputTokens,
            outputTokens,
          );
        }
        validationResponse = await this.backend.search(
          scenario.indexName,
          parsedContent,
        );
      }

      const validation = await scenario.validate(
        validationResponse,
        this.backend,
      );

      // Apply speed multiplier
      const speedMultiplier = this.getSpeedMultiplier(latencyMs);
      const adjustedScore = Math.min(
        validation.maxScore,
        Math.round(validation.score * speedMultiplier),
      );
      const speedNote =
        speedMultiplier > 1
          ? ` Speed bonus: x${speedMultiplier} (${latencyMs}ms).`
          : speedMultiplier < 1
            ? ` Speed penalty: x${speedMultiplier} (${latencyMs}ms).`
            : '';

      return {
        challengeId: scenario.id,
        domain: scenario.domain,
        difficulty: scenario.difficulty,
        title: scenario.title,
        score: adjustedScore,
        maxScore: validation.maxScore,
        correct: validation.correct,
        feedback: validation.feedback + speedNote,
        latencyMs,
        inputTokens,
        outputTokens,
        rawModelResponse: rawResponse,
        parsedQuery: parsedContent,
        error: null,
      };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      return {
        challengeId: scenario.id,
        domain: scenario.domain,
        difficulty: scenario.difficulty,
        title: scenario.title,
        score: 0,
        maxScore: scenario.maxScore,
        correct: false,
        feedback: `Error: ${error}`,
        latencyMs,
        inputTokens,
        outputTokens,
        rawModelResponse: rawResponse,
        parsedQuery: null,
        error,
      };
    }
  }

  private buildScenarioPrompt(scenario: Scenario): string {
    const isEsql = scenario.responseFormat === 'esql';
    const systemPrompt = isEsql ? ESQL_SYSTEM_PROMPT : SYSTEM_PROMPT;

    const sampleDocs = scenario.seedData
      .slice(0, 3)
      .map((d) => JSON.stringify(d._source, null, 2))
      .join('\n');

    const mappingStr = scenario.mapping
      ? JSON.stringify(scenario.mapping, null, 2)
      : 'No explicit mapping';

    let prompt = `${systemPrompt}

---

CHALLENGE: ${scenario.title}
DOMAIN: ${scenario.domain}
DIFFICULTY: ${scenario.difficulty}

DESCRIPTION:
${scenario.description}

INDEX: ${scenario.indexName}

MAPPING:
${mappingStr}

SAMPLE DOCUMENTS (first 3 of ${scenario.seedData.length}):
${sampleDocs}

HINTS:
${scenario.hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}`;

    // Inject skill content if enabled
    if (this.config.skillsEnabled) {
      const skill = loadSkill(scenario.skillId, {
        skillsPath: this.config.skillsPath,
        referencePaths: scenario.skillReferencePaths,
      });
      if (skill) {
        prompt += '\n\n' + formatSkillForPrompt(skill, {
          maxReferenceLength: 30000,
          includeReferences: true,
        });
      }
    }

    const responseInstruction = isEsql
      ? 'Respond with ONLY the ES|QL query string:'
      : 'Respond with ONLY the JSON query body for the _search API:';

    prompt += `\n\n${responseInstruction}`;
    return prompt;
  }

  /**
   * Extract an ES|QL query from model response.
   * Handles raw text, markdown code blocks, and backtick-wrapped queries.
   */
  private extractEsql(text: string): string | null {
    const trimmed = text.trim();

    // Try extracting from markdown code block (```esql or ```sql or ```)
    const codeBlockMatch = trimmed.match(
      /```(?:esql|sql|elasticsearch)?\s*\n?([\s\S]*?)\n?```/,
    );
    if (codeBlockMatch) {
      const query = codeBlockMatch[1].trim();
      if (query.startsWith('FROM') || query.startsWith('TS')) return query;
    }

    // Try the raw text — if it starts with FROM or TS, use it directly
    if (trimmed.startsWith('FROM') || trimmed.startsWith('TS')) {
      // Remove any trailing explanation after the query
      // ES|QL queries end when there's a blank line or non-pipe continuation
      const lines = trimmed.split('\n');
      const queryLines: string[] = [];
      for (const line of lines) {
        const t = line.trim();
        if (
          queryLines.length === 0 &&
          (t.startsWith('FROM') || t.startsWith('TS'))
        ) {
          queryLines.push(t);
        } else if (queryLines.length > 0 && (t.startsWith('|') || t === '')) {
          if (t !== '') queryLines.push(t);
        } else if (queryLines.length > 0 && !t.startsWith('|')) {
          break;
        }
      }
      if (queryLines.length > 0) return queryLines.join(' ');
    }

    // Try finding FROM ... pattern anywhere in the text
    const fromMatch = trimmed.match(/(?:FROM|TS)\s+[\w*.-]+[\s\S]*?(?:LIMIT\s+\d+|$)/i);
    if (fromMatch) {
      return fromMatch[0].trim();
    }

    return null;
  }

  private failScore(
    scenario: Scenario,
    feedback: string,
    error: string,
    rawResponse: string,
    latencyMs: number,
    inputTokens: number,
    outputTokens: number,
  ): ChallengeScore {
    return {
      challengeId: scenario.id,
      domain: scenario.domain,
      difficulty: scenario.difficulty,
      title: scenario.title,
      score: 0,
      maxScore: scenario.maxScore,
      correct: false,
      feedback,
      latencyMs,
      inputTokens,
      outputTokens,
      rawModelResponse: rawResponse,
      parsedQuery: null,
      error,
    };
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

    let rawResponse = '';
    let parsedQuery: Record<string, unknown> | null = null;
    let latencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let error: string | null = null;

    try {
      // Multi-turn: first let the model explore, then ask for the query
      if (challenge.multiTurn && challenge.discoveryPrompt) {
        const discoveryResponse = await this.model.complete(
          challenge.discoveryPrompt + `\n\nINDEX: ${challenge.indexName}\n\nMAPPING:\n${JSON.stringify(challenge.mapping ?? {}, null, 2)}\n\nSAMPLE DOCUMENTS (first 2):\n${challenge.seedData.slice(0, 2).map((d) => JSON.stringify(d._source, null, 2)).join('\n')}`,
        );
        latencyMs += discoveryResponse.latencyMs;
        inputTokens += discoveryResponse.inputTokens ?? 0;
        outputTokens += discoveryResponse.outputTokens ?? 0;

        // Now build the actual query prompt with the discovery context
        const queryPrompt = this.buildPrompt(challenge) +
          `\n\nYour earlier analysis of the data:\n${discoveryResponse.content}\n\nNow respond with ONLY the JSON query body:`;

        const response = await this.model.complete(queryPrompt);
        rawResponse = response.content;
        latencyMs += response.latencyMs;
        inputTokens += response.inputTokens ?? 0;
        outputTokens += response.outputTokens ?? 0;
      } else {
        // Standard single-turn
        const prompt = this.buildPrompt(challenge);
        const response = await this.model.complete(prompt);
        rawResponse = response.content;
        latencyMs = response.latencyMs;
        inputTokens = response.inputTokens ?? 0;
        outputTokens = response.outputTokens ?? 0;
      }

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

  private async buildResult(scores: ChallengeScore[]): Promise<BenchmarkResult> {
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

    const totalInputTokens = scores.reduce((sum, s) => sum + s.inputTokens, 0);
    const totalOutputTokens = scores.reduce((sum, s) => sum + s.outputTokens, 0);

    // Compute cost for OpenRouter models
    let costUsd: number | undefined;
    if (this.config.modelId.startsWith('openrouter:')) {
      const orModelId = this.config.modelId.replace('openrouter:', '');
      costUsd = await this.computeCost(orModelId, totalInputTokens, totalOutputTokens);
    }

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
      totalInputTokens,
      totalOutputTokens,
      costUsd,
      domainScores,
      difficultyScores,
      challengeScores: scores,
      skillsEnabled: this.config.skillsEnabled,
    };
  }

  private async computeCost(
    orModelId: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<number | undefined> {
    try {
      const models = await fetchOpenRouterModels();
      const model = models.find((m) => m.id === orModelId);
      if (!model) return undefined;
      const promptPrice = parseFloat(model.pricing.prompt);
      const completionPrice = parseFloat(model.pricing.completion);
      const cost = inputTokens * promptPrice + outputTokens * completionPrice;
      return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places
    } catch {
      return undefined;
    }
  }
}
