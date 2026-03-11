import { SimulatedBackend } from '../elastic/simulated-backend';
import { GameEngine } from '../engine/game-engine';
import { getAllChallenges, getChallengesByDomain } from '../challenges';
import { BenchmarkRunner } from '../benchmark/runner';
import type { BenchmarkConfig } from '../benchmark/types';

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
  it('should have at least 49 challenges', () => {
    const challenges = getAllChallenges();
    expect(challenges.length).toBeGreaterThanOrEqual(49);
  });

  it('should cover all 6 domains', () => {
    const domains = new Set(getAllChallenges().map((c) => c.domain));
    expect(domains).toContain('full-text-search');
    expect(domains).toContain('ingest-indexing');
    expect(domains).toContain('aggregations');
    expect(domains).toContain('observability');
    expect(domains).toContain('vector-search');
    expect(domains).toContain('security');
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
});

describe('BenchmarkRunner', () => {
  it('should extract JSON from various response formats', () => {
    // Access private method via prototype for testing
    const config: BenchmarkConfig = { modelId: 'test:model' };
    const mockModel = {
      name: 'test',
      provider: 'test',
      complete: async () => ({ content: '', latencyMs: 0 }),
    };
    const runner = new BenchmarkRunner(mockModel, config);

    // Test extractJson via reflection
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
});
