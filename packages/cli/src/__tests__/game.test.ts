import { SimulatedBackend } from '../elastic/simulated-backend';
import { GameEngine } from '../engine/game-engine';
import { getAllChallenges, getChallengesByDomain } from '../challenges';
import { BenchmarkRunner } from '../benchmark/runner';
import { BenchmarkStore } from '../benchmark/store';
import type { BenchmarkConfig, BenchmarkResult } from '../benchmark/types';
import { retryFetch } from '../benchmark/retry';

describe('SimulatedBackend', () => {
  let backend: SimulatedBackend;

  beforeEach(async () => {
    backend = new SimulatedBackend();
    await backend.createIndex('test-index');
  });

  afterEach(async () => {
    await backend.reset();
  });

  describe('indexing and retrieval', () => {
    it('should index and retrieve a document', async () => {
      await backend.indexDocument('test-index', '1', { title: 'Hello', body: 'World' });
      const doc = await backend.getDocument('test-index', '1');

      expect(doc).not.toBeNull();
      expect(doc!._id).toBe('1');
      expect(doc!._source.title).toBe('Hello');
    });

    it('should bulk index documents', async () => {
      await backend.bulkIndex([
        { index: 'test-index', id: '1', doc: { name: 'Alice' } },
        { index: 'test-index', id: '2', doc: { name: 'Bob' } },
        { index: 'test-index', id: '3', doc: { name: 'Charlie' } },
      ]);

      const count = await backend.count('test-index');
      expect(count).toBe(3);
    });
  });

  describe('search queries', () => {
    beforeEach(async () => {
      await backend.bulkIndex([
        { index: 'test-index', id: '1', doc: { title: 'Elasticsearch Guide', category: 'tech', price: 29.99 } },
        { index: 'test-index', id: '2', doc: { title: 'Kibana Dashboard', category: 'tech', price: 19.99 } },
        { index: 'test-index', id: '3', doc: { title: 'Cooking Recipes', category: 'food', price: 14.99 } },
        { index: 'test-index', id: '4', doc: { title: 'Advanced Elasticsearch', category: 'tech', price: 49.99 } },
      ]);
    });

    it('should execute match_all query', async () => {
      const result = await backend.search('test-index', { query: { match_all: {} } });
      expect(result.hits.total.value).toBe(4);
    });

    it('should execute match query', async () => {
      const result = await backend.search('test-index', {
        query: { match: { title: 'elasticsearch' } },
      });

      expect(result.hits.total.value).toBe(2);
      const ids = result.hits.hits.map((h) => h._id).sort();
      expect(ids).toEqual(['1', '4']);
    });

    it('should execute term query on keyword field', async () => {
      const result = await backend.search('test-index', {
        query: { term: { category: 'tech' } },
      });

      expect(result.hits.total.value).toBe(3);
    });

    it('should execute range query', async () => {
      const result = await backend.search('test-index', {
        query: { range: { price: { gte: 20, lte: 40 } } },
      });

      expect(result.hits.total.value).toBe(1);
      expect(result.hits.hits[0]._id).toBe('1');
    });

    it('should execute bool query', async () => {
      const result = await backend.search('test-index', {
        query: {
          bool: {
            must: [{ match: { title: 'elasticsearch' } }],
            filter: [{ term: { category: 'tech' } }],
          },
        },
      });

      expect(result.hits.total.value).toBe(2);
    });

    it('should handle sort and pagination', async () => {
      const result = await backend.search('test-index', {
        query: { match_all: {} },
        sort: [{ price: { order: 'desc' } }],
        size: 2,
        from: 0,
      });

      expect(result.hits.hits.length).toBe(2);
      expect(result.hits.hits[0]._id).toBe('4'); // 49.99
      expect(result.hits.hits[1]._id).toBe('1'); // 29.99
    });
  });

  describe('aggregations', () => {
    beforeEach(async () => {
      await backend.bulkIndex([
        { index: 'test-index', id: '1', doc: { category: 'tech', price: 29.99 } },
        { index: 'test-index', id: '2', doc: { category: 'tech', price: 19.99 } },
        { index: 'test-index', id: '3', doc: { category: 'food', price: 14.99 } },
        { index: 'test-index', id: '4', doc: { category: 'tech', price: 49.99 } },
      ]);
    });

    it('should compute terms aggregation', async () => {
      const result = await backend.search('test-index', {
        size: 0,
        aggs: {
          categories: { terms: { field: 'category' } },
        },
      });

      expect(result.aggregations).toBeDefined();
      const buckets = result.aggregations!.categories.buckets!;
      expect(buckets.length).toBe(2);

      const techBucket = buckets.find((b) => b.key === 'tech');
      expect(techBucket!.doc_count).toBe(3);

      const foodBucket = buckets.find((b) => b.key === 'food');
      expect(foodBucket!.doc_count).toBe(1);
    });

    it('should compute avg aggregation', async () => {
      const result = await backend.search('test-index', {
        size: 0,
        aggs: {
          avg_price: { avg: { field: 'price' } },
        },
      });

      expect(result.aggregations!.avg_price.value).toBeCloseTo(28.74, 1);
    });

    it('should compute stats aggregation', async () => {
      const result = await backend.search('test-index', {
        size: 0,
        aggs: {
          price_stats: { stats: { field: 'price' } },
        },
      });

      const stats = result.aggregations!.price_stats as unknown as Record<string, number>;
      expect(stats.count).toBe(4);
      expect(stats.min).toBeCloseTo(14.99, 1);
      expect(stats.max).toBeCloseTo(49.99, 1);
    });
  });

  describe('vector search', () => {
    it('should perform kNN search', async () => {
      await backend.bulkIndex([
        { index: 'test-index', id: '1', doc: { title: 'Doc A', embedding: [1, 0, 0] } },
        { index: 'test-index', id: '2', doc: { title: 'Doc B', embedding: [0, 1, 0] } },
        { index: 'test-index', id: '3', doc: { title: 'Doc C', embedding: [0.9, 0.1, 0] } },
      ]);

      const result = await backend.search('test-index', {
        knn: {
          field: 'embedding',
          query_vector: [1, 0, 0],
          k: 2,
        },
      });

      expect(result.hits.hits.length).toBe(2);
      // Doc 1 should be closest (exact match), then Doc 3
      expect(result.hits.hits[0]._id).toBe('1');
      expect(result.hits.hits[1]._id).toBe('3');
    });
  });
});

