/**
 * Unit tests for the scenarios system:
 * - Data generators (volume, determinism, facts)
 * - Scenario registry (count, IDs, domains)
 * - ES|QL extraction from model responses
 * - Skill loader parsing
 *
 * These tests run without Docker or Elasticsearch.
 */

import {
  generateArticles,
  getArticleFacts,
  generateLogs,
  getLogFacts,
  generateSecurityEvents,
  getSecurityFacts,
} from '../scenarios/generators';
import {
  getAllScenarios,
  getScenariosByDomain,
  getScenariosBySkill,
} from '../scenarios';
import { BenchmarkRunner } from '../benchmark/runner';
import type { BenchmarkConfig } from '../benchmark/types';

// Helper: create a runner just to test extractEsql via reflection
function getExtractEsql(): (text: string) => string | null {
  const config: BenchmarkConfig = { modelId: 'test:model' };
  const mockModel = {
    name: 'test',
    provider: 'test',
    complete: async () => ({ content: '', latencyMs: 0 }),
  };
  const runner = new BenchmarkRunner(mockModel, config);
  return (runner as unknown as {
    extractEsql: (s: string) => string | null;
  }).extractEsql.bind(runner);
}

// ─── Data Generators ─────────────────────────────────────────────────────

describe('Article Generator', () => {
  const articles = generateArticles(600, 42);
  const facts = getArticleFacts(articles);

  it('should generate the requested number of articles', () => {
    expect(articles.length).toBe(600);
  });

  it('should be deterministic (same seed = same output)', () => {
    const articles2 = generateArticles(600, 42);
    const facts2 = getArticleFacts(articles2);
    expect(facts2.totalCount).toBe(facts.totalCount);
    expect(facts2.techCount).toBe(facts.techCount);
    expect(facts2.topAuthorByViews.author).toBe(facts.topAuthorByViews.author);
  });

  it('should produce different output with different seed', () => {
    const articles3 = generateArticles(600, 99);
    const facts3 = getArticleFacts(articles3);
    // Very unlikely to match with a different seed
    expect(facts3.topAuthorByViews.totalViews).not.toBe(
      facts.topAuthorByViews.totalViews,
    );
  });

  it('should have multiple categories with technology as the largest', () => {
    const categories = Object.keys(facts.categoryBreakdown);
    expect(categories.length).toBeGreaterThanOrEqual(5);
    expect(facts.categoryBreakdown['technology']).toBeDefined();

    // Technology should be the largest (3x weight in generator)
    const techCount = facts.categoryBreakdown['technology'];
    for (const [cat, count] of Object.entries(facts.categoryBreakdown)) {
      if (cat !== 'technology') {
        expect(techCount).toBeGreaterThan(count);
      }
    }
  });

  it('should have articles with all required fields', () => {
    for (const article of articles.slice(0, 20)) {
      expect(article._source.title).toBeDefined();
      expect(article._source.category).toBeDefined();
      expect(article._source.author).toBeDefined();
      expect(article._source.published_date).toBeDefined();
      expect(article._source.views).toBeDefined();
      expect(article._source.tags).toBeDefined();
      expect(typeof article._source.views).toBe('number');
      expect(Array.isArray(article._source.tags)).toBe(true);
    }
  });

  it('should have unique IDs', () => {
    const ids = new Set(articles.map((a) => a._id));
    expect(ids.size).toBe(articles.length);
  });
});

