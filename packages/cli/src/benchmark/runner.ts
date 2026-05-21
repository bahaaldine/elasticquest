import type {
  ModelAdapter,
  BenchmarkConfig,
  BenchmarkResult,
  ChallengeScore,
  EvalStep,
  DomainScore,
  DifficultyScore,
  ConsistencyMetrics,
  ConsistencyScore,
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
import { meetsLicenseLevel } from '../elastic/license';
import { getAllChallenges } from '../challenges';
import { getAllScenarios } from '../scenarios';
import { loadSkill, formatSkillForPrompt } from '../skills';
import { fetchOpenRouterModels } from './openrouter';
import * as fs from 'fs';
import * as path from 'path';

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

ES|QL is a piped query language — NOT JSON Query DSL. It uses pipes (|) to chain commands.

For each challenge, you'll receive:
- A description of what to query
- The index name and its mapping
- Sample documents from the index

Respond with ONLY a valid ES|QL query string — no markdown fences, no explanation, no commentary.
Just the raw ES|QL query starting with FROM (or TS for time series). Output exactly ONE query.

Example response:
FROM my-index | WHERE status == "active" | STATS count = COUNT(*) BY category | SORT count DESC | LIMIT 10`;

export class BenchmarkRunner {
  private model: ModelAdapter;
  private config: BenchmarkConfig;
  private backend: ElasticBackend;
  private skillContext: string | null;

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

    this.skillContext = null;
    if (config.skillContextPath) {
      this.skillContext = this.loadSkillContext(config.skillContextPath);
    }
  }

  private loadSkillContext(skillPath: string): string {
    const parts: string[] = [];
    const mainContent = fs.readFileSync(skillPath, 'utf-8');
    parts.push(mainContent);

    const refsDir = path.join(path.dirname(skillPath), 'references');
    if (fs.existsSync(refsDir)) {
      const refFiles = fs.readdirSync(refsDir).filter((f) => f.endsWith('.md')).sort();
      for (const refFile of refFiles) {
        const refContent = fs.readFileSync(path.join(refsDir, refFile), 'utf-8');
        parts.push(`\n--- Reference: ${refFile} ---\n${refContent}`);
      }
    }

    return parts.join('\n');
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
    if (this.backend.mode !== 'real') {
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

    // Filter by license level — skip scenarios that require higher license
    const currentLicense = this.config.licenseLevel ?? 'basic';
    const beforeLicenseFilter = scenarios.length;
    scenarios = scenarios.filter((s) => {
      const required = s.requiredLicense ?? 'basic';
      return meetsLicenseLevel(currentLicense, required);
    });
    const skippedByLicense = beforeLicenseFilter - scenarios.length;
    if (skippedByLicense > 0) {
      process.stderr.write(
        `  Skipping ${skippedByLicense} scenario(s) that require a higher license ` +
          `(current: ${currentLicense}). Use --license-file or --start-trial.\n\n`,
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

  /**
   * Run scenarios multiple times to measure consistency.
   * Returns the best result with consistency metrics attached.
   */
  async runScenariosWithConsistency(runs: number): Promise<BenchmarkResult> {
    const allResults: BenchmarkResult[] = [];

    for (let run = 1; run <= runs; run++) {
      const label = this.config.skillsEnabled ? '[+skills]' : '[baseline]';
      process.stderr.write(`\n  ─── Run ${run}/${runs} ${label} ───\n\n`);
      const result = await this.runScenarios();
      result.runIndex = run;
      result.totalRuns = runs;
      allResults.push(result);
    }

    // Compute consistency metrics across runs
    const consistency = this.computeConsistency(allResults);

    // Use the best result as the primary
    const best = allResults.reduce((a, b) =>
      a.percentage > b.percentage ? a : b,
    );
    best.consistency = consistency;
    best.totalRuns = runs;

    // Print consistency summary
    process.stderr.write(`\n${'─'.repeat(50)}\n`);
    process.stderr.write(`  Consistency (${runs} runs):\n`);
    process.stderr.write(`  Fully consistent: ${consistency.fullyConsistentChallenges}/${consistency.perChallenge.length} challenges (${consistency.consistencyPercentage}%)\n`);
    process.stderr.write(`  Avg score variance: ${consistency.avgScoreVariance.toFixed(1)}\n`);
    process.stderr.write(`  Avg step variance: ${consistency.avgStepVariance.toFixed(1)}\n`);
    process.stderr.write(`  Avg latency variance: ${consistency.avgLatencyVariance.toFixed(0)}ms\n`);

    // Show inconsistent challenges
    const inconsistent = consistency.perChallenge.filter((c) => !c.isConsistent);
    if (inconsistent.length > 0) {
      process.stderr.write(`\n  Inconsistent challenges:\n`);
      for (const c of inconsistent) {
        process.stderr.write(
          `    ${c.challengeId}: passed ${c.passedRuns}/${c.totalRuns} runs, ` +
            `scores [${c.scores.join(',')}], steps [${c.steps.join(',')}]\n`,
        );
      }
    }
    process.stderr.write(`${'─'.repeat(50)}\n`);

    return best;
  }

  private computeConsistency(results: BenchmarkResult[]): ConsistencyMetrics {
    const challengeIds = results[0].challengeScores.map((cs) => cs.challengeId);
    const perChallenge: ConsistencyScore[] = [];

    for (const cid of challengeIds) {
      const scores: number[] = [];
      const steps: number[] = [];
      const latencies: number[] = [];
      let passedRuns = 0;

      for (const result of results) {
        const cs = result.challengeScores.find((c) => c.challengeId === cid);
        if (!cs) continue;
        scores.push(cs.score);
        steps.push(cs.evalSteps?.length ?? 0);
        latencies.push(cs.latencyMs);
        if (cs.correct) passedRuns++;
      }

      const title = results[0].challengeScores.find((c) => c.challengeId === cid)?.title ?? cid;
      const isConsistent = passedRuns === 0 || passedRuns === results.length;

      perChallenge.push({
        challengeId: cid,
        title,
        scores,
        steps,
        latencies,
        passedRuns,
        totalRuns: results.length,
        scoreVariance: this.variance(scores),
        stepVariance: this.variance(steps),
        latencyVariance: this.variance(latencies),
        isConsistent,
      });
    }

    const fullyConsistent = perChallenge.filter((c) => c.isConsistent).length;

    return {
      totalRuns: results.length,
      avgScoreVariance: perChallenge.length > 0
        ? perChallenge.reduce((s, c) => s + c.scoreVariance, 0) / perChallenge.length
        : 0,
      avgStepVariance: perChallenge.length > 0
        ? perChallenge.reduce((s, c) => s + c.stepVariance, 0) / perChallenge.length
        : 0,
      avgLatencyVariance: perChallenge.length > 0
        ? perChallenge.reduce((s, c) => s + c.latencyVariance, 0) / perChallenge.length
        : 0,
      fullyConsistentChallenges: fullyConsistent,
      inconsistentChallenges: perChallenge.length - fullyConsistent,
      consistencyPercentage: perChallenge.length > 0
        ? Math.round((fullyConsistent / perChallenge.length) * 100)
        : 100,
      perChallenge,
    };
  }

  private variance(values: number[]): number {
    if (values.length <= 1) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  }

  private async runScenario(scenario: Scenario): Promise<ChallengeScore> {
    const steps: EvalStep[] = [];

    // Step 1: Setup
    const setupStart = Date.now();
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
      await this.backend.putPipeline(`${scenario.id}-pipeline`, scenario.pipeline);
    }
    steps.push({
      name: 'setup',
      description: `Index "${scenario.indexName}" created with ${scenario.seedData.length} docs`,
      status: 'success',
      durationMs: Date.now() - setupStart,
    });

    let rawResponse = '';
    let latencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let error: string | null = null;

    try {
      // Step 2: Model call(s)
      if (scenario.multiTurn && scenario.discoveryPrompt) {
        const discoveryResponse = await this.model.complete(
          scenario.discoveryPrompt +
            `\n\nINDEX: ${scenario.indexName}\n\nMAPPING:\n` +
            JSON.stringify(scenario.mapping ?? {}, null, 2) +
            `\n\nSAMPLE DOCUMENTS (first 2):\n` +
            scenario.seedData.slice(0, 2).map((d) => JSON.stringify(d._source, null, 2)).join('\n'),
        );
        latencyMs += discoveryResponse.latencyMs;
        inputTokens += discoveryResponse.inputTokens ?? 0;
        outputTokens += discoveryResponse.outputTokens ?? 0;
        steps.push({
          name: 'discovery_call',
          description: 'Multi-turn discovery: model analyzed schema and data',
          status: 'success',
          durationMs: discoveryResponse.latencyMs,
          detail: `${discoveryResponse.inputTokens ?? 0} in / ${discoveryResponse.outputTokens ?? 0} out tokens`,
        });

        const queryPrompt = this.buildScenarioPrompt(scenario) +
          `\n\nYour earlier analysis of the data:\n${discoveryResponse.content}\n\n` +
          `Now respond with ONLY the ${scenario.responseFormat === 'esql' ? 'ES|QL query' : 'JSON query body'}:`;
        const response = await this.model.complete(queryPrompt);
        rawResponse = response.content;
        latencyMs += response.latencyMs;
        inputTokens += response.inputTokens ?? 0;
        outputTokens += response.outputTokens ?? 0;
        steps.push({
          name: 'model_call',
          description: 'Model generated query using discovery context',
          status: 'success',
          durationMs: response.latencyMs,
          detail: `${response.inputTokens ?? 0} in / ${response.outputTokens ?? 0} out tokens`,
        });
      } else {
        const prompt = this.buildScenarioPrompt(scenario);
        const skillNote = this.config.skillsEnabled ? ' (with skill injected)' : '';
        steps.push({
          name: 'prompt',
          description: `Prompt built for ${scenario.responseFormat} response${skillNote}`,
          status: 'success',
          detail: `${prompt.length} chars`,
        });

        const response = await this.model.complete(prompt);
        rawResponse = response.content;
        latencyMs = response.latencyMs;
        inputTokens = response.inputTokens ?? 0;
        outputTokens = response.outputTokens ?? 0;
        steps.push({
          name: 'model_call',
          description: `Model responded in ${response.latencyMs}ms`,
          status: 'success',
          durationMs: response.latencyMs,
          detail: `${inputTokens} in / ${outputTokens} out tokens`,
        });
      }

      // Step 3: Parse
      let validationResponse: SearchResponse | EsqlResponse;
      let parsedContent: Record<string, unknown> | null = null;

      if (scenario.responseFormat === 'esql') {
        const esqlQuery = this.extractEsql(rawResponse);
        if (!esqlQuery) {
          const parseExplanation = this.classifyError('esql parse error', rawResponse, scenario);
          steps.push({
            name: 'parse',
            description: parseExplanation,
            status: 'failure',
            error: 'Could not find a valid ES|QL query (expected FROM ...)',
            detail: rawResponse.slice(0, 200),
          });
          return this.failScore(scenario, 'Failed to extract ES|QL query from model response.', 'ES|QL parse error', rawResponse, latencyMs, inputTokens, outputTokens, steps);
        }
        parsedContent = { query: esqlQuery };
        steps.push({
          name: 'parse',
          description: 'ES|QL query extracted from model response',
          status: 'success',
          detail: esqlQuery.slice(0, 200),
        });

        // Step 4: Execute
        const execStart = Date.now();
        validationResponse = await this.backend.esqlQuery(esqlQuery);
        const esqlResp = validationResponse as EsqlResponse;
        steps.push({
          name: 'execute',
          description: `ES|QL query executed against real Elasticsearch`,
          status: 'success',
          durationMs: Date.now() - execStart,
          detail: `${esqlResp.columns?.length ?? 0} columns, ${esqlResp.values?.length ?? 0} rows`,
        });
      } else if (scenario.responseFormat === 'api-call') {
        // API call scenarios: validate JSON structure directly, don't execute against ES
        parsedContent = this.extractJson(rawResponse);
        if (!parsedContent) {
          steps.push({
            name: 'parse',
            description: 'Failed to parse JSON API request body from model response',
            status: 'failure',
            error: 'Could not extract valid JSON',
            detail: rawResponse.slice(0, 200),
          });
          return this.failScore(scenario, 'Failed to parse JSON from model response.', 'JSON parse error', rawResponse, latencyMs, inputTokens, outputTokens, steps);
        }
        steps.push({
          name: 'parse',
          description: 'API request body extracted from model response',
          status: 'success',
          detail: JSON.stringify(parsedContent).slice(0, 200),
        });

        // For api-call, we pass the parsed JSON as a mock SearchResponse to validate
        // The validate function checks the JSON structure, not query results
        validationResponse = parsedContent as unknown as SearchResponse;
        steps.push({
          name: 'execute',
          description: 'API call validation (structure check, no ES execution)',
          status: 'success',
        });
      } else {
        // query-dsl format: execute against ES
        parsedContent = this.extractJson(rawResponse);
        if (!parsedContent) {
          steps.push({
            name: 'parse',
            description: 'Failed to parse JSON query from model response',
            status: 'failure',
            error: 'Could not extract valid JSON',
            detail: rawResponse.slice(0, 200),
          });
          return this.failScore(scenario, 'Failed to parse JSON query from model response.', 'JSON parse error', rawResponse, latencyMs, inputTokens, outputTokens, steps);
        }
        steps.push({
          name: 'parse',
          description: 'JSON query extracted from model response',
          status: 'success',
          detail: JSON.stringify(parsedContent).slice(0, 200),
        });

        const execStart = Date.now();
        validationResponse = await this.backend.search(scenario.indexName, parsedContent);
        steps.push({
          name: 'execute',
          description: `Query executed against "${scenario.indexName}"`,
          status: 'success',
          durationMs: Date.now() - execStart,
        });
      }

      // Step 5: Validate
      const valStart = Date.now();
      const validation = await scenario.validate(validationResponse, this.backend);
      steps.push({
        name: 'validate',
        description: validation.correct
          ? `Validation passed: ${validation.score}/${validation.maxScore}`
          : `Validation failed: ${validation.score}/${validation.maxScore}`,
        status: validation.correct ? 'success' : 'failure',
        durationMs: Date.now() - valStart,
        detail: validation.feedback,
        error: validation.correct ? undefined : validation.feedback,
      });

      // Step 6: Speed adjustment
      const speedMultiplier = this.getSpeedMultiplier(latencyMs);
      const adjustedScore = Math.min(validation.maxScore, Math.round(validation.score * speedMultiplier));
      const speedNote = speedMultiplier > 1
        ? ` Speed bonus: x${speedMultiplier} (${latencyMs}ms).`
        : speedMultiplier < 1
          ? ` Speed penalty: x${speedMultiplier} (${latencyMs}ms).`
          : '';
      if (speedMultiplier !== 1) {
        steps.push({
          name: 'speed_adjust',
          description: `Speed multiplier x${speedMultiplier} applied`,
          status: 'success',
          detail: `${validation.score} -> ${adjustedScore}`,
        });
      }

      return {
        challengeId: scenario.id, domain: scenario.domain,
        difficulty: scenario.difficulty, title: scenario.title,
        score: adjustedScore, maxScore: validation.maxScore,
        correct: validation.correct, feedback: validation.feedback + speedNote,
        latencyMs, inputTokens, outputTokens,
        rawModelResponse: rawResponse, parsedQuery: parsedContent,
        error: null, evalSteps: steps,
      };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      const explanation = this.classifyError(error, rawResponse, scenario);
      steps.push({
        name: 'error',
        description: explanation,
        status: 'failure',
        error,
      });
      return {
        challengeId: scenario.id, domain: scenario.domain,
        difficulty: scenario.difficulty, title: scenario.title,
        score: 0, maxScore: scenario.maxScore, correct: false,
        feedback: `Error: ${error}`,
        latencyMs, inputTokens, outputTokens,
        rawModelResponse: rawResponse, parsedQuery: null,
        error, evalSteps: steps,
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
   * Check if a line is a continuation of a multi-line ES|QL expression.
   * Handles STATS aggregation expressions, BY clauses, and comma-separated lists.
   */
  /**
   * Classify an error into a human-readable explanation of what the model did wrong.
   */
  private classifyError(error: string, rawResponse: string, scenario?: Scenario): string {
    const e = error.toLowerCase();
    const r = rawResponse.toLowerCase();

    // ES|QL parsing errors
    if (e.includes('parsing_exception') && e.includes('no viable alternative')) {
      return 'The model wrote an ES|QL query with invalid syntax. ' +
        'It likely used a function or expression pattern that ES|QL does not support.';
    }
    if (e.includes('parsing_exception') && e.includes('unknown key')) {
      const keyMatch = error.match(/Unknown key for .* in \[(\w+)\]/);
      const key = keyMatch?.[1] ?? 'unknown';
      if (scenario?.responseFormat === 'api-call') {
        return `The model produced an Elasticsearch search query instead of an API request body. ` +
          `It returned a Query DSL object but this scenario expects a ${scenario.skillId} API payload.`;
      }
      return `The model included an invalid field "${key}" in the query body that Elasticsearch does not recognize.`;
    }
    if (e.includes('verification_exception') && e.includes('unknown column')) {
      const colMatch = error.match(/Unknown column \[([^\]]+)\]/);
      const col = colMatch?.[1] ?? 'unknown';
      return `The model referenced a column "${col}" that doesn't exist in the index. ` +
        'This can happen when KEEP drops the column before SORT uses it, ' +
        'or when the model guesses a field name that is not in the mapping.';
    }
    if (e.includes('verification_exception') && e.includes('unknown function')) {
      const fnMatch = error.match(/Unknown function \[([^\]]+)\]/);
      const fn = fnMatch?.[1] ?? 'unknown';
      return `The model used a function "${fn}" that does not exist in ES|QL. ` +
        'It likely hallucinated a function name from another query language (SQL, Spark, etc.).';
    }
    if (e.includes('aggregation or grouping expression required')) {
      return 'The model wrote a STATS command but did not include any aggregation expressions. ' +
        'This usually means the query was truncated (multi-line STATS not fully captured) ' +
        'or the model forgot to specify what to aggregate.';
    }
    if (e.includes('mismatched input')) {
      const inputMatch = error.match(/mismatched input '([^']+)'/);
      const input = inputMatch?.[1] ?? '';
      return `The model used "${input}" in a position where ES|QL expected a different command. ` +
        'It may have used syntax from another query language (e.g., SQL JOIN, subquery).';
    }

    // JSON parse errors
    if (e.includes('json parse error') || e.includes('could not extract valid json')) {
      if (r.includes('from ') || r.includes('select ')) {
        return 'The model returned an ES|QL or SQL query instead of JSON. ' +
          'This scenario expected a JSON response body.';
      }
      return 'The model did not return valid JSON. It may have included explanation text, ' +
        'markdown formatting, or an incomplete JSON structure.';
    }
    if (e.includes('esql parse error') || e.includes('could not find a valid esql query')) {
      if (r.includes('"query"') || r.includes('"match"')) {
        return 'The model returned a Query DSL JSON object instead of an ES|QL query. ' +
          'This scenario expected an ES|QL query starting with FROM.';
      }
      return 'The model did not return a valid ES|QL query. ES|QL queries must start with FROM.';
    }

    // Validation failures (not errors, just wrong results)
    if (e.includes('not sorted') || e.includes('sort')) {
      return 'The query executed but the results were not sorted correctly.';
    }
    if (e.includes('0 rows') || e.includes('no results returned')) {
      return 'The query executed but returned no results. The WHERE filter may be too restrictive, ' +
        'or the field names/values do not match the actual data.';
    }

    // Network/infra errors
    if (e.includes('fetch failed') || e.includes('econnrefused')) {
      return 'Network error: could not reach the model provider API. ' +
        'This is an infrastructure issue, not a model failure.';
    }

    // Generic
    return 'The model produced a response that could not be evaluated. ' +
      'Check the raw response and error details above.';
  }

  private isEsqlContinuation(line: string, prevLines: string[]): boolean {
    const prev = prevLines[prevLines.length - 1]?.trim() ?? '';

    // Previous line ends with comma = continuation of a list
    if (prev.endsWith(',')) return true;

    // Current line starts with BY (part of STATS ... BY grouping)
    if (/^BY\s/i.test(line)) return true;

    // Current line looks like an aggregation expression (name = FUNC(...))
    if (/^\w+\s*=\s*\w+\s*\(/i.test(line)) return true;

    // Previous line is just a command keyword (STATS, KEEP, SORT, etc.)
    // and current line has the arguments
    if (/^\|\s*(STATS|KEEP|SORT|DROP|RENAME|EVAL|WHERE|DISSECT|GROK)\s*$/i.test(prev)) return true;

    // Current line starts with ASC/DESC (SORT continuation)
    if (/^(ASC|DESC)\b/i.test(line)) return true;

    // Current line starts with AND/OR (WHERE continuation)
    if (/^(AND|OR)\s/i.test(line)) return true;

    return false;
  }

  private failScore(
    scenario: Scenario,
    feedback: string,
    error: string,
    rawResponse: string,
    latencyMs: number,
    inputTokens: number,
    outputTokens: number,
    evalSteps?: EvalStep[],
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
      evalSteps,
    };
  }

  private async runChallenge(challenge: Challenge): Promise<ChallengeScore> {
    const steps: EvalStep[] = [];

    // Step 1: Setup
    const setupStart = Date.now();
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
    steps.push({
      name: 'setup',
      description: `Index "${challenge.indexName}" created with ${challenge.seedData.length} docs${challenge.pipeline ? ' + pipeline' : ''}`,
      status: 'success',
      durationMs: Date.now() - setupStart,
    });

    // For ES|QL challenges in simulated mode, set the golden response
    if (challenge.queryType === 'esql' && challenge.expectedEsqlResponse && this.backend.mode === 'simulated') {
      (this.backend as SimulatedBackend).setGoldenEsqlResponse(challenge.expectedEsqlResponse);
    }

    const useEsql =
      challenge.queryType === 'esql' ||
      (this.config.language === 'esql' && !challenge.esqlIncompatible);

    if (this.config.language === 'esql' && challenge.esqlIncompatible) {
      return {
        challengeId: challenge.id,
        domain: challenge.domain,
        difficulty: challenge.difficulty,
        title: challenge.title,
        score: 0,
        maxScore: 0,
        correct: false,
        feedback: 'Skipped: challenge has no ES|QL equivalent.',
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        rawModelResponse: '',
        parsedQuery: null,
        error: null,
      };
    }

    if (useEsql) {
      return this.runEsqlChallenge(challenge);
    }

    return this.runDslChallenge(challenge);
  }

  private async runDslChallenge(challenge: Challenge): Promise<ChallengeScore> {
    let rawResponse = '';
    let parsedQuery: Record<string, unknown> | null = null;
    let latencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let error: string | null = null;
    const steps: EvalStep[] = [];

    try {
      // Step 2: Prompt + Model call
      if (challenge.multiTurn && challenge.discoveryPrompt) {
        // Discovery call
        const discStart = Date.now();
        const discoveryResponse = await this.model.complete(
          challenge.discoveryPrompt + `\n\nINDEX: ${challenge.indexName}\n\nMAPPING:\n${JSON.stringify(challenge.mapping ?? {}, null, 2)}\n\nSAMPLE DOCUMENTS (first 2):\n${challenge.seedData.slice(0, 2).map((d) => JSON.stringify(d._source, null, 2)).join('\n')}`,
        );
        latencyMs += discoveryResponse.latencyMs;
        inputTokens += discoveryResponse.inputTokens ?? 0;
        outputTokens += discoveryResponse.outputTokens ?? 0;
        steps.push({
          name: 'discovery_call',
          description: `Multi-turn discovery: model analyzed schema and sample data`,
          status: 'success',
          durationMs: discoveryResponse.latencyMs,
          detail: `${discoveryResponse.inputTokens ?? 0} in / ${discoveryResponse.outputTokens ?? 0} out tokens`,
        });

        // Query call with discovery context
        const queryPrompt = this.buildPrompt(challenge) +
          `\n\nYour earlier analysis of the data:\n${discoveryResponse.content}\n\nNow respond with ONLY the JSON query body:`;
        const response = await this.model.complete(queryPrompt);
        rawResponse = response.content;
        latencyMs += response.latencyMs;
        inputTokens += response.inputTokens ?? 0;
        outputTokens += response.outputTokens ?? 0;
        steps.push({
          name: 'model_call',
          description: `Model generated query using discovery context`,
          status: 'success',
          durationMs: response.latencyMs,
          detail: `${response.inputTokens ?? 0} in / ${response.outputTokens ?? 0} out tokens`,
        });
      } else {
        const prompt = this.buildPrompt(challenge);
        steps.push({
          name: 'prompt',
          description: `Prompt built: ${challenge.title} (${challenge.domain} / ${challenge.difficulty})`,
          status: 'success',
          detail: `${prompt.length} chars`,
        });

        const callStart = Date.now();
        const response = await this.model.complete(prompt);
        rawResponse = response.content;
        latencyMs = response.latencyMs;
        inputTokens = response.inputTokens ?? 0;
        outputTokens = response.outputTokens ?? 0;
        steps.push({
          name: 'model_call',
          description: `Model responded in ${response.latencyMs}ms`,
          status: 'success',
          durationMs: response.latencyMs,
          detail: `${inputTokens} in / ${outputTokens} out tokens`,
        });
      }

      // Step 3: Parse
      parsedQuery = this.extractJson(rawResponse);

      if (!parsedQuery) {
        steps.push({
          name: 'parse',
          description: 'Failed to extract valid JSON query from model response',
          status: 'failure',
          error: 'Could not parse JSON from response',
          detail: rawResponse.slice(0, 200),
        });
        return {
          challengeId: challenge.id, domain: challenge.domain,
          difficulty: challenge.difficulty, title: challenge.title,
          score: 0, maxScore: challenge.maxScore, correct: false,
          feedback: 'Failed to parse JSON query from model response.',
          latencyMs, inputTokens, outputTokens,
          rawModelResponse: rawResponse, parsedQuery: null,
          error: 'JSON parse error', evalSteps: steps,
        };
      }

      steps.push({
        name: 'parse',
        description: 'JSON query extracted from model response',
        status: 'success',
        detail: JSON.stringify(parsedQuery).slice(0, 200),
      });

      // Step 4: Execute
      const execStart = Date.now();
      const searchResponse: SearchResponse = await this.backend.search(
        challenge.indexName,
        parsedQuery,
      );
      const execMs = Date.now() - execStart;
      const hitCount = searchResponse.hits?.hits?.length ?? 0;
      steps.push({
        name: 'execute',
        description: `Query executed against "${challenge.indexName}"`,
        status: 'success',
        durationMs: execMs,
        detail: `${hitCount} hits returned`,
      });

      // Step 5: Validate
      const valStart = Date.now();
      const validation = await challenge.validate(searchResponse, this.backend);
      steps.push({
        name: 'validate',
        description: validation.correct
          ? `Validation passed: ${validation.score}/${validation.maxScore}`
          : `Validation failed: ${validation.score}/${validation.maxScore}`,
        status: validation.correct ? 'success' : 'failure',
        durationMs: Date.now() - valStart,
        detail: validation.feedback,
        error: validation.correct ? undefined : validation.feedback,
      });

      // Step 6: Speed adjustment
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
      if (speedMultiplier !== 1) {
        steps.push({
          name: 'speed_adjust',
          description: `Speed multiplier x${speedMultiplier} applied (${latencyMs}ms)`,
          status: 'success',
          detail: `${validation.score} -> ${adjustedScore}`,
        });
      }

      return {
        challengeId: challenge.id, domain: challenge.domain,
        difficulty: challenge.difficulty, title: challenge.title,
        score: adjustedScore, maxScore: validation.maxScore,
        correct: validation.correct,
        feedback: validation.feedback + speedNote,
        latencyMs, inputTokens, outputTokens,
        rawModelResponse: rawResponse, parsedQuery,
        error: null, evalSteps: steps,
      };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      const explanation = this.classifyError(error, rawResponse);
      steps.push({
        name: 'error',
        description: explanation,
        status: 'failure',
        error,
      });
      return {
        challengeId: challenge.id, domain: challenge.domain,
        difficulty: challenge.difficulty, title: challenge.title,
        score: 0, maxScore: challenge.maxScore, correct: false,
        feedback: `Error: ${error}`,
        latencyMs, inputTokens, outputTokens,
        rawModelResponse: rawResponse, parsedQuery,
        error, evalSteps: steps,
      };
    }
  }

  private async runEsqlChallenge(challenge: Challenge): Promise<ChallengeScore> {
    let rawResponse = '';
    let latencyMs = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let error: string | null = null;

    try {
      const esqlSystemPrompt = this.buildEsqlSystemPrompt();

      // Multi-turn: first let the model explore, then ask for the ES|QL query
      if (challenge.multiTurn && challenge.discoveryPrompt) {
        const discoveryResponse = await this.model.complete(
          challenge.discoveryPrompt + `\n\nINDEX: ${challenge.indexName}\n\nMAPPING:\n${JSON.stringify(challenge.mapping ?? {}, null, 2)}\n\nSAMPLE DOCUMENTS (first 2):\n${challenge.seedData.slice(0, 2).map((d) => JSON.stringify(d._source, null, 2)).join('\n')}`,
          esqlSystemPrompt,
        );
        latencyMs += discoveryResponse.latencyMs;
        inputTokens += discoveryResponse.inputTokens ?? 0;
        outputTokens += discoveryResponse.outputTokens ?? 0;

        const queryPrompt = this.buildEsqlUserPrompt(challenge) +
          `\n\nYour earlier analysis of the data:\n${discoveryResponse.content}\n\nNow respond with ONLY the ES|QL query:`;

        const response = await this.model.complete(queryPrompt, esqlSystemPrompt);
        rawResponse = response.content;
        latencyMs += response.latencyMs;
        inputTokens += response.inputTokens ?? 0;
        outputTokens += response.outputTokens ?? 0;
      } else {
        const prompt = this.buildEsqlUserPrompt(challenge);
        const response = await this.model.complete(prompt, esqlSystemPrompt);
        rawResponse = response.content;
        latencyMs = response.latencyMs;
        inputTokens = response.inputTokens ?? 0;
        outputTokens = response.outputTokens ?? 0;
      }

      const esqlQuery = this.extractEsql(rawResponse);

      if (!esqlQuery) {
        return {
          challengeId: challenge.id,
          domain: challenge.domain,
          difficulty: challenge.difficulty,
          title: challenge.title,
          score: 0,
          maxScore: challenge.maxScore,
          correct: false,
          feedback: 'Failed to extract ES|QL query from model response.',
          latencyMs,
          inputTokens,
          outputTokens,
          rawModelResponse: rawResponse,
          parsedQuery: null,
          error: 'ES|QL parse error',
        };
      }

      const esqlResponse: EsqlResponse = await this.backend.esqlQuery(esqlQuery);

      if (!challenge.validateEsql) {
        return {
          challengeId: challenge.id,
          domain: challenge.domain,
          difficulty: challenge.difficulty,
          title: challenge.title,
          score: 0,
          maxScore: challenge.maxScore,
          correct: false,
          feedback: 'No ES|QL validator defined for this challenge.',
          latencyMs,
          inputTokens,
          outputTokens,
          rawModelResponse: rawResponse,
          parsedQuery: { esql: esqlQuery },
          error: 'Missing validateEsql',
        };
      }

      const validation = await challenge.validateEsql(esqlResponse, esqlQuery, this.backend);

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
        parsedQuery: { esql: esqlQuery },
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
        parsedQuery: null,
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

    let systemPrompt = SYSTEM_PROMPT;
    if (this.skillContext) {
      systemPrompt += `\n\n--- SKILL REFERENCE ---\n${this.skillContext}\n--- END SKILL REFERENCE ---`;
    }

    return `${systemPrompt}

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
${this.config.noHints ? '' : `\nHINTS:\n${challenge.hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n`}
Respond with ONLY the JSON query body for the _search API:`;
  }

  private buildEsqlSystemPrompt(): string {
    let systemPrompt = ESQL_SYSTEM_PROMPT;
    if (this.skillContext) {
      systemPrompt += `\n\n--- SKILL REFERENCE ---\n${this.skillContext}\n--- END SKILL REFERENCE ---`;
    }
    return systemPrompt;
  }

  private buildEsqlUserPrompt(challenge: Challenge): string {
    const sampleDocs = challenge.seedData
      .slice(0, 3)
      .map((d) => JSON.stringify(d._source, null, 2))
      .join('\n');

    const mappingStr = challenge.mapping
      ? JSON.stringify(challenge.mapping, null, 2)
      : 'No explicit mapping';

    return `CHALLENGE: ${challenge.title}
DOMAIN: ${challenge.domain}
DIFFICULTY: ${challenge.difficulty}

DESCRIPTION:
${challenge.description}

INDEX: ${challenge.indexName}

MAPPING:
${mappingStr}

SAMPLE DOCUMENTS (first 3 of ${challenge.seedData.length}):
${sampleDocs}
${this.config.noHints ? '' : `\nHINTS:\n${(challenge.esqlHints ?? challenge.hints).map((h, i) => `${i + 1}. ${h}`).join('\n')}\n`}
Respond with ONLY the ES|QL query string:`;
  }

  extractEsql(text: string): string | null {
    const trimmed = text.trim();

    // Try extracting from markdown code block (```esql, ```sql, or bare ```)
    const codeBlockMatch = trimmed.match(/```(?:esql|sql|)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      const content = codeBlockMatch[1].trim();
      if (content.length > 0) return content;
    }

    // Extract the first contiguous ES|QL query from the text.
    // A query starts with a source command (FROM, ROW, SHOW, METRICS, TS)
    // and continues on pipe lines, open-paren continuations, comma-separated
    // lists, BY clauses, aggregation expressions, and AND/OR conditions.
    const lines = trimmed.split('\n');
    const queryLines: string[] = [];
    let openParens = 0;

    for (const line of lines) {
      const t = line.trim();

      if (queryLines.length === 0) {
        if (/^(FROM|ROW|SHOW|METRICS|TS)\b/i.test(t)) {
          queryLines.push(t);
          openParens += (t.match(/\(/g) ?? []).length - (t.match(/\)/g) ?? []).length;
        }
        continue;
      }

      if (t === '') {
        if (openParens > 0) continue;
        break;
      }

      if (t.startsWith('|')) {
        queryLines.push(t);
      } else if (openParens > 0) {
        queryLines.push(t);
      } else if (this.isEsqlContinuation(t, queryLines)) {
        queryLines.push(t);
      } else {
        break;
      }

      openParens += (t.match(/\(/g) ?? []).length - (t.match(/\)/g) ?? []).length;
      if (openParens < 0) openParens = 0;
    }

    if (queryLines.length > 0) {
      return queryLines.join('\n').trim();
    }

    return null;
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

    const language = this.config.language === 'esql' ? 'esql' as const : 'dsl' as const;
    const hints = !this.config.noHints;

    return {
      modelId: this.config.modelId,
      modelName: this.model.name,
      provider: this.model.provider,
      language,
      hints,
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
