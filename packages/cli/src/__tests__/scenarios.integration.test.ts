/**
 * Integration tests for the scenarios system.
 *
 * These tests require a running Elasticsearch instance.
 * They use start-local (Docker) to provision one automatically.
 *
 * Run with:   npm run test:integration -w packages/cli
 * Skip with:  npm test -w packages/cli   (only runs unit tests)
 *
 * What these tests verify:
 * 1. start-local can provision a real ES instance
 * 2. Generated data can be bulk-indexed into real ES
 * 3. ES|QL queries run correctly against real data
 * 4. Scenario validation logic works end-to-end
 * 5. The full scenario runner works with a mock model
 */

import { RealBackend } from '../elastic/real-backend';
import { startLocal } from '../elastic/start-local';
import type { StartLocalResult } from '../elastic/start-local';
import {
  generateArticles,
  articlesMapping,
  generateLogs,
  logsMapping,
  generateSecurityEvents,
  securityEventsMapping,
} from '../scenarios/generators';
import { getAllScenarios } from '../scenarios';
import { BenchmarkRunner } from '../benchmark/runner';
import type { BenchmarkConfig, ModelAdapter, ModelResponse } from '../benchmark/types';

jest.setTimeout(300000);

let localEs: StartLocalResult | undefined;
let backend: RealBackend | undefined;

beforeAll(async () => {
  try {
    localEs = await startLocal();
    backend = localEs.backend;
  } catch {
    console.warn(
      '\n  Skipping integration tests: Docker is not running.\n' +
        '  Start Docker and run: npm run test:integration -w packages/cli\n',
    );
  }
});

afterAll(async () => {
  if (backend) {
    await backend.reset();
  }
});

// Helper to skip tests when Docker is not available
function itWithDocker(name: string, fn: () => Promise<void>): void {
  it(name, async () => {
    if (!backend) {
      console.warn(`    [SKIPPED] ${name} — Docker not running`);
      return;
    }
    await fn();
  });
}

// ─── Data Indexing ───────────────────────────────────────────────────────

describe('Data Indexing into Real ES', () => {
  afterEach(async () => {
    if (backend) await backend.reset();
  });

  itWithDocker('should index articles and verify count', async () => {
    const articles = generateArticles(100, 42);
    await backend!.createIndex('eq-esql-articles', articlesMapping);
    await backend!.bulkIndex(
      articles.map((a) => ({
        index: 'eq-esql-articles',
        id: a._id,
        doc: a._source,
      })),
    );

    const count = await backend!.count('eq-esql-articles');
    expect(count).toBe(100);
  });

  itWithDocker('should index logs and verify count', async () => {
    const logs = generateLogs(200, 42);
    await backend!.createIndex('eq-obs-logs', logsMapping);
    await backend!.bulkIndex(
      logs.map((l) => ({
        index: 'eq-obs-logs',
        id: l._id,
        doc: l._source,
      })),
    );

    const count = await backend!.count('eq-obs-logs');
    expect(count).toBe(200);
  });

  itWithDocker('should index security events and verify count', async () => {
    const events = generateSecurityEvents(200, 42);
    await backend!.createIndex('eq-sec-events', securityEventsMapping);
    await backend!.bulkIndex(
      events.map((e) => ({
        index: 'eq-sec-events',
        id: e._id,
        doc: e._source,
      })),
    );

    const count = await backend!.count('eq-sec-events');
    expect(count).toBe(200);
  });
});

// ─── ES|QL Queries Against Real Data ─────────────────────────────────────