describe('GameEngine', () => {
  it('should set up and run through challenges', async () => {
    const backend = new SimulatedBackend();
    const challenges = getAllChallenges().slice(0, 2); // Just first 2
    const engine = new GameEngine(backend, challenges);

    expect(engine.getTotalChallenges()).toBe(2);
    expect(engine.isGameOver()).toBe(false);

    // Setup first challenge
    const challenge = await engine.setupChallenge();
    expect(challenge).not.toBeNull();
    expect(challenge!.id).toBe(challenges[0].id);

    // Submit an answer (correct match query for first challenge)
    const result = await engine.submitAnswer(
      'test-agent',
      challenge!.id,
      {
        query: {
          multi_match: {
            query: 'elasticsearch',
            fields: ['title', 'body'],
          },
        },
      },
      Date.now() - 1000,
    );

    expect(result.agentId).toBe('test-agent');
    expect(result.score).toBeGreaterThan(0);
  });

  it('should track leaderboard', async () => {
    const backend = new SimulatedBackend();
    const challenges = getAllChallenges().slice(0, 1);
    const engine = new GameEngine(backend, challenges);

    await engine.setupChallenge();

    await engine.submitAnswer(
      'agent-1',
      challenges[0].id,
      { query: { multi_match: { query: 'elasticsearch', fields: ['title', 'body'] } } },
      Date.now() - 500,
    );

    const leaderboard = engine.getLeaderboard();
    expect(leaderboard.length).toBe(1);
    expect(leaderboard[0].agentId).toBe('agent-1');
  });

  it('should handle skip', async () => {
    const backend = new SimulatedBackend();
    const challenges = getAllChallenges().slice(0, 2);
    const engine = new GameEngine(backend, challenges);

    await engine.setupChallenge();
    const result = engine.skipChallenge('agent-1', challenges[0].id);

    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
    expect(engine.getCurrentChallengeIndex()).toBe(1);
  });
});

