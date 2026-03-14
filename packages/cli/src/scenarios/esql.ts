/**
 * ES|QL scenarios — aligned to the elasticsearch-esql skill.
 *
 * These scenarios test a model's ability to write correct ES|QL queries.
 * They require a real Elasticsearch backend (cloud or start-local).
 *
 * Data: 600 articles generated with realistic distributions across
 * categories, authors, dates, and view counts.
 */

import type { Scenario, EsqlResponse } from '../types';
import {
  generateArticles,
  getArticleFacts,
  articlesMapping,
  generateLogs,
  getLogFacts,
  logsMapping,
} from './generators';

// Generate data once at module load (deterministic seed = reproducible)
const articlesDocs = generateArticles(600, 42);
const articleFacts = getArticleFacts(articlesDocs);
const logsDocs = generateLogs(2500, 42);
const logFacts = getLogFacts(logsDocs);

// --- Helpers ---

function esqlHasColumn(resp: EsqlResponse, name: string): boolean {
  return resp.columns.some((c) => c.name === name);
}

function esqlColumnIndex(resp: EsqlResponse, name: string): number {
  return resp.columns.findIndex((c) => c.name === name);
}

function esqlGetValues(resp: EsqlResponse, columnName: string): unknown[] {
  const idx = esqlColumnIndex(resp, columnName);
  if (idx === -1) return [];
  return resp.values.map((row) => row[idx]);
}

// --- Scenarios ---