describe('Log Generator', () => {
  const logs = generateLogs(2500, 42);
  const facts = getLogFacts(logs);

  it('should generate the requested number of logs', () => {
    expect(logs.length).toBe(2500);
  });

  it('should have errors concentrated in incident services', () => {
    expect(facts.errorCount).toBeGreaterThan(30);
    expect(facts.serviceErrorCounts['payment-gateway']).toBeGreaterThan(10);
    expect(facts.serviceErrorCounts['checkout-service']).toBeGreaterThan(5);
  });

  it('should have the correct root cause message', () => {
    expect(facts.rootCauseMessage).toContain('ECONNREFUSED');
    expect(facts.rootCauseMessage).toContain('stripe-api');
  });

  it('should have logs from multiple services', () => {
    const services = new Set(
      logs.map((l) => l._source['service.name'] as string),
    );
    expect(services.size).toBeGreaterThanOrEqual(6);
  });

  it('should have logs with all required fields', () => {
    for (const log of logs.slice(0, 20)) {
      expect(log._source['@timestamp']).toBeDefined();
      expect(log._source['service.name']).toBeDefined();
      expect(log._source['log.level']).toBeDefined();
      expect(log._source['message']).toBeDefined();
      expect(log._source['host.name']).toBeDefined();
    }
  });

  it('should have logs sorted by timestamp', () => {
    for (let i = 1; i < logs.length; i++) {
      expect(
        (logs[i]._source['@timestamp'] as string) >=
          (logs[i - 1]._source['@timestamp'] as string),
      ).toBe(true);
    }
  });

  it('should have mostly info logs (noise) with fewer errors', () => {
    const levels: Record<string, number> = {};
    for (const log of logs) {
      const level = log._source['log.level'] as string;
      levels[level] = (levels[level] ?? 0) + 1;
    }
    expect(levels['info']).toBeGreaterThan(levels['error'] * 5);
  });
});

describe('Security Event Generator', () => {
  const events = generateSecurityEvents(1500, 42);
  const facts = getSecurityFacts(events);

  it('should generate the requested number of events', () => {
    expect(events.length).toBe(1500);
  });

  it('should have a brute force attack chain', () => {
    expect(facts.attackerIp).toBe('10.0.0.50');
    expect(facts.targetHost).toBe('dc-01');
    expect(facts.bruteForceAttempts).toBe(12);
  });

  it('should have post-compromise processes', () => {
    expect(facts.postCompromiseProcesses).toContain('curl');
    expect(facts.postCompromiseProcesses).toContain('bash');
    expect(facts.postCompromiseProcesses).toContain('cat');
  });

  it('should have C2 callback details', () => {
    expect(facts.c2Destination.ip).toBe('198.18.0.1');
    expect(facts.c2Destination.port).toBe(4444);
  });

  it('should have attack events present in the data', () => {
    // Verify the actual attack events exist
    const attackerEvents = events.filter(
      (e) => e._source['source.ip'] === '10.0.0.50',
    );
    expect(attackerEvents.length).toBeGreaterThan(12); // brute force + post-compromise

    const curlEvent = attackerEvents.find(
      (e) =>
        e._source['process.name'] === 'curl' &&
        String(e._source.message).includes('payload'),
    );
    expect(curlEvent).toBeDefined();

    const bashEvent = attackerEvents.find(
      (e) =>
        e._source['process.name'] === 'bash' &&
        String(e._source.message).includes('payload'),
    );
    expect(bashEvent).toBeDefined();
  });

  it('should have scanner noise (failed logins from various IPs)', () => {
    const failedAuths = events.filter(
      (e) =>
        e._source['event.category'] === 'authentication' &&
        e._source['event.outcome'] === 'failure' &&
        e._source['source.ip'] !== '10.0.0.50',
    );
    expect(failedAuths.length).toBeGreaterThan(20);

    // Scanners hit random hosts; the attacker concentrates on one host.
    // Verify attacker has ALL failures on a single host (dc-01),
    // while scanners are spread across multiple hosts.
    const attackerFailures = events.filter(
      (e) =>
        e._source['source.ip'] === '10.0.0.50' &&
        e._source['event.category'] === 'authentication' &&
        e._source['event.outcome'] === 'failure',
    );
    const attackerHosts = new Set(
      attackerFailures.map((e) => e._source['host.name']),
    );
    expect(attackerHosts.size).toBe(1); // all on dc-01
    expect(attackerHosts.has('dc-01')).toBe(true);

    // Scanners should hit multiple different hosts
    const scannerHosts = new Set(
      failedAuths.map((e) => e._source['host.name']),
    );
    expect(scannerHosts.size).toBeGreaterThan(3);
  });

  it('should have majority legitimate activity', () => {
    const legitimateAuth = events.filter(
      (e) =>
        e._source['event.category'] === 'authentication' &&
        e._source['event.outcome'] === 'success' &&
        e._source['source.ip'] !== '10.0.0.50',
    );
    expect(legitimateAuth.length).toBeGreaterThan(100);
  });
});