describe('Challenge Registry', () => {
  it('should have at least 57 challenges', () => {
    const challenges = getAllChallenges();
    expect(challenges.length).toBeGreaterThanOrEqual(57);
  });

  it('should cover all 7 domains', () => {
    const domains = new Set(getAllChallenges().map((c) => c.domain));
    expect(domains).toContain('full-text-search');
    expect(domains).toContain('ingest-indexing');
    expect(domains).toContain('aggregations');
    expect(domains).toContain('observability');
    expect(domains).toContain('vector-search');
    expect(domains).toContain('security');
    expect(domains).toContain('esql');
  });

  it('should cover all difficulty levels', () => {
    const difficulties = new Set(getAllChallenges().map((c) => c.difficulty));
    expect(difficulties).toContain('beginner');
    expect(difficulties).toContain('intermediate');
    expect(difficulties).toContain('advanced');
    expect(difficulties).toContain('expert');
  });

  it('should have unique challenge IDs', () => {
    const ids = getAllChallenges().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should filter by domain', () => {
    const searchChallenges = getChallengesByDomain('full-text-search');
    expect(searchChallenges.length).toBeGreaterThan(0);
    expect(searchChallenges.every((c) => c.domain === 'full-text-search')).toBe(true);
  });

  it('should have 4 ES|QL-only challenges (DISSECT, CATEGORIZE, CHANGE_POINT, INLINESTATS)', () => {
    const esqlChallenges = getChallengesByDomain('esql');
    expect(esqlChallenges.length).toBe(4);
    expect(esqlChallenges.every((c) => c.queryType === 'esql')).toBe(true);
    expect(esqlChallenges.every((c) => c.validateEsql !== undefined)).toBe(true);
  });

  it('should have esqlIncompatible flag on challenges without ES|QL equivalents', () => {
    const all = getAllChallenges();
    const incompatible = all.filter((c) => c.esqlIncompatible);
    expect(incompatible.length).toBeGreaterThanOrEqual(5);
    const incompatibleIds = incompatible.map((c) => c.id);
    expect(incompatibleIds).toContain('fts-11-dis-max');
    expect(incompatibleIds).toContain('fts-13-nested');
    expect(incompatibleIds).toContain('sec-3-rare-domains');
  });

  it('should have validateEsql on compatible non-esql challenges', () => {
    const all = getAllChallenges();
    const compatible = all.filter((c) => c.domain !== 'esql' && !c.esqlIncompatible);
    const withValidator = compatible.filter((c) => c.validateEsql !== undefined);
    expect(withValidator.length).toBe(compatible.length);
  });
});

describe('BenchmarkRunner', () => {
  it('should extract JSON from various response formats', () => {
    const config: BenchmarkConfig = { modelId: 'test:model' };
    const mockModel = {
      name: 'test',
      provider: 'test',
      complete: async () => ({ content: '', latencyMs: 0 }),
    };
    const runner = new BenchmarkRunner(mockModel, config);

    const extractJson = (runner as unknown as { extractJson: (s: string) => Record<string, unknown> | null }).extractJson.bind(runner);

    // Plain JSON
    expect(extractJson('{"query":{"match_all":{}}}')).toEqual({ query: { match_all: {} } });

    // JSON in markdown code block
    expect(extractJson('```json\n{"query":{"match_all":{}}}\n```')).toEqual({ query: { match_all: {} } });

    // JSON with surrounding text
    expect(extractJson('Here is the query:\n{"query":{"match_all":{}}}\nDone.')).toEqual({ query: { match_all: {} } });

    // Invalid JSON
    expect(extractJson('not json at all')).toBeNull();
  });

  it('should extract ES|QL from various response formats', () => {
    const config: BenchmarkConfig = { modelId: 'test:model' };
    const mockModel = {
      name: 'test',
      provider: 'test',
      complete: async () => ({ content: '', latencyMs: 0 }),
    };
    const runner = new BenchmarkRunner(mockModel, config);

    // Plain ES|QL
    expect(runner.extractEsql('FROM logs-* | LIMIT 10')).toBe('FROM logs-* | LIMIT 10');

    // ES|QL in code block
    expect(runner.extractEsql('```esql\nFROM logs-* | STATS count = COUNT(*) BY host\n```'))
      .toBe('FROM logs-* | STATS count = COUNT(*) BY host');

    // ES|QL in bare code block
    expect(runner.extractEsql('```\nFROM logs-* | WHERE level == "error"\n```'))
      .toBe('FROM logs-* | WHERE level == "error"');

    // ES|QL with surrounding text (parser stops at non-query lines)
    expect(runner.extractEsql('Here is the query:\nFROM logs-* | LIMIT 5\nDone.'))
      .toBe('FROM logs-* | LIMIT 5');

    // Not ES|QL at all
    expect(runner.extractEsql('This is just text with no query')).toBeNull();
  });
});