export const esqlScenarios: Scenario[] = [
  // 1. Basic FROM + WHERE + LIMIT
  {
    id: 'esql-1-basic-filter',
    skillId: 'elasticsearch-esql',
    domain: 'esql',
    difficulty: 'beginner',
    title: 'ES|QL Basic Filtering',
    description:
      'Write an ES|QL query to find all articles in the "technology" category. ' +
      'Return the title and category fields, sorted by views descending, limited to 10 results. ' +
      `The index contains ${articleFacts.totalCount} articles across ` +
      `${Object.keys(articleFacts.categoryBreakdown).length} categories.`,
    hints: [
      'Use FROM to specify the index',
      'Use WHERE to filter by category',
      'Use KEEP to select specific fields',
      'Use SORT and LIMIT for ordering and pagination',
    ],
    indexName: 'eq-esql-articles',
    seedData: articlesDocs,
    mapping: articlesMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['elasticsearch/elasticsearch-esql/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return { correct: false, score: 0, maxScore: 100, feedback: 'No ES|QL results returned.' };
      }

      let score = 0;
      const feedback: string[] = [];

      // Check columns include title
      if (esqlHasColumn(resp, 'title')) {
        score += 20;
      } else {
        feedback.push('Missing "title" column in results.');
      }

      // Check we only got technology articles
      const categories = esqlGetValues(resp, 'category');
      const allTech = categories.length > 0 && categories.every((c) => c === 'technology');
      if (allTech) {
        score += 30;
      } else {
        feedback.push('Results include non-technology articles.');
      }

      // Check limit (should be <= 10)
      if (resp.values.length <= 10 && resp.values.length > 0) {
        score += 20;
      } else {
        feedback.push(`Expected at most 10 results, got ${resp.values.length}.`);
      }

      // Check sort order (views descending)
      const views = esqlGetValues(resp, 'views');
      if (views.length > 1) {
        const sorted = views.every(
          (v, i) => i === 0 || (v as number) <= (views[i - 1] as number),
        );
        if (sorted) {
          score += 30;
        } else {
          feedback.push('Results not sorted by views descending.');
        }
      } else if (views.length > 0) {
        score += 15; // partial: only one result so can't verify sort
      }

      return {
        correct: score >= 80,
        score,
        maxScore: 100,
        feedback: score >= 80
          ? `Correct! Technology articles filtered and sorted from ${articleFacts.totalCount} total.`
          : feedback.join(' '),
      };
    },
  },

  // 2. STATS aggregation
  {
    id: 'esql-2-stats-aggregation',
    skillId: 'elasticsearch-esql',
    domain: 'esql',
    difficulty: 'beginner',
    title: 'ES|QL Stats Aggregation',
    description:
      'Write an ES|QL query to count the number of articles per category ' +
      'and compute the average views per category. Sort by count descending. ' +
      `There are ${Object.keys(articleFacts.categoryBreakdown).length} distinct categories.`,
    hints: [
      'Use STATS with COUNT(*) and AVG() functions',
      'Use BY to group by category',
      'Use SORT to order by count',
    ],
    indexName: 'eq-esql-articles',
    seedData: articlesDocs,
    mapping: articlesMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['elasticsearch/elasticsearch-esql/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return { correct: false, score: 0, maxScore: 100, feedback: 'No ES|QL results returned.' };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should have a count column
      const hasCount = resp.columns.some(
        (c) => c.name.toLowerCase().includes('count'),
      );
      if (hasCount) {
        score += 25;
      } else {
        feedback.push('Missing count column.');
      }

      // Should have an avg views column
      const hasAvg = resp.columns.some(
        (c) => c.name.toLowerCase().includes('avg') || c.name.toLowerCase().includes('views'),
      );
      if (hasAvg) {
        score += 25;
      } else {
        feedback.push('Missing average views column.');
      }

      // Should have category grouping
      if (esqlHasColumn(resp, 'category')) {
        score += 20;
      } else {
        feedback.push('Missing category grouping column.');
      }

      // Should have the right number of categories
      const expectedCategories = Object.keys(articleFacts.categoryBreakdown).length;
      if (resp.values.length === expectedCategories) {
        score += 15;
      } else {
        feedback.push(
          `Expected ${expectedCategories} categories, got ${resp.values.length}.`,
        );
        if (resp.values.length > 0) score += 5;
      }

      // Technology should be the top category (has 3x weight in generator)
      const categoryIdx = esqlColumnIndex(resp, 'category');
      if (categoryIdx >= 0 && resp.values.length > 0) {
        if (resp.values[0][categoryIdx] === 'technology') {
          score += 15;
        } else {
          feedback.push('Technology should be the top category by count.');
        }
      }

      return {
        correct: score >= 75,
        score,
        maxScore: 100,
        feedback: score >= 75
          ? 'Correct! Stats aggregation by category.'
          : feedback.join(' '),
      };
    },
  },

  // 3. EVAL computed fields
  {
    id: 'esql-3-eval-computed',
    skillId: 'elasticsearch-esql',
    domain: 'esql',
    difficulty: 'intermediate',
    title: 'ES|QL Computed Fields with EVAL',
    description:
      'Write an ES|QL query that creates a computed field called "popularity" ' +
      'which categorizes articles as "viral" if views >= 10000, "popular" if views >= 5000, ' +
      'or "normal" otherwise. Return title, views, and popularity. ' +
      'Sort by views descending. Limit to 20 results.',
    hints: [
      'Use EVAL with CASE() function to create conditional computed fields',
      'CASE(condition1, value1, condition2, value2, default_value)',
      'Use KEEP to select the output fields',
    ],
    indexName: 'eq-esql-articles',
    seedData: articlesDocs,
    mapping: articlesMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['elasticsearch/elasticsearch-esql/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return { correct: false, score: 0, maxScore: 100, feedback: 'No ES|QL results returned.' };
      }

      let score = 0;
      const feedback: string[] = [];

      // Has popularity column
      if (esqlHasColumn(resp, 'popularity')) {
        score += 25;
      } else {
        feedback.push('Missing "popularity" computed column.');
      }

      // Has title and views
      if (esqlHasColumn(resp, 'title')) score += 10;
      if (esqlHasColumn(resp, 'views')) score += 10;

      // Check popularity values are correct
      const popValues = esqlGetValues(resp, 'popularity');
      const viewValues = esqlGetValues(resp, 'views');
      if (popValues.length > 0 && viewValues.length > 0) {
        let correctClassifications = 0;
        for (let i = 0; i < popValues.length; i++) {
          const views = viewValues[i] as number;
          const pop = popValues[i] as string;
          const expected = views >= 10000 ? 'viral' : views >= 5000 ? 'popular' : 'normal';
          if (pop === expected) correctClassifications++;
        }
        const pct = correctClassifications / popValues.length;
        score += Math.round(pct * 55);
        if (pct < 1) {
          feedback.push(
            `${correctClassifications}/${popValues.length} articles correctly classified.`,
          );
        }
      }

      return {
        correct: score >= 80,
        score,
        maxScore: 100,
        feedback: score >= 80
          ? 'Correct! EVAL with CASE for conditional classification.'
          : feedback.join(' '),
      };
    },
  },

  // 4. Log analysis with WHERE and STATS (uses log data)
  {
    id: 'esql-4-log-error-analysis',
    skillId: 'elasticsearch-esql',
    domain: 'esql',
    difficulty: 'intermediate',
    title: 'ES|QL Log Error Analysis',
    description:
      'Write an ES|QL query to analyze the error logs. Count the number of error-level ' +
      'logs per service, and also compute the count of distinct HTTP status codes per service. ' +
      'Only include services that have at least one error. Sort by error count descending. ' +
      `The index contains ${logFacts.totalCount} log entries from 8 microservices.`,
    hints: [
      'Filter with WHERE log.level == "error"',
      'Use STATS with COUNT(*) and COUNT_DISTINCT()',
      'Group BY service.name',
    ],
    indexName: 'eq-obs-logs',
    seedData: logsDocs,
    mapping: logsMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['elasticsearch/elasticsearch-esql/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return { correct: false, score: 0, maxScore: 100, feedback: 'No ES|QL results returned.' };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should have service.name
      if (esqlHasColumn(resp, 'service.name')) {
        score += 20;
      } else {
        feedback.push('Missing service.name grouping.');
      }

      // Should have a count column
      const hasCount = resp.columns.some((c) => c.name.toLowerCase().includes('count'));
      if (hasCount) {
        score += 20;
      } else {
        feedback.push('Missing error count column.');
      }

      // Should include the incident services
      const services = esqlGetValues(resp, 'service.name');
      const hasPaymentGw = services.includes('payment-gateway');
      const hasCheckout = services.includes('checkout-service');
      if (hasPaymentGw && hasCheckout) {
        score += 30;
      } else if (hasPaymentGw || hasCheckout) {
        score += 15;
        feedback.push('Should include both payment-gateway and checkout-service.');
      } else {
        feedback.push('Expected to find payment-gateway and checkout-service errors.');
      }

      // payment-gateway should be the top error producer (incident source)
      const svcIdx = esqlColumnIndex(resp, 'service.name');
      if (svcIdx >= 0 && resp.values.length > 0) {
        if (resp.values[0][svcIdx] === 'payment-gateway') {
          score += 30;
        } else {
          score += 10;
          feedback.push(
            'payment-gateway should have the most errors (it is the incident source).',
          );
        }
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback: score >= 70
          ? 'Correct! Error analysis identifies incident services.'
          : feedback.join(' '),
      };
    },
  },

  // 5. Time-bucketed aggregation
  {
    id: 'esql-5-time-bucket',
    skillId: 'elasticsearch-esql',
    domain: 'esql',
    difficulty: 'advanced',
    title: 'ES|QL Time-Bucketed Log Analysis',
    description:
      'Write an ES|QL query to create a time-series histogram of log events. ' +
      'Bucket the logs by 5-minute intervals and count events per bucket. ' +
      'Also break down the count by log.level within each bucket. ' +
      'Sort by the time bucket ascending. ' +
      `The logs span from ${logFacts.incidentTimeRange.start.slice(0, 16)} ` +
      'covering 45 minutes of activity across 8 services.',
    hints: [
      'Use STATS with COUNT(*) and BY BUCKET(@timestamp, 5 minutes)',
      'Add log.level as a second BY dimension',
      'Use SORT on the bucket field',
    ],
    indexName: 'eq-obs-logs',
    seedData: logsDocs,
    mapping: logsMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 45000,
    skillPaths: ['elasticsearch/elasticsearch-esql/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return { correct: false, score: 0, maxScore: 100, feedback: 'No ES|QL results returned.' };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should have a time bucket column
      const hasBucket = resp.columns.some(
        (c) => c.name.includes('bucket') || c.name.includes('timestamp'),
      );
      if (hasBucket) {
        score += 25;
      } else {
        feedback.push('Missing time bucket column.');
      }

      // Should have log.level dimension
      if (esqlHasColumn(resp, 'log.level')) {
        score += 25;
      } else {
        feedback.push('Missing log.level dimension for breakdown.');
      }

      // Should have count
      const hasCount = resp.columns.some((c) => c.name.toLowerCase().includes('count'));
      if (hasCount) {
        score += 25;
      } else {
        feedback.push('Missing count aggregation.');
      }

      // Should have many rows (9 buckets x 3 levels minimum)
      if (resp.values.length >= 10) {
        score += 25;
      } else if (resp.values.length >= 5) {
        score += 15;
        feedback.push(`Expected many time bucket rows, got ${resp.values.length}.`);
      } else {
        feedback.push(`Expected many time bucket rows, got ${resp.values.length}.`);
      }

      return {
        correct: score >= 75,
        score,
        maxScore: 100,
        feedback: score >= 75
          ? 'Correct! Time-bucketed log analysis with level breakdown.'
          : feedback.join(' '),
      };
    },
  },

  // 6. Multi-turn: discover schema then query (articles data)
  {
    id: 'esql-6-discover-and-query',
    skillId: 'elasticsearch-esql',
    domain: 'esql',
    difficulty: 'advanced',
    title: 'ES|QL Discovery and Query',
    description:
      'Using your earlier analysis of the index, write an ES|QL query to find the ' +
      'top 5 authors by total views across all their articles. Return the author name, ' +
      'article count, and total views. Sort by total views descending.',
    hints: [
      'Use STATS to aggregate views per author',
      'COUNT(*) for article count, SUM() for total views',
      'SORT and LIMIT for top 5',
    ],
    indexName: 'eq-esql-articles',
    seedData: articlesDocs,
    mapping: articlesMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 60000,
    multiTurn: true,
    discoveryPrompt:
      'Examine this Elasticsearch index and describe its schema, field types, and ' +
      'the kind of data it contains. List all fields and note which are suitable for ' +
      'aggregation (keyword/numeric) vs full-text search (text). ' +
      `The index contains ${articleFacts.totalCount} documents.`,
    skillPaths: ['elasticsearch/elasticsearch-esql/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return { correct: false, score: 0, maxScore: 100, feedback: 'No ES|QL results returned.' };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should have author column
      if (esqlHasColumn(resp, 'author')) {
        score += 15;
      } else {
        feedback.push('Missing author column.');
      }

      // Should have 5 results
      if (resp.values.length === 5) {
        score += 15;
      } else if (resp.values.length > 0 && resp.values.length <= 7) {
        score += 8;
        feedback.push(`Expected 5 results, got ${resp.values.length}.`);
      } else {
        feedback.push(`Expected 5 results, got ${resp.values.length}.`);
      }

      // Check top author matches our precomputed facts
      const authorIdx = esqlColumnIndex(resp, 'author');
      const viewsIdx = resp.columns.findIndex(
        (c) =>
          c.name.toLowerCase().includes('views') ||
          c.name.toLowerCase().includes('total') ||
          c.name.toLowerCase().includes('sum'),
      );

      if (authorIdx >= 0 && viewsIdx >= 0 && resp.values.length >= 1) {
        const topAuthor = resp.values[0][authorIdx];
        if (topAuthor === articleFacts.topAuthorByViews.author) {
          score += 30;
        } else {
          feedback.push(
            `Top author by views should be ${articleFacts.topAuthorByViews.author}, got ${topAuthor}.`,
          );
          score += 10; // partial credit for working aggregation
        }

        // Check that there's a count column
        const countIdx = resp.columns.findIndex((c) =>
          c.name.toLowerCase().includes('count'),
        );
        if (countIdx >= 0) {
          score += 15;
        } else {
          feedback.push('Missing article count column.');
        }

        // Verify sort order (descending by total views)
        const allViews = resp.values.map((r) => r[viewsIdx] as number);
        const sorted = allViews.every(
          (v, i) => i === 0 || v <= allViews[i - 1],
        );
        if (sorted) {
          score += 25;
        } else {
          feedback.push('Results not sorted by total views descending.');
        }
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback: score >= 70
          ? 'Correct! Top authors by total views with multi-turn discovery.'
          : feedback.join(' '),
      };
    },
  },
];