describe('ES|QL Queries on Real ES', () => {
  beforeAll(async () => {
    if (!backend) return;
    const articles = generateArticles(100, 42);
    await backend.createIndex('eq-esql-articles', articlesMapping);
    await backend.bulkIndex(
      articles.map((a) => ({
        index: 'eq-esql-articles',
        id: a._id,
        doc: a._source,
      })),
    );
  });

  afterAll(async () => {
    if (backend) await backend.reset();
  });

  itWithDocker('should run a basic FROM query', async () => {
    const result = await backend!.esql!(
      'FROM eq-esql-articles | LIMIT 5',
    );

    expect(result.columns).toBeDefined();
    expect(result.columns.length).toBeGreaterThan(0);
    expect(result.values).toBeDefined();
    expect(result.values.length).toBe(5);
  });

  itWithDocker('should run a WHERE filter query', async () => {
    const result = await backend!.esql!(
      'FROM eq-esql-articles | WHERE category == "technology" | LIMIT 100',
    );

    expect(result.values.length).toBeGreaterThan(0);
    const catIdx = result.columns.findIndex((c) => c.name === 'category');
    expect(catIdx).toBeGreaterThanOrEqual(0);
    for (const row of result.values) {
      expect(row[catIdx]).toBe('technology');
    }
  });

  itWithDocker('should run a STATS aggregation', async () => {
    const result = await backend!.esql!(
      'FROM eq-esql-articles | STATS count = COUNT(*) BY category | SORT count DESC',
    );

    expect(result.columns.length).toBe(2);
    expect(result.values.length).toBeGreaterThan(0);

    const countIdx = result.columns.findIndex((c) => c.name === 'count');
    const catIdx = result.columns.findIndex((c) => c.name === 'category');
    expect(countIdx).toBeGreaterThanOrEqual(0);
    expect(catIdx).toBeGreaterThanOrEqual(0);
    expect(result.values[0][catIdx]).toBe('technology');
  });

  itWithDocker('should run an EVAL + CASE query', async () => {
    const result = await backend!.esql!(
      'FROM eq-esql-articles ' +
        '| EVAL popularity = CASE(views >= 10000, "viral", views >= 5000, "popular", "normal") ' +
        '| KEEP title, views, popularity ' +
        '| SORT views DESC ' +
        '| LIMIT 5',
    );

    expect(result.columns.length).toBe(3);
    const popIdx = result.columns.findIndex((c) => c.name === 'popularity');
    const viewsIdx = result.columns.findIndex((c) => c.name === 'views');
    expect(popIdx).toBeGreaterThanOrEqual(0);

    for (const row of result.values) {
      const views = row[viewsIdx] as number;
      const pop = row[popIdx] as string;
      const expected = views >= 10000 ? 'viral' : views >= 5000 ? 'popular' : 'normal';
      expect(pop).toBe(expected);
    }
  });

  itWithDocker('should run a STATS with multiple aggregations', async () => {
    const result = await backend!.esql!(
      'FROM eq-esql-articles ' +
        '| STATS count = COUNT(*), avg_views = AVG(views), total_views = SUM(views) BY author ' +
        '| SORT total_views DESC ' +
        '| LIMIT 5',
    );

    expect(result.columns.length).toBe(4);
    expect(result.values.length).toBe(5);

    const totalIdx = result.columns.findIndex((c) => c.name === 'total_views');
    for (let i = 1; i < result.values.length; i++) {
      expect(result.values[i][totalIdx] as number).toBeLessThanOrEqual(
        result.values[i - 1][totalIdx] as number,
      );
    }
  });
});

// ─── Scenario Validation End-to-End ──────────────────────────────────────

describe('Scenario Validation E2E', () => {
  beforeAll(async () => {
    if (!backend) return;
    const articles = generateArticles(600, 42);
    await backend.createIndex('eq-esql-articles', articlesMapping);
    await backend.bulkIndex(
      articles.map((a) => ({
        index: 'eq-esql-articles',
        id: a._id,
        doc: a._source,
      })),
    );
  });

  afterAll(async () => {
    if (backend) await backend.reset();
  });

  itWithDocker(
    'should validate a correct ES|QL basic filter response',
    async () => {
      const scenario = getAllScenarios().find(
        (s) => s.id === 'esql-1-basic-filter',
      )!;
      expect(scenario).toBeDefined();

      const result = await backend!.esql!(
        'FROM eq-esql-articles ' +
          '| WHERE category == "technology" ' +
          '| KEEP title, category, views ' +
          '| SORT views DESC ' +
          '| LIMIT 10',
      );

      const validation = await scenario.validate(result, backend!);
      expect(validation.score).toBeGreaterThanOrEqual(80);
      expect(validation.correct).toBe(true);
    },
  );

  itWithDocker(
    'should validate a correct STATS aggregation response',
    async () => {
      const scenario = getAllScenarios().find(
        (s) => s.id === 'esql-2-stats-aggregation',
      )!;

      const result = await backend!.esql!(
        'FROM eq-esql-articles ' +
          '| STATS count = COUNT(*), avg_views = AVG(views) BY category ' +
          '| SORT count DESC',
      );

      const validation = await scenario.validate(result, backend!);
      expect(validation.score).toBeGreaterThanOrEqual(75);
      expect(validation.correct).toBe(true);
    },
  );

  itWithDocker(
    'should give low score for an incorrect query result',
    async () => {
      const scenario = getAllScenarios().find(
        (s) => s.id === 'esql-1-basic-filter',
      )!;

      const result = await backend!.esql!(
        'FROM eq-esql-articles | LIMIT 10',
      );

      const validation = await scenario.validate(result, backend!);
      expect(validation.score).toBeLessThan(80);
    },
  );
});

// ─── Full Scenario Runner with Mock Model ────────────────────────────────

describe('Scenario Runner E2E', () => {
  itWithDocker(
    'should run a scenario with a mock model that returns correct ES|QL',
    async () => {
      const mockModel: ModelAdapter = {
        name: 'mock-model',
        provider: 'test',
        complete: async (_prompt: string): Promise<ModelResponse> => {
          return {
            content:
              'FROM eq-esql-articles | WHERE category == "technology" | KEEP title, category, views | SORT views DESC | LIMIT 10',
            latencyMs: 500,
            inputTokens: 100,
            outputTokens: 30,
          };
        },
      };

      const config: BenchmarkConfig = {
        modelId: 'test:mock',
        backendMode: 'real',
        scenarioMode: true,
        domains: ['search'],
        difficulties: ['beginner'],
      };

      const runner = new BenchmarkRunner(mockModel, config, backend!);
      const result = await runner.runScenarios();

      expect(result.totalChallenges).toBeGreaterThan(0);
      expect(result.maxPossibleScore).toBeGreaterThan(0);
      expect(result.totalScore).toBeGreaterThan(0);
    },
  );
});