describe('ES|QL Language Mode', () => {
  it('should skip incompatible challenges when language is esql', async () => {
    const config: BenchmarkConfig = { modelId: 'test:model', language: 'esql' };
    const mockModel = {
      name: 'test',
      provider: 'test',
      complete: async () => ({ content: 'FROM test | LIMIT 10', latencyMs: 100 }),
    };
    const runner = new BenchmarkRunner(mockModel, config);
    const runChallenge = (runner as unknown as { runChallenge: (c: unknown) => Promise<{ feedback: string; maxScore: number }> }).runChallenge.bind(runner);

    const incompatibleChallenge = {
      id: 'test-incompat',
      domain: 'full-text-search' as const,
      difficulty: 'beginner' as const,
      title: 'Test',
      description: 'Test',
      hints: [],
      indexName: 'test',
      seedData: [],
      validate: async () => ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
      maxScore: 100,
      timeLimitMs: 30000,
      esqlIncompatible: true,
    };

    const result = await runChallenge(incompatibleChallenge);
    expect(result.feedback).toContain('Skipped');
    expect(result.maxScore).toBe(0);
  });
});

describe('ES|QL Validation Helpers', () => {
  const { validateEsqlChallenge, scoreEsqlColumns, scoreEsqlRowCount, scoreEsqlQuery } = require('../challenges/esql-helpers');

  it('should validate ES|QL columns', () => {
    const response = {
      columns: [{ name: 'host', type: 'keyword' }, { name: 'count', type: 'long' }],
      values: [['web-01', 5]],
    };
    const result = scoreEsqlColumns(response, ['host', 'count']);
    expect(result.score).toBe(30);
  });

  it('should partially score missing columns', () => {
    const response = {
      columns: [{ name: 'host', type: 'keyword' }],
      values: [['web-01']],
    };
    const result = scoreEsqlColumns(response, ['host', 'count']);
    expect(result.score).toBeLessThan(30);
    expect(result.score).toBeGreaterThan(0);
  });

  it('should validate row count', () => {
    const response = {
      columns: [{ name: 'x', type: 'keyword' }],
      values: [['a'], ['b'], ['c']],
    };
    const result = scoreEsqlRowCount(response, 3);
    expect(result.score).toBe(20);
  });

  it('should validate query patterns', () => {
    const query = 'FROM logs-* | STATS count = COUNT(*) BY service | SORT count DESC';
    const result = scoreEsqlQuery(query, [
      { pattern: /\bFROM\b/i, points: 25, label: 'FROM' },
      { pattern: /\bSTATS\b/i, points: 25, label: 'STATS' },
      { pattern: /\bCOUNT\b/i, points: 25, label: 'COUNT' },
      { pattern: /\bSORT\b/i, points: 25, label: 'SORT' },
    ]);
    expect(result.score).toBe(100);
    expect(result.matchedPatterns).toEqual(['FROM', 'STATS', 'COUNT', 'SORT']);
  });

  it('should run combined validation', () => {
    const response = {
      columns: [{ name: 'service', type: 'keyword' }, { name: 'count', type: 'long' }],
      values: [['api', 4], ['db', 2]],
    };
    const query = 'FROM logs | STATS count = COUNT(*) BY service | SORT count DESC';
    const result = validateEsqlChallenge(response, query, {
      expectedColumns: ['service', 'count'],
      expectedRowCount: 2,
      requiredPatterns: [
        { pattern: /\bSTATS\b/i, points: 50, label: 'STATS' },
        { pattern: /\bCOUNT\b/i, points: 50, label: 'COUNT' },
      ],
    });
    expect(result.correct).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });
});