// ─── Scenario Registry ───────────────────────────────────────────────────

describe('Scenario Registry', () => {
  it('should have at least 12 scenarios', () => {
    const scenarios = getAllScenarios();
    expect(scenarios.length).toBeGreaterThanOrEqual(12);
  });

  it('should have unique scenario IDs', () => {
    const scenarios = getAllScenarios();
    const ids = scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should cover esql, observability, and security domains', () => {
    const domains = new Set(getAllScenarios().map((s) => s.domain));
    expect(domains).toContain('esql');
    expect(domains).toContain('observability');
    expect(domains).toContain('security');
  });

  it('should cover multiple difficulty levels', () => {
    const difficulties = new Set(getAllScenarios().map((s) => s.difficulty));
    expect(difficulties).toContain('beginner');
    expect(difficulties).toContain('intermediate');
    expect(difficulties).toContain('advanced');
    expect(difficulties).toContain('expert');
  });

  it('should filter by domain', () => {
    const esqlScenarios = getScenariosByDomain('esql');
    expect(esqlScenarios.length).toBeGreaterThan(0);
    expect(esqlScenarios.every((s) => s.domain === 'esql')).toBe(true);
  });

  it('should filter by skill', () => {
    const esqlSkill = getScenariosBySkill('elasticsearch-esql');
    expect(esqlSkill.length).toBeGreaterThan(0);
    expect(
      esqlSkill.every((s) => s.skillId === 'elasticsearch-esql'),
    ).toBe(true);
  });

  it('should have all scenarios with required fields', () => {
    for (const scenario of getAllScenarios()) {
      expect(scenario.id).toBeDefined();
      expect(scenario.skillId).toBeDefined();
      expect(scenario.domain).toBeDefined();
      expect(scenario.difficulty).toBeDefined();
      expect(scenario.title).toBeDefined();
      expect(scenario.description.length).toBeGreaterThan(20);
      expect(scenario.hints.length).toBeGreaterThan(0);
      expect(scenario.indexName).toBeDefined();
      expect(scenario.seedData.length).toBeGreaterThan(0);
      expect(['esql', 'query-dsl', 'api-call']).toContain(scenario.responseFormat);
      expect(scenario.validate).toBeInstanceOf(Function);
      expect(scenario.maxScore).toBe(100);
    }
  });

  it('should have seed data with substantial volume for esql scenarios', () => {
    for (const scenario of getAllScenarios()) {
      if (scenario.responseFormat === 'esql') {
        // ES|QL scenarios should use generators (hundreds of docs)
        expect(scenario.seedData.length).toBeGreaterThan(100);
      } else {
        // API-call scenarios use minimal placeholder data
        expect(scenario.seedData.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have multi-turn scenarios with discovery prompts', () => {
    const multiTurn = getAllScenarios().filter((s) => s.multiTurn);
    expect(multiTurn.length).toBeGreaterThanOrEqual(3);
    for (const s of multiTurn) {
      expect(s.discoveryPrompt).toBeDefined();
      expect(s.discoveryPrompt!.length).toBeGreaterThan(20);
    }
  });

  it('scenario IDs should not collide with challenge IDs', () => {
    const { getAllChallenges } = require('../challenges');
    const challengeIds = new Set(getAllChallenges().map((c: { id: string }) => c.id));
    const scenarioIds = getAllScenarios().map((s) => s.id);
    for (const id of scenarioIds) {
      expect(challengeIds.has(id)).toBe(false);
    }
  });
});

// ─── ES|QL Extraction ────────────────────────────────────────────────────

describe('ES|QL Extraction', () => {
  const extractEsql = getExtractEsql();

  it('should extract plain ES|QL query', () => {
    const query = 'FROM my-index | WHERE status == "active" | LIMIT 10';
    expect(extractEsql(query)).toBe(query);
  });

  it('should extract ES|QL from markdown code block', () => {
    const input = '```esql\nFROM logs-* | STATS count = COUNT(*) BY host\n```';
    expect(extractEsql(input)).toBe(
      'FROM logs-* | STATS count = COUNT(*) BY host',
    );
  });

  it('should extract ES|QL from generic code block', () => {
    const input = '```\nFROM logs-* | WHERE level == "error" | LIMIT 5\n```';
    expect(extractEsql(input)).toBe(
      'FROM logs-* | WHERE level == "error" | LIMIT 5',
    );
  });

  it('should extract ES|QL and strip trailing explanation', () => {
    const input =
      'FROM my-index\n| WHERE category == "tech"\n| SORT views DESC\n| LIMIT 10\n\nThis query filters...';
    const result = extractEsql(input);
    expect(result).toContain('FROM my-index');
    expect(result).toContain('LIMIT 10');
    expect(result).not.toContain('This query');
  });

  it('should handle TS prefix for time series', () => {
    const query = 'TS metrics-tsds | STATS SUM(RATE(requests)) BY TBUCKET(1 hour)';
    expect(extractEsql(query)).toBe(query);
  });

  it('should return null for non-ES|QL text', () => {
    expect(extractEsql('not an esql query at all')).toBeNull();
    expect(extractEsql('{"query": {"match_all": {}}}')).toBeNull();
  });

  it('should extract multi-line piped queries', () => {
    const input = 'FROM eq-esql-articles\n| WHERE category == "technology"\n| STATS count = COUNT(*) BY author\n| SORT count DESC\n| LIMIT 5';
    const result = extractEsql(input);
    expect(result).toContain('FROM eq-esql-articles');
    expect(result).toContain('LIMIT 5');
    expect(result).toContain('STATS');
  });
});

// ─── Skill Loader ────────────────────────────────────────────────────────

describe('Skill Loader', () => {
  // These tests verify parsing logic without needing actual skill files
  const { formatSkillForPrompt } = require('../skills/loader');
  const { loadSkill } = require('../skills/loader');

  it('should format skill content for prompt injection', () => {
    const mockSkill = {
      skillId: 'test-skill',
      skillMd: '---\nname: test\n---\n\n# Test Skill\n\nInstructions here.',
      references: [
        { path: 'references/ref.md', content: '# Reference\n\nSome reference content.' },
      ],
    };

    const formatted = formatSkillForPrompt(mockSkill);
    expect(formatted).toContain('--- SKILL: test-skill ---');
    expect(formatted).toContain('# Test Skill');
    expect(formatted).toContain('Instructions here.');
    expect(formatted).toContain('--- SKILL REFERENCES ---');
    expect(formatted).toContain('# Reference');
    expect(formatted).toContain('--- END SKILL ---');
    // Should strip frontmatter
    expect(formatted).not.toContain('name: test');
  });

  it('should format without references when disabled', () => {
    const mockSkill = {
      skillId: 'test-skill',
      skillMd: '---\nname: test\n---\n\n# Test Skill',
      references: [
        { path: 'ref.md', content: 'Reference content' },
      ],
    };

    const formatted = formatSkillForPrompt(mockSkill, {
      includeReferences: false,
    });
    expect(formatted).toContain('# Test Skill');
    expect(formatted).not.toContain('Reference content');
  });

  it('should truncate long references', () => {
    const longContent = 'x'.repeat(100000);
    const mockSkill = {
      skillId: 'test-skill',
      skillMd: '# Skill',
      references: [
        { path: 'ref.md', content: longContent },
      ],
    };

    const formatted = formatSkillForPrompt(mockSkill, {
      maxReferenceLength: 1000,
    });
    expect(formatted).toContain('[... truncated ...]');
    expect(formatted.length).toBeLessThan(longContent.length);
  });

  it('should return null for non-existent skill', () => {
    const result = loadSkill('nonexistent-skill-xyz', {
      skillsPath: '/tmp/does-not-exist',
    });
    expect(result).toBeNull();
  });
});