describe('SimulatedBackend ES|QL', () => {
  it('should return golden response when set', async () => {
    const backend = new SimulatedBackend();
    const golden = {
      columns: [{ name: 'host', type: 'keyword' }, { name: 'count', type: 'long' }],
      values: [['web-01', 10], ['db-01', 5]],
    };
    backend.setGoldenEsqlResponse(golden);
    const result = await backend.esqlQuery('FROM test | STATS count = COUNT(*) BY host');
    expect(result).toEqual(golden);
  });

  it('should return empty response when no golden set', async () => {
    const backend = new SimulatedBackend();
    const result = await backend.esqlQuery('FROM test');
    expect(result.columns).toEqual([]);
    expect(result.values).toEqual([]);
  });

  it('should clear golden response on reset', async () => {
    const backend = new SimulatedBackend();
    backend.setGoldenEsqlResponse({
      columns: [{ name: 'x', type: 'keyword' }],
      values: [['a']],
    });
    await backend.reset();
    const result = await backend.esqlQuery('FROM test');
    expect(result.columns).toEqual([]);
    expect(result.values).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// BenchmarkStore
// ---------------------------------------------------------------------------

function makeResult(
  overrides: Partial<BenchmarkResult> = {},
): BenchmarkResult {
  return {
    modelId: 'openai:gpt-test',
    modelName: 'gpt-test',
    provider: 'openai',
    language: 'dsl',
    hints: true,
    timestamp: Date.now(),
    totalScore: 100,
    maxPossibleScore: 100,
    percentage: 100,
    totalChallenges: 1,
    correctChallenges: 1,
    avgLatencyMs: 500,
    totalInputTokens: 100,
    totalOutputTokens: 20,
    domainScores: [],
    difficultyScores: [],
    challengeScores: [],
    ...overrides,
  };
}

function makeStore(results: BenchmarkResult[]): BenchmarkStore {
  const store = Object.create(BenchmarkStore.prototype) as BenchmarkStore;
  (store as unknown as { results: BenchmarkResult[] }).results = results;
  return store;
}

describe('BenchmarkStore', () => {
  it('getLeaderboard returns one row per modelId|language|hints combination', () => {
    const store = makeStore([
      makeResult({ modelId: 'openai:m', language: 'dsl',  hints: true,  totalScore: 80, percentage: 80 }),
      makeResult({ modelId: 'openai:m', language: 'esql', hints: true,  totalScore: 90, percentage: 90 }),
      makeResult({ modelId: 'openai:m', language: 'esql', hints: false, totalScore: 70, percentage: 70 }),
    ]);
    const rows = store.getLeaderboard();
    expect(rows).toHaveLength(3);
    const langs = rows.map((r) => `${r.language}/${r.hints}`).sort();
    expect(langs).toEqual(['dsl/true', 'esql/false', 'esql/true']);
  });

  it('getLeaderboard keeps only the best score per key when duplicates exist', () => {
    const store = makeStore([
      makeResult({ modelId: 'openai:m', language: 'dsl', hints: true, totalScore: 60, percentage: 60 }),
      makeResult({ modelId: 'openai:m', language: 'dsl', hints: true, totalScore: 85, percentage: 85 }),
    ]);
    const rows = store.getLeaderboard();
    expect(rows).toHaveLength(1);
    expect(rows[0].totalScore).toBe(85);
  });

  it('getModelComparison returns the best result for each modelId regardless of language/hints', () => {
    const store = makeStore([
      makeResult({ modelId: 'openai:a', language: 'dsl',  hints: true,  totalScore: 70, percentage: 70 }),
      makeResult({ modelId: 'openai:a', language: 'esql', hints: true,  totalScore: 95, percentage: 95 }),
      makeResult({ modelId: 'openai:b', language: 'esql', hints: false, totalScore: 60, percentage: 60 }),
    ]);
    const { a, b } = store.getModelComparison('openai:a', 'openai:b');
    expect(a).toBeDefined();
    expect(a!.totalScore).toBe(95);
    expect(b).toBeDefined();
    expect(b!.totalScore).toBe(60);
  });

  it('getModelComparison returns undefined for unknown modelId', () => {
    const store = makeStore([makeResult({ modelId: 'openai:a' })]);
    const { a, b } = store.getModelComparison('openai:a', 'openai:unknown');
    expect(a).toBeDefined();
    expect(b).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// retryFetch
// ---------------------------------------------------------------------------

describe('retryFetch', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.useRealTimers();
  });

  it('returns the response immediately on 200', async () => {
    const ok = new Response('ok', { status: 200 });
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(ok);
    const result = await retryFetch('https://example.com/api');
    expect(result.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and returns eventual success', async () => {
    jest.useFakeTimers();
    const rateLimited = new Response('rate limited', { status: 429 });
    const success = new Response('ok', { status: 200 });
    fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValue(success);

    const promise = retryFetch('https://example.com/api');
    // Advance past the retry delay
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('respects Retry-After header (seconds)', async () => {
    jest.useFakeTimers();
    const rateLimited = new Response('rate limited', {
      status: 429,
      headers: { 'retry-after': '2' },
    });
    const success = new Response('ok', { status: 200 });
    fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValue(success);

    const promise = retryFetch('https://example.com/api');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns the last 429 response after exhausting all retries', async () => {
    jest.useFakeTimers();
    const rateLimited = new Response('still limited', { status: 429 });
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(rateLimited);

    const promise = retryFetch('https://example.com/api');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.status).toBe(429);
    // 1 initial + 3 retries = 4 total calls
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('does not retry on non-retryable status codes (e.g. 500)', async () => {
    const serverError = new Response('internal error', { status: 500 });
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(serverError);
    const result = await retryFetch('https://example.com/api');
    expect(result.status).toBe(500);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// runEsqlChallenge error path
// ---------------------------------------------------------------------------

describe('runEsqlChallenge error handling', () => {
  it('returns correct: false with error feedback when esqlQuery throws', async () => {
    const config: BenchmarkConfig = {
      modelId: 'openai:test',
      language: 'esql',
    };
    const mockModel = {
      name: 'test',
      provider: 'openai',
      complete: jest.fn().mockResolvedValue({
        content: 'FROM logs | STATS count = COUNT(*)',
        latencyMs: 100,
        inputTokens: 50,
        outputTokens: 10,
      }),
    };

    const mockBackend: SimulatedBackend = Object.assign(
      Object.create(SimulatedBackend.prototype),
      {
        mode: 'simulated',
        reset: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
        bulkIndex: jest.fn().mockResolvedValue(undefined),
        esqlQuery: jest.fn().mockRejectedValue(new Error('parsing_exception: unexpected token')),
      },
    );

    const runner = new BenchmarkRunner(mockModel, config, mockBackend);
    const challenges = getAllChallenges().filter((c) => c.queryType === 'esql');
    expect(challenges.length).toBeGreaterThan(0);

    const result = await (runner as unknown as {
      runEsqlChallenge: (c: typeof challenges[0]) => Promise<{ correct: boolean; feedback: string; score: number }>;
    }).runEsqlChallenge(challenges[0]);

    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
    expect(result.feedback).toMatch(/parsing_exception/i);
  });
});

// ---------------------------------------------------------------------------
// noHints flag in ES|QL prompts
// ---------------------------------------------------------------------------

describe('noHints flag in ES|QL prompts', () => {
  const challenge = getAllChallenges().find((c) => c.queryType === 'esql' && (c.esqlHints ?? c.hints).length > 0);

  it('includes hint text when noHints is false', () => {
    expect(challenge).toBeDefined();
    const config: BenchmarkConfig = { modelId: 'openai:test', language: 'esql', noHints: false };
    const mockModel = { name: 'test', provider: 'openai', complete: jest.fn() };
    const runner = new BenchmarkRunner(mockModel, config);
    const prompt = (runner as unknown as {
      buildEsqlUserPrompt: (c: NonNullable<typeof challenge>) => string;
    }).buildEsqlUserPrompt(challenge!);
    expect(prompt).toMatch(/HINTS:/i);
  });

  it('omits hint text when noHints is true', () => {
    expect(challenge).toBeDefined();
    const config: BenchmarkConfig = { modelId: 'openai:test', language: 'esql', noHints: true };
    const mockModel = { name: 'test', provider: 'openai', complete: jest.fn() };
    const runner = new BenchmarkRunner(mockModel, config);
    const prompt = (runner as unknown as {
      buildEsqlUserPrompt: (c: NonNullable<typeof challenge>) => string;
    }).buildEsqlUserPrompt(challenge!);
    expect(prompt).not.toMatch(/HINTS:/i);
  });
});
